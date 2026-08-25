/**
 * Search GetComics for releases.
 *
 * Derived from Kapowarr (GPL-3.0) `backend/features/search.py` and
 * `backend/implementations/getcomics.py` — see NOTICE.md.
 *
 * Transport differs from upstream: GetComics is WordPress and exposes an open
 * REST API, so one paginated JSON call returns both the search results *and*
 * each post's rendered body. Kapowarr scrapes up to ten HTML search pages and
 * then fetches every article separately.
 */

import type {
  ComicSearchResult,
  GetComicsPost,
  MatchedComicSearchResult,
} from '@shelvarr/types';
import { extractFilenameData, refineSpecialVersion } from './parse';
import { decodeHtmlEntities, normaliseQueryString, checkOverlappingIssues, forceRange } from './normalise';
import {
  checkSearchResultMatch,
  type SearchMatchContext,
  type VolumeIssueData,
  type VolumeMatchData,
} from './match';
import { sortSearchResults } from './rank';

const DEFAULT_BASE_URL = 'https://getcomics.org';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** WordPress caps `per_page` at 100. */
const MAX_PER_PAGE = 100;
const DEFAULT_PER_PAGE = 50;
const DEFAULT_MAX_PAGES = 2;
const REQUEST_TIMEOUT_MS = 30_000;
const TOTAL_RETRIES = 3;
const BACKOFF_BASE_MS = 1_000;
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

export interface GetComicsOptions {
  /** Override the site base URL (mirrors, or a test server). */
  baseUrl?: string;
  perPage?: number;
  maxPages?: number;
  signal?: AbortSignal;
}

/** Shape of the WordPress posts endpoint, restricted to the fields we ask for. */
interface WpPost {
  id: number;
  link: string;
  date: string;
  title: { rendered: string };
  content: { rendered: string };
}

async function fetchWithRetry(url: string, signal?: AbortSignal): Promise<Response> {
  let lastError: unknown;

  for (let round = 1; round <= TOTAL_RETRIES; round++) {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: combined,
      });
      if (!RETRY_STATUSES.has(response.status)) return response;
      lastError = new Error(`GetComics returned ${response.status}`);
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }

    if (round < TOTAL_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_BASE_MS * 2 ** (round - 1)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('GetComics request failed');
}

/**
 * Fetch raw posts matching a query, newest-first as WordPress orders them.
 * Returns an empty list rather than throwing when the site has nothing.
 */
export async function fetchPosts(
  query: string,
  options: GetComicsOptions = {}
): Promise<GetComicsPost[]> {
  const {
    baseUrl = DEFAULT_BASE_URL,
    perPage = DEFAULT_PER_PAGE,
    maxPages = DEFAULT_MAX_PAGES,
    signal,
  } = options;

  const posts: GetComicsPost[] = [];
  const pageSize = Math.min(perPage, MAX_PER_PAGE);

  for (let page = 1; page <= maxPages; page++) {
    const url =
      `${baseUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts` +
      `?search=${encodeURIComponent(query)}&per_page=${pageSize}&page=${page}` +
      `&_fields=id,title,link,date,content`;

    const response = await fetchWithRetry(url, signal);

    // WordPress answers 400 with code `rest_post_invalid_page_number` once you
    // walk past the last page — that's the end of the results, not an error.
    if (response.status === 400) break;
    if (!response.ok) {
      throw new Error(`GetComics search failed: ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as WpPost[];
    if (!Array.isArray(body) || body.length === 0) break;

    for (const post of body) {
      posts.push({
        id: post.id,
        title: decodeHtmlEntities(post.title?.rendered ?? ''),
        link: post.link,
        date: post.date,
        contentHtml: post.content?.rendered ?? '',
      });
    }

    const totalPages = parseInt(response.headers.get('X-WP-TotalPages') ?? '1', 10);
    if (!Number.isNaN(totalPages) && page >= totalPages) break;
    if (body.length < pageSize) break;
  }

  return posts;
}

/**
 * Fetch a single article by its public URL.
 *
 * WordPress permalinks end in the post slug, and the REST API can look a post
 * up by slug — so the UI only has to hand back the link it was shown.
 */
export async function fetchPostByLink(
  link: string,
  options: GetComicsOptions = {}
): Promise<GetComicsPost | null> {
  const { baseUrl = DEFAULT_BASE_URL, signal } = options;

  let slug: string;
  try {
    slug = new URL(link).pathname.split('/').filter(Boolean).pop() ?? '';
  } catch {
    return null;
  }
  if (!slug) return null;

  const url =
    `${baseUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts` +
    `?slug=${encodeURIComponent(slug)}&_fields=id,title,link,date,content`;

  const response = await fetchWithRetry(url, signal);
  if (!response.ok) return null;

  const body = (await response.json()) as WpPost[];
  const post = Array.isArray(body) ? body[0] : undefined;
  if (!post) return null;

  return {
    id: post.id,
    title: decodeHtmlEntities(post.title?.rendered ?? ''),
    link: post.link,
    date: post.date,
    contentHtml: post.content?.rendered ?? '',
  };
}

/** Turn a post into a search result by parsing what its title claims to be. */
export function postToSearchResult(post: GetComicsPost): ComicSearchResult {
  return {
    ...extractFilenameData(post.title, { assumeVolumeNumber: false, fixYear: true }),
    postId: post.id,
    link: post.link,
    displayTitle: post.title,
    source: 'getcomics',
  };
}

/**
 * Run several queries and merge the results, keeping the first occurrence of
 * each post. Queries run sequentially to stay polite to the site.
 */
export async function searchMultipleQueries(
  queries: string[],
  options: GetComicsOptions = {}
): Promise<GetComicsPost[]> {
  const seen = new Set<string>();
  const merged: GetComicsPost[] = [];

  for (const query of queries) {
    let posts: GetComicsPost[];
    try {
      posts = await fetchPosts(query, options);
    } catch {
      // One failed query shouldn't sink the whole search — the query ladder
      // exists precisely because some phrasings return nothing useful.
      continue;
    }
    for (const post of posts) {
      if (seen.has(post.link)) continue;
      seen.add(post.link);
      merged.push(post);
    }
  }

  return merged;
}

/**
 * The query ladder: broadest useful phrasing first, falling back to vaguer
 * ones. Mirrors Kapowarr's `QUERY_FORMATS`.
 */
export function buildQueries(
  volume: VolumeMatchData,
  issueNumber: string | null,
  title = volume.title
): string[] {
  const cleanTitle = normaliseQueryString(title).replace(/:/g, '');
  const volumeNumber = volume.volumeNumber ?? 1;
  const year = volume.year;

  let formats: string[];
  if (volume.specialVersion === 'tpb') {
    formats = [
      '{title} Vol. {volumeNumber} ({year}) TPB',
      '{title} ({year}) TPB',
      '{title} Vol. {volumeNumber} TPB',
      '{title} Vol. {volumeNumber}',
      '{title}',
    ];
  } else if (volume.specialVersion === 'volume-as-issue') {
    formats = ['{title} ({year})', '{title}'];
  } else if (issueNumber === null) {
    formats = [
      '{title} Vol. {volumeNumber} ({year})',
      '{title} ({year})',
      '{title} Vol. {volumeNumber}',
      '{title}',
    ];
  } else {
    formats = [
      '{title} #{issueNumber} ({year})',
      '{title} Vol. {volumeNumber} #{issueNumber}',
      '{title} #{issueNumber}',
      '{title}',
    ];
  }

  if (year === null) {
    formats = formats.map((format) => format.replace('({year})', '').trim());
  }

  return formats.map((format) =>
    format
      .replace('{title}', cleanTitle)
      .replace('{volumeNumber}', String(volumeNumber))
      .replace('{year}', String(year))
      .replace('{issueNumber}', issueNumber ?? '')
      .trim()
  );
}

export interface ManualSearchInput {
  volume: VolumeMatchData;
  issues: VolumeIssueData[];
  /** Set to search for a single issue rather than the whole volume. */
  issue?: { issueNumber: string; calculatedIssueNumber: number } | null;
  isBlocklisted?: (link: string) => boolean;
}

export interface ManualSearchOutput {
  results: MatchedComicSearchResult[];
  /** Posts keyed by link, so callers can build downloads without re-fetching. */
  posts: Map<string, GetComicsPost>;
}

/**
 * Search for a volume (or one of its issues) and return every result, ranked
 * best-first and annotated with whether it matches.
 *
 * Titles are tried in turn (main title, then alternate); the first that
 * returns anything wins, matching Kapowarr's behaviour.
 */
export async function manualSearch(
  input: ManualSearchInput,
  options: GetComicsOptions = {}
): Promise<ManualSearchOutput> {
  const { volume, issues, issue = null, isBlocklisted } = input;

  const numberToYear = new Map<number, number | null>(
    issues.map((i) => [i.calculatedIssueNumber, i.year])
  );

  const context: SearchMatchContext = {
    volume,
    issues,
    numberToYear,
    calculatedIssueNumber: issue?.calculatedIssueNumber ?? null,
    ...(isBlocklisted ? { isBlocklisted } : {}),
  };

  for (const title of [volume.title, volume.altTitle]) {
    if (!title) continue;

    const queries = buildQueries(volume, issue?.issueNumber ?? null, title);
    const posts = await searchMultipleQueries(queries, options);
    if (posts.length === 0) continue;

    const results = posts.map((post) =>
      checkSearchResultMatch(postToSearchResult(post), context)
    );

    sortSearchResults(results, {
      title: normaliseQueryString(title).replace(/:/g, ''),
      volumeNumber: volume.volumeNumber,
      year: [
        volume.year,
        issue ? numberToYear.get(issue.calculatedIssueNumber) ?? null : null,
      ],
      calculatedIssueNumber: issue?.calculatedIssueNumber ?? null,
    });

    return { results, posts: new Map(posts.map((post) => [post.link, post])) };
  }

  return { results: [], posts: new Map() };
}

export interface AutoSearchInput extends ManualSearchInput {
  /** Skip the search entirely when the volume isn't monitored. */
  monitored?: boolean;
}

export interface AutoSearchOutput {
  /** The releases chosen, in the order they should be downloaded. */
  chosen: MatchedComicSearchResult[];
  /** Every post seen during the search, so downloads need no second fetch. */
  posts: Map<string, GetComicsPost>;
}

/**
 * Search and pick results automatically: for a volume, choose a combination of
 * releases that covers the most missing issues without overlapping; for a
 * single issue, take the best match.
 *
 * Derived from Kapowarr's `auto_search`.
 */
export async function autoSearch(
  input: AutoSearchInput,
  options: GetComicsOptions = {}
): Promise<AutoSearchOutput> {
  const { volume, issues, issue = null, monitored = true } = input;

  // Which issues do we actually still want?
  let searchable: VolumeIssueData[];
  if (!monitored) {
    searchable = [];
  } else if (issue === null) {
    searchable = issues.filter((i) => i.monitored && !i.hasFile);
  } else {
    searchable = issues.filter(
      (i) =>
        i.calculatedIssueNumber === issue.calculatedIssueNumber && i.monitored && !i.hasFile
    );
  }
  if (searchable.length === 0) return { chosen: [], posts: new Map() };

  const { results, posts } = await manualSearch(input, options);
  const matches = results.filter((result) => result.match);

  const isSingleTarget =
    issue !== null ||
    (volume.specialVersion !== null && volume.specialVersion !== 'volume-as-issue');
  if (isSingleTarget) return { chosen: matches.slice(0, 1), posts };

  // Volume search: assemble a non-overlapping set covering as much as possible.
  const sortedIssues = [...issues].sort(
    (a, b) => a.calculatedIssueNumber - b.calculatedIssueNumber
  );
  const wanted = new Set(searchable.map((i) => i.calculatedIssueNumber));
  const chosen: MatchedComicSearchResult[] = [];

  for (const raw of matches) {
    // A "Volume 2" release of a volume-as-issue series is really issue 2, and
    // a vague "TPB" is really whatever we know the volume to be.
    const result = refineSpecialVersion(
      { specialVersion: volume.specialVersion, volumeNumber: volume.volumeNumber },
      raw
    );

    let covered: VolumeIssueData[];
    let issueNumber = result.issueNumber;

    if (result.specialVersion !== null) {
      issueNumber = 1;
      covered = sortedIssues;
    } else if (issueNumber !== null) {
      const [start, end] = forceRange(issueNumber);
      covered = sortedIssues.filter(
        (i) => start <= i.calculatedIssueNumber && i.calculatedIssueNumber <= end
      );
    } else {
      continue;
    }

    // Skip anything that would re-download an issue we already have.
    if (covered.some((i) => !wanted.has(i.calculatedIssueNumber))) continue;

    const overlaps = chosen.some(
      (part) =>
        part.issueNumber !== null &&
        issueNumber !== null &&
        checkOverlappingIssues(part.issueNumber, issueNumber)
    );
    if (!overlaps) chosen.push({ ...result, issueNumber });
  }

  // Anything still uncovered may only show up on a per-issue search.
  const missing = searchable.filter(
    (i) =>
      !chosen.some(
        (part) =>
          part.issueNumber !== null &&
          checkOverlappingIssues(part.issueNumber, i.calculatedIssueNumber)
      )
  );

  for (const missingIssue of missing) {
    const extra = await autoSearch(
      {
        ...input,
        issue: {
          issueNumber: String(missingIssue.calculatedIssueNumber),
          calculatedIssueNumber: missingIssue.calculatedIssueNumber,
        },
      },
      options
    );
    chosen.push(...extra.chosen);
    for (const [link, post] of extra.posts) posts.set(link, post);
  }

  return { chosen, posts };
}
