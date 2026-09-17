/**
 * Anna's Archive Integration
 *
 * Anna's Archive is a search engine for shadow libraries.
 * Uses the cached source statuses (see source-status.ts) to check availability.
 */

import { getDownloadSourceConfig } from '@shelvarr/db';
import { anyMirrorReachable, preferredMirrorDomain } from './mirrors';
import {
  detectChallenge,
  SourceBlockedError,
  SourceParseError,
  recordParseSuccess,
  recordParseFailure,
} from './challenge';
import {
  LinkBrokenError,
  fetchProbe,
  buildResolvedDownload,
  type ResolvedDownload,
} from '../utils/streaming-download';
import { parseRetryAfter } from '../utils/pacing';
import { SourceLimitReachedError, defaultLimitMs } from './source-limits';

// Re-exported so callers (and tests) can reach the download surface through
// this one module boundary, the same way they already do for search.
export { LinkBrokenError, type ResolvedDownload };

// Cheap, best-effort signals that a response is *some* Anna's Archive
// results page — with or without matches — rather than unrecognised markup.
// Anything found here means the primary/alternative patterns below had a
// fair shot at matching; if they still found nothing, that's a genuine empty
// result set, not a broken parser.
const ANNAS_STRUCTURE_MARKERS = [
  /href="\/md5\//i,
  /data-md5="/i,
  /class="[^"]*search-results[^"]*"/i,
];

function looksLikeAnnasResultsPage(html: string): boolean {
  return ANNAS_STRUCTURE_MARKERS.some((marker) => marker.test(html));
}

export interface AnnasResult {
  id: string;
  title: string;
  author: string;
  extension: string;
  size: string;
  source: string; // libgen, zlib, ia, etc.
  language?: string;
  year?: string;
  downloadUrl: string;
  searchUrl: string;
}

// Last-resort domain for a server with no mirrors configured at all. Also
// the tie-break when no mirror has been probed yet, which is why it is .li
// and not the higher-priority .org.
const ANNAS_FALLBACK = 'annas-archive.li';

/**
 * Get the current working Anna's Archive domain.
 *
 * Mirrors come from the `source_mirrors` table (E1-1), read fresh on every
 * call, so one added in Settings is usable immediately.
 */
export function getAnnasDomain(): string {
  return preferredMirrorDomain('annas', ANNAS_FALLBACK);
}

/**
 * Check if Anna's Archive is available based on cached mirror health.
 * Not being able to tell counts as available — a source is never hidden on
 * the strength of a missing status row.
 */
export function isAnnasAvailable(): boolean {
  return anyMirrorReachable('annas', true);
}

/**
 * Generate a search URL for Anna's Archive
 */
export function getAnnasSearchUrl(query: string, fileType?: string): string {
  const params = new URLSearchParams({
    q: query,
  });

  if (fileType) {
    params.set('ext', fileType);
  }

  return `https://${getAnnasDomain()}/search?${params.toString()}`;
}

/**
 * Search Anna's Archive for books
 */
export async function searchAnnas(
  query: string,
  options?: { fileType?: string; language?: string }
): Promise<AnnasResult[]> {
  const results: AnnasResult[] = [];

  try {
    const params = new URLSearchParams({
      q: query,
    });

    if (options?.fileType) {
      params.set('ext', options.fileType);
    }

    if (options?.language) {
      params.set('lang', options.language);
    }

    const domain = getAnnasDomain();
    const searchUrl = `https://${domain}/search?${params.toString()}`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`Anna's Archive search failed: ${response.status}`);
      return results;
    }

    const html = await response.text();

    if (detectChallenge(html, response)) {
      throw new SourceBlockedError('annas', `${domain} is behind a bot check right now`);
    }

    // Parse search results from HTML
    // Anna's Archive has a specific structure for results
    // Each result is in a div with class containing "search-result" or similar

    // Pattern to match book entries (simplified)
    const bookPattern = /href="\/md5\/([a-f0-9]{32})"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>[\s\S]*?<div[^>]*>([^<]*)<\/div>/gi;

    let match;
    while ((match = bookPattern.exec(html)) !== null) {
      const [, md5Raw, titleRaw, meta] = match;
      const md5 = md5Raw ?? '';
      const title = titleRaw ?? 'Unknown';

      // Extract author from meta if available
      const authorMatch = meta?.match(/by\s+([^,]+)/i);
      const author = authorMatch?.[1]?.trim() ?? 'Unknown';

      // Extract extension from meta
      const extMatch = meta?.match(/\b(epub|pdf|mobi|azw3|djvu)\b/i);
      const extension = extMatch?.[1]?.toLowerCase() ?? 'unknown';

      // Extract size from meta
      const sizeMatch = meta?.match(/(\d+(?:\.\d+)?\s*(?:KB|MB|GB))/i);
      const size = sizeMatch?.[1] ?? 'Unknown';

      if (!md5) continue;

      results.push({
        id: md5,
        title: title.trim(),
        author,
        extension,
        size,
        source: 'annas',
        downloadUrl: `https://${getAnnasDomain()}/md5/${md5}`,
        searchUrl: getAnnasSearchUrl(query),
      });

      if (results.length >= 15) break;
    }

    // Alternative pattern for newer page structure
    if (results.length === 0) {
      const altPattern = /data-md5="([a-f0-9]{32})"[\s\S]*?class="[^"]*title[^"]*"[^>]*>([^<]+)/gi;
      while ((match = altPattern.exec(html)) !== null) {
        const [, md5Raw, titleRaw] = match;
        const md5 = md5Raw ?? '';
        const title = titleRaw ?? 'Unknown';
        if (!md5) continue;
        results.push({
          id: md5,
          title: title.trim(),
          author: 'Unknown',
          extension: 'unknown',
          size: 'Unknown',
          source: 'annas',
          downloadUrl: `https://${getAnnasDomain()}/md5/${md5}`,
          searchUrl: getAnnasSearchUrl(query),
        });
        if (results.length >= 15) break;
      }
    }

    if (results.length === 0 && !looksLikeAnnasResultsPage(html)) {
      recordParseFailure('annas');
      throw new SourceParseError(
        'annas',
        `${domain}'s page structure wasn't recognised — the Anna's Archive parser may need updating`
      );
    }

    recordParseSuccess('annas');
  } catch (error) {
    if (error instanceof SourceBlockedError || error instanceof SourceParseError) throw error;
    console.error("Anna's Archive search error:", error);
  }

  return results;
}

/**
 * Get download links for a specific book by MD5
 */
export async function getAnnasDownloadLinks(md5: string): Promise<string[]> {
  const links: string[] = [];

  try {
    const domain = getAnnasDomain();
    const detailUrl = `https://${domain}/md5/${md5}`;

    const response = await fetch(detailUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15000),
    });

    // Anna's free tier is a waitlist: once it says no, it says no to every
    // book, so this is the source's limit rather than this link's (E1-6).
    if (response.status === 429) {
      throw annasLimitReached(response);
    }

    if (!response.ok) {
      return links;
    }

    const html = await response.text();

    if (detectChallenge(html, response)) {
      throw new SourceBlockedError('annas', `${domain} is behind a bot check right now`);
    }

    // Extract download links
    const linkPattern = /href="(https?:\/\/[^"]+(?:download|get)[^"]*)"/gi;
    let match;
    while ((match = linkPattern.exec(html)) !== null) {
      const link = match[1];
      if (link) links.push(link);
    }
  } catch (error) {
    if (error instanceof SourceBlockedError) throw error;
    if (error instanceof SourceLimitReachedError) throw error;
    console.error("Anna's Archive download links error:", error);
  }

  return links;
}

/**
 * Turn a refusal from Anna's Archive into a deadline for the whole source.
 *
 * Honours `Retry-After` when it's there; without one the free tier's
 * waitlist is day-scoped, so `defaultLimitMs` waits until the daily reset
 * rather than guessing at minutes.
 */
function annasLimitReached(response: Response): SourceLimitReachedError {
  const retryAfterMs = parseRetryAfter(response.headers.get('retry-after')) ?? defaultLimitMs('annas');
  return new SourceLimitReachedError('annas', retryAfterMs);
}

/** Anna's Archive credentials as stored in `download_source_config.credentials`. */
export interface AnnasConfig {
  /** Member API key — see https://annas-archive.org/faq#api. */
  apiKey?: string;
}

function getAnnasCredentials(): AnnasConfig | null {
  const config = getDownloadSourceConfig('annas');
  if (!config?.credentials) return null;
  try {
    return JSON.parse(config.credentials) as AnnasConfig;
  } catch {
    return null;
  }
}

/**
 * Probe one candidate download URL, distinguishing a bot-check page from an
 * ordinary dead link before deciding which error to raise — unlike the
 * generic `probeDownloadUrl` (used by LibGen, which has no notion of a
 * challenge page), an HTML response here is inspected with `detectChallenge`
 * rather than treated as broken outright.
 *
 * @throws SourceBlockedError when the response looks like a Cloudflare (or
 * similar) challenge page.
 * @throws LinkBrokenError when it's HTML but not a challenge — a dead link,
 * an error page, a login wall.
 */
async function probeAnnasCandidate(url: string, md5: string): Promise<ResolvedDownload | null> {
  const response = await fetchProbe(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!response) return null;

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('text/html')) {
    const html = await response.text().catch(() => '');
    if (detectChallenge(html, response)) {
      throw new SourceBlockedError('annas', `${getAnnasDomain()} is behind a bot check right now`);
    }
    throw new LinkBrokenError(url, 'Candidate served HTML instead of a file');
  }

  await response.arrayBuffer().catch(() => undefined);
  return buildResolvedDownload(response, url, `${md5}.epub`);
}

/**
 * Resolve a book's real download link(s) via Anna's Archive.
 *
 * Anna's Archive's member "fast download" API
 * (`/dyn/api/fast_download.json`) is the reliable, not-Cloudflare-gated path
 * once an operator has configured an API key in Settings — it hands back a
 * direct file URL with no scraping at all. Without a key (the default),
 * this falls back to `getAnnasDownloadLinks`, which scrapes the free detail
 * page for anything that looks like a download link: noisier, more likely
 * to hit a Cloudflare challenge, but usable with no account.
 *
 * Every candidate this finds — from either path — is still only probed for
 * headers, never its file body, and every one that resolves is returned (not
 * just the first) so a caller can fall through the list on a later
 * mid-stream failure, the same shape `resolveLibgenDownloads` already gives
 * LibGen.
 */
export async function resolveAnnasDownload(md5: string): Promise<ResolvedDownload[]> {
  const resolved: ResolvedDownload[] = [];
  const credentials = getAnnasCredentials();

  if (credentials?.apiKey) {
    try {
      const domain = getAnnasDomain();
      const apiUrl = `https://${domain}/dyn/api/fast_download.json?md5=${md5}&key=${encodeURIComponent(credentials.apiKey)}`;
      const response = await fetch(apiUrl, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { download_url?: string; error?: string }
          | null;

        if (body?.download_url) {
          const candidate = await probeAnnasCandidate(body.download_url, md5);
          if (candidate) resolved.push(candidate);
        } else if (body?.error) {
          console.warn(`Anna's Archive fast_download API error for ${md5}: ${body.error}`);
        }
      } else if (response.status === 429) {
        // The membership's daily fast-download allowance is spent. Falling
        // through to the free path would only queue behind the same account.
        throw annasLimitReached(response);
      } else {
        console.warn(`Anna's Archive fast_download API failed: ${response.status}`);
      }
    } catch (error) {
      if (error instanceof SourceLimitReachedError) throw error;
      console.error(`Anna's Archive fast_download API error for ${md5}:`, error);
    }
  }

  if (resolved.length > 0) return resolved;

  // Free path: scrape the detail page for candidate links (noisy,
  // unfiltered — see getAnnasDownloadLinks) and probe each one. A
  // SourceBlockedError from either the detail-page scrape or a candidate
  // probe is allowed to propagate — a bot check on this domain isn't "this
  // one link didn't work", it's "nothing here will work right now".
  const candidates = await getAnnasDownloadLinks(md5);
  for (const link of candidates) {
    try {
      const candidate = await probeAnnasCandidate(link, md5);
      if (candidate) resolved.push(candidate);
    } catch (error) {
      if (error instanceof SourceBlockedError) throw error;
      if (error instanceof LinkBrokenError) {
        console.warn(`Anna's Archive candidate link broken for ${md5}: ${error.message}`);
        continue;
      }
      console.error(`Error probing Anna's Archive candidate for ${md5}:`, error);
    }
  }

  if (resolved.length === 0) console.error("Could not resolve an Anna's Archive download for", md5);
  return resolved;
}

export default {
  searchAnnas,
  getAnnasSearchUrl,
  getAnnasDownloadLinks,
  resolveAnnasDownload,
};
