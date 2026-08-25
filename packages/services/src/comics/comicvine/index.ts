/**
 * ComicVine metadata client.
 *
 * Derived from Kapowarr (GPL-3.0) `backend/implementations/comicvine.py` —
 * see NOTICE.md. Field lists, batching and the description cleaner follow
 * upstream; the HTTP layer is `fetch` rather than aiohttp.
 *
 * ComicVine rate-limits to roughly 200 requests per hour per resource, so
 * requests are spaced by `BRAKE_TIME_MS` and issue pages are fetched in small
 * concurrent batches with a pause between them. Getting this wrong means an
 * hour-long lockout, so the defaults are deliberately gentle.
 */

import type {
  ComicIssueMetadata,
  ComicVineDateType,
  ComicVolumeMetadata,
} from '@shelvarr/types';

import { createLogger } from '../../utils/logger';
import { extractIssueNumber, extractVolumeNumber } from '../getcomics/parse';
import { forceRange, normaliseString, normaliseYear } from '../getcomics/normalise';

const log = createLogger('comicvine');

const API_URL = 'https://comicvine.gamespot.com/api';
const SITE_URL = 'https://comicvine.gamespot.com';

/** Minimum gap between requests. Upstream uses 1s. */
const BRAKE_TIME_MS = 1_000;
/** How many issue pages to request at once before pausing. */
const CONCURRENT_REQUESTS = 5;
const REQUEST_TIMEOUT_MS = 30_000;
/** ComicVine returns at most 100 results per page. */
const PAGE_SIZE = 100;

const VOLUME_FIELDS = [
  'aliases', 'count_of_issues', 'deck', 'description', 'id', 'image',
  'issues', 'name', 'publisher', 'site_detail_url', 'start_year',
].join(',');

const ISSUE_FIELDS = [
  'id', 'issue_number', 'name', 'cover_date', 'store_date', 'description',
  'volume',
].join(',');

const SEARCH_FIELDS = [
  'aliases', 'count_of_issues', 'deck', 'description', 'id', 'image', 'name',
  'publisher', 'site_detail_url', 'start_year',
].join(',');

/** ComicVine's own `status_code` values, which it returns inside a 200. */
const CV_OK = 1;
const CV_INVALID_API_KEY = 100;
const CV_OBJECT_NOT_FOUND = 101;
const CV_RATE_LIMIT = 107;

// region Errors
export class InvalidComicVineApiKeyError extends Error {
  constructor() {
    super('The ComicVine API key is not valid');
    this.name = 'InvalidComicVineApiKeyError';
  }
}

export class ComicVineRateLimitError extends Error {
  constructor() {
    super('ComicVine rate limit reached; try again in an hour');
    this.name = 'ComicVineRateLimitError';
  }
}

export class VolumeNotMatchedError extends Error {
  constructor(readonly cvId: string | number) {
    super(`No ComicVine volume with id ${cvId}`);
    this.name = 'VolumeNotMatchedError';
  }
}
// endregion

// region Helpers
/**
 * Normalise a ComicVine id to the `4050-1234` form the `/volume/` endpoint
 * wants. Accepts `1234`, `"4050-1234"` or `"cv:1234"`.
 */
export function toFullComicVineId(id: string | number): string {
  const text = String(id).trim().toLowerCase().replace(/^cv:/, '');
  const bare = text.startsWith('4050-') ? text.slice(5) : text;
  if (!/^\d+$/.test(bare)) throw new VolumeNotMatchedError(id);
  return `4050-${bare}`;
}

/** The bare numeric part of a ComicVine id. */
export function toComicVineId(id: string | number): string {
  return toFullComicVineId(id).slice(5);
}

const headerTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const listTags = ['ul', 'ol'];

/**
 * Trim a ComicVine description down to the useful prose.
 *
 * Upstream walks a BeautifulSoup tree; we work on the markup directly, which
 * covers the same three cases: drop images, drop empty paragraphs, and (for
 * the long form) cut everything from the first heading or credits list
 * onwards, since that's where the "List of issues"/"Collected editions"
 * boilerplate starts.
 */
export function cleanDescription(description: string | null, short = false): string {
  if (!description) return '';

  let html = description
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, '')
    .replace(/<img\b[^>]*\/?>/gi, '')
    .replace(/<p\b[^>]*>(?:\s|\.|&nbsp;|<br\s*\/?>)*<\/p>/gi, '');

  if (!short) {
    const cutPoints = [...headerTags, ...listTags]
      .map((tag) => {
        const match = new RegExp(`<${tag}\\b`, 'i').exec(html);
        return match ? match.index : -1;
      })
      .filter((index) => index !== -1);

    if (cutPoints.length > 0) {
      html = html.slice(0, Math.min(...cutPoints));
      // A list is usually introduced by a trailing "Collected editions:" line;
      // drop that too so the description doesn't end mid-sentence.
      html = html.replace(/<p\b[^>]*>[^<]*:\s*<\/p>\s*$/i, '');
    }
  }

  // ComicVine emits site-relative links.
  html = html.replace(/(href|src)="\/(?!\/)/gi, `$1="${SITE_URL}/`);

  return html.trim();
}

const volumeNumberRegex = /\b(?:(?:v(?:ol|olume))(?:\.\s|[.\-\s])?|v)(\d+)/i;
const translationRegex = /^(?:a\s)?translat(?:ed|ion)/i;

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
// endregion

export interface ComicVineOptions {
  apiKey: string;
  /** Which date field to use for issue release dates. */
  dateType?: ComicVineDateType;
  /** Override the API base URL — used by tests. */
  baseUrl?: string;
  signal?: AbortSignal;
}

interface CvResponse<T> {
  status_code: number;
  error: string;
  number_of_total_results: number;
  results: T;
}

/**
 * A ComicVine session. Construct one per operation; it carries the pacing
 * state that keeps us under the rate limit.
 */
export class ComicVine {
  private readonly apiKey: string;
  private readonly dateType: ComicVineDateType;
  private readonly baseUrl: string;
  private readonly signal: AbortSignal | undefined;
  private nextRequestAt = 0;

  constructor(options: ComicVineOptions) {
    if (!options.apiKey) throw new InvalidComicVineApiKeyError();
    this.apiKey = options.apiKey;
    this.dateType = options.dateType ?? 'cover_date';
    this.baseUrl = (options.baseUrl ?? API_URL).replace(/\/$/, '');
    this.signal = options.signal;
  }

  /** Space requests out so a burst can't trip the hourly limit. */
  private async brake(): Promise<void> {
    const wait = this.nextRequestAt - Date.now();
    this.nextRequestAt = Math.max(Date.now(), this.nextRequestAt) + BRAKE_TIME_MS;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }

  private async call<T>(
    path: string,
    params: Record<string, string | number> = {}
  ): Promise<CvResponse<T>> {
    await this.brake();

    const url = new URL(`${this.baseUrl}/${path.replace(/^\/|\/$/g, '')}/`);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('format', 'json');
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = this.signal ? AbortSignal.any([this.signal, timeout]) : timeout;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': 'Shelvarr', Accept: 'application/json' },
        signal,
      });
    } catch (error) {
      if (this.signal?.aborted) throw error;
      throw new ComicVineRateLimitError();
    }

    if (response.status === 420 || response.status === 429) {
      throw new ComicVineRateLimitError();
    }
    if (!response.ok) {
      throw new Error(`ComicVine returned ${response.status} ${response.statusText}`);
    }

    let body: CvResponse<T>;
    try {
      body = (await response.json()) as CvResponse<T>;
    } catch {
      // ComicVine serves an HTML error page when it throttles.
      throw new ComicVineRateLimitError();
    }

    switch (body.status_code) {
      case CV_RATE_LIMIT:
        throw new ComicVineRateLimitError();
      case CV_OBJECT_NOT_FOUND:
        throw new VolumeNotMatchedError(String(params['filter'] ?? path));
      case CV_INVALID_API_KEY:
        throw new InvalidComicVineApiKeyError();
      default:
        if (body.status_code !== CV_OK) {
          throw new Error(`ComicVine error ${body.status_code}: ${body.error}`);
        }
        return body;
    }
  }

  /** Verify an API key by making the cheapest possible call. */
  async testKey(): Promise<boolean> {
    try {
      await this.call('publishers', { field_list: 'id', limit: 1 });
      return true;
    } catch (error) {
      if (error instanceof InvalidComicVineApiKeyError) return false;
      throw error;
    }
  }

  private formatVolume(raw: Record<string, unknown>): ComicVolumeMetadata {
    const deck = (raw['deck'] as string | null) ?? '';
    const deckMatch = volumeNumberRegex.exec(deck);
    let volumeNumber = 1;
    if (deckMatch?.[1]) {
      const extracted = extractVolumeNumber(deckMatch[1]);
      if (extracted !== null) volumeNumber = forceRange(extracted)[0];
    }

    const description = cleanDescription((raw['description'] as string | null) ?? null);
    const image = raw['image'] as { small_url?: string } | null;

    return {
      comicvineId: Number(raw['id']),
      title: normaliseString((raw['name'] as string | null) ?? ''),
      year: normaliseYear(String(raw['start_year'] ?? '')),
      volumeNumber,
      publisher: ((raw['publisher'] as { name?: string } | null) ?? {}).name ?? null,
      description,
      coverLink: image?.small_url ?? null,
      siteUrl: (raw['site_detail_url'] as string | null) ?? '',
      aliases: String(raw['aliases'] ?? '')
        .split(/\r?\n/)
        .map((alias) => alias.trim())
        .filter(Boolean),
      issueCount: Number(raw['count_of_issues'] ?? 0),
      translated: translationRegex.test(stripTags(description)),
      issues: null,
    };
  }

  private formatIssue(raw: Record<string, unknown>): ComicIssueMetadata {
    const printed = String(raw['issue_number'] ?? '').replace(/\//g, '-').trim();
    const extracted = extractIssueNumber(printed);
    const calculated = extracted === null ? 0 : forceRange(extracted)[0];

    return {
      comicvineId: Number(raw['id']),
      volumeComicvineId: Number((raw['volume'] as { id?: number } | null)?.id ?? 0),
      issueNumber: printed,
      calculatedIssueNumber: calculated,
      title: normaliseString((raw['name'] as string | null) ?? '') || null,
      date: (raw[this.dateType] as string | null) || null,
      description: cleanDescription((raw['description'] as string | null) ?? null, true),
    };
  }

  /** Fetch a volume and all of its issues. */
  async fetchVolume(cvId: string | number): Promise<ComicVolumeMetadata> {
    const fullId = toFullComicVineId(cvId);
    log.info('Fetching volume', { cvId: fullId });

    const response = await this.call<Record<string, unknown>>(`volume/${fullId}`, {
      field_list: VOLUME_FIELDS,
    });

    const volume = this.formatVolume(response.results);
    volume.issues = await this.fetchIssues([cvId]);
    return volume;
  }

  /** Fetch several volumes at once, without their issues. */
  async fetchVolumes(cvIds: Array<string | number>): Promise<ComicVolumeMetadata[]> {
    if (cvIds.length === 0) return [];
    const ids = cvIds.map(toComicVineId);
    const volumes: ComicVolumeMetadata[] = [];

    for (let offset = 0; offset < ids.length; offset += PAGE_SIZE) {
      const batch = ids.slice(offset, offset + PAGE_SIZE);
      const response = await this.call<Array<Record<string, unknown>>>('volumes', {
        field_list: VOLUME_FIELDS,
        filter: `id:${batch.join('|')}`,
      });
      volumes.push(...response.results.map((raw) => this.formatVolume(raw)));
    }

    return volumes;
  }

  /**
   * Fetch every issue of the given volumes.
   *
   * The first page also tells us the total, so subsequent pages go out in
   * small concurrent batches rather than one at a time.
   */
  async fetchIssues(cvIds: Array<string | number>): Promise<ComicIssueMetadata[]> {
    if (cvIds.length === 0) return [];

    const ids = cvIds.map(toComicVineId);
    const issues: ComicIssueMetadata[] = [];

    // 50 volume ids per filter keeps the query string within CV's limits.
    for (let start = 0; start < ids.length; start += 50) {
      const filter = `volume:${ids.slice(start, start + 50).join('|')}`;

      const first = await this.call<Array<Record<string, unknown>>>('issues', {
        field_list: ISSUE_FIELDS,
        filter,
      });
      issues.push(...first.results.map((raw) => this.formatIssue(raw)));

      const total = first.number_of_total_results ?? 0;
      if (total <= PAGE_SIZE) continue;

      const offsets: number[] = [];
      for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) offsets.push(offset);

      for (let index = 0; index < offsets.length; index += CONCURRENT_REQUESTS) {
        const batch = offsets.slice(index, index + CONCURRENT_REQUESTS);
        const pages = await Promise.all(
          batch.map((offset) =>
            this.call<Array<Record<string, unknown>>>('issues', {
              field_list: ISSUE_FIELDS,
              filter,
              offset,
            }).catch((error: unknown) => {
              // A partial issue list beats failing the whole refresh; the next
              // scheduled refresh will fill in the gap.
              log.warn('Issue page failed', { offset, error });
              return null;
            })
          )
        );

        for (const page of pages) {
          if (!page) continue;
          issues.push(...page.results.map((raw) => this.formatIssue(raw)));
        }
      }
    }

    return issues;
  }

  /**
   * Search for volumes. A query that looks like a ComicVine id (`4050-1234`,
   * `cv:1234`) fetches that volume directly instead.
   */
  async searchVolumes(query: string): Promise<ComicVolumeMetadata[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    log.info('Searching volumes', { query: trimmed });

    if (/^(4050-|cv:)/i.test(trimmed)) {
      try {
        const response = await this.call<Record<string, unknown>>(
          `volume/${toFullComicVineId(trimmed)}`,
          { field_list: SEARCH_FIELDS }
        );
        return [this.formatVolume(response.results)];
      } catch (error) {
        if (error instanceof VolumeNotMatchedError) return [];
        throw error;
      }
    }

    const response = await this.call<Array<Record<string, unknown>>>('search', {
      query: trimmed,
      resources: 'volume',
      limit: 50,
      field_list: SEARCH_FIELDS,
    });

    return response.results.map((raw) => this.formatVolume(raw));
  }

  /** Download a volume cover. Returns null rather than throwing. */
  async fetchCover(coverLink: string | null): Promise<Buffer | null> {
    if (!coverLink) return null;
    try {
      const response = await fetch(coverLink, {
        headers: { 'User-Agent': 'Shelvarr' },
        ...(this.signal ? { signal: this.signal } : {}),
      });
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    } catch {
      return null;
    }
  }
}
