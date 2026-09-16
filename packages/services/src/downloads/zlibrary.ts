/**
 * Z-Library Integration
 *
 * Z-Library requires authentication for downloads but search is available.
 * Mirror choice follows the cached source statuses (see source-status.ts).
 * Reference: https://github.com/sertraline/zlibrary
 */

import { getSourceStatusCache, getDownloadSourceConfig, upsertDownloadSourceConfig } from '@shelvarr/db';
import {
  detectChallenge,
  SourceBlockedError,
  SourceParseError,
  recordParseSuccess,
  recordParseFailure,
} from './challenge';
import {
  LinkBrokenError,
  probeDownloadUrl,
  type ResolvedDownload,
} from '../utils/streaming-download';

// Re-exported so callers (and tests) can reach the download surface through
// this one module boundary, the same way they already do for search.
export { LinkBrokenError, type ResolvedDownload };

/**
 * Thrown by `resolveZlibraryDownload` when no usable Z-Library credentials
 * are configured (Settings -> Download Sources). Distinct from any network
 * or parsing failure so a caller can turn this into a clean "not
 * configured" failure instead of a crash.
 */
export class ZLibraryNotConfiguredError extends Error {
  constructor() {
    super('Z-Library credentials are not configured');
    this.name = 'ZLibraryNotConfiguredError';
  }
}

// A `<z-bookcard>` element (structured results) or a `/book/` link (the
// fallback pattern's target) means the page had a fair shot at matching one
// of the two parsers below. Neither present at all means the markup isn't
// what we expect — not that the search came back empty.
function looksLikeZLibraryResultsPage(html: string): boolean {
  return /<z-bookcard\b/i.test(html) || /href="\/book\//i.test(html);
}

export interface ZLibraryConfig {
  email?: string;
  password?: string;
  remix_userid?: string;
  remix_userkey?: string;
}

export interface ZLibraryResult {
  id: string;
  title: string;
  author: string;
  extension: string;
  size: string;
  year?: string;
  language?: string;
  downloadUrl?: string;
  searchUrl: string;
}

// Z-Library source names (as cached by the status service) and their domains
const ZLIB_SOURCES: Record<string, string> = {
  zlibrary: 'z-library.sk',
  zlib_gl: 'z-lib.gl',
};

// Fallback domain if status unavailable
const ZLIB_FALLBACK = 'z-library.sk';

// Login domain (separate from search)
const ZLIB_LOGIN_DOMAIN = 'singlelogin.re';

/**
 * Get the current working Z-Library domain based on cached source status
 */
export function getZLibraryDomain(): string {
  try {
    const statuses = getSourceStatusCache();

    // Find a zlibrary source that's up
    for (const [source, domain] of Object.entries(ZLIB_SOURCES)) {
      const status = statuses.find(s => s.source === source);
      if (status?.status === 'up') {
        return domain;
      }
    }

    // If none are up, try degraded
    for (const [source, domain] of Object.entries(ZLIB_SOURCES)) {
      const status = statuses.find(s => s.source === source);
      if (status?.status === 'degraded') {
        return domain;
      }
    }
  } catch {
    // Ignore errors, use fallback
  }

  return ZLIB_FALLBACK;
}

/**
 * Generate a search URL for Z-Library
 */
export function getZLibrarySearchUrl(query: string): string {
  const encoded = encodeURIComponent(query);
  return `https://${getZLibraryDomain()}/s/${encoded}`;
}

/**
 * Search Z-Library for books
 * Note: This uses web scraping as Z-Library doesn't have a public API
 */
export async function searchZLibrary(
  query: string,
  config?: ZLibraryConfig
): Promise<ZLibraryResult[]> {
  const results: ZLibraryResult[] = [];

  try {
    const domain = getZLibraryDomain();
    const searchUrl = `https://${domain}/s/${encodeURIComponent(query)}`;

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    };

    // Add auth cookies if provided
    if (config?.remix_userid && config?.remix_userkey) {
      headers['Cookie'] = `remix_userid=${config.remix_userid}; remix_userkey=${config.remix_userkey}`;
    }

    const response = await fetch(searchUrl, { headers, signal: AbortSignal.timeout(15000) });

    if (!response.ok) {
      console.warn(`Z-Library search failed: ${response.status}`);
      return results;
    }

    const html = await response.text();

    if (detectChallenge(html, response)) {
      throw new SourceBlockedError('zlibrary', `${domain} is behind a bot check right now`);
    }

    // Parse search results from HTML
    // Z-Library uses a specific HTML structure for book items
    const bookPattern = /<z-bookcard[^>]*data-id="(\d+)"[^>]*>[\s\S]*?<div class="title"[^>]*>([^<]+)<\/div>[\s\S]*?<div class="author"[^>]*>([^<]+)<\/div>/gi;

    let match;
    while ((match = bookPattern.exec(html)) !== null) {
      const [, idRaw, titleRaw, authorRaw] = match;
      const id = idRaw ?? '';
      const title = titleRaw ?? 'Unknown';
      const author = authorRaw ?? 'Unknown';
      if (!id) continue;

      results.push({
        id,
        title: title.trim(),
        author: author.trim(),
        extension: 'epub', // Default, actual extension requires detail page
        size: 'Unknown',
        searchUrl: getZLibrarySearchUrl(query),
        downloadUrl: config?.remix_userid
          ? `https://${getZLibraryDomain()}/book/${id}`
          : undefined,
      });

      if (results.length >= 10) break;
    }

    // Fallback: simpler pattern matching if structured parsing fails
    if (results.length === 0) {
      const simplePattern = /href="\/book\/(\d+)[^"]*"[^>]*>([^<]+)</gi;
      while ((match = simplePattern.exec(html)) !== null) {
        const [, idRaw, titleRaw] = match;
        const id = idRaw ?? '';
        const title = titleRaw ?? '';
        if (!id || title.length <= 5) continue;
        results.push({
          id,
          title: title.trim(),
          author: 'Unknown',
          extension: 'epub',
          size: 'Unknown',
          searchUrl: getZLibrarySearchUrl(query),
        });
        if (results.length >= 10) break;
      }
    }

    if (results.length === 0 && !looksLikeZLibraryResultsPage(html)) {
      recordParseFailure('zlibrary');
      throw new SourceParseError(
        'zlibrary',
        `${domain}'s page structure wasn't recognised — the Z-Library parser may need updating`
      );
    }

    recordParseSuccess('zlibrary');
  } catch (error) {
    if (error instanceof SourceBlockedError || error instanceof SourceParseError) throw error;
    console.error('Z-Library search error:', error);
  }

  return results;
}

/**
 * Authenticate with Z-Library to get session cookies
 */
export async function authenticateZLibrary(
  email: string,
  password: string
): Promise<{ remix_userid: string; remix_userkey: string } | null> {
  try {
    const loginUrl = `https://${ZLIB_LOGIN_DOMAIN}/rpc.php`;

    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: new URLSearchParams({
        isModal: 'true',
        email,
        password,
        site_mode: 'books',
        action: 'login',
        isSinglelogin: '1',
        redirectUrl: '',
        gg_json_mode: '1',
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn('Z-Library login failed:', response.status);
      return null;
    }

    // Extract cookies from response
    const cookies = response.headers.get('set-cookie');
    if (!cookies) return null;

    const useridMatch = cookies.match(/remix_userid=(\d+)/);
    const userkeyMatch = cookies.match(/remix_userkey=([^;]+)/);

    if (useridMatch?.[1] && userkeyMatch?.[1]) {
      return {
        remix_userid: useridMatch[1],
        remix_userkey: userkeyMatch[1],
      };
    }

    return null;
  } catch (error) {
    console.error('Z-Library authentication error:', error);
    return null;
  }
}

function getZlibraryStoredConfig(): ZLibraryConfig | null {
  const config = getDownloadSourceConfig('zlibrary');
  if (!config?.credentials) return null;
  try {
    return JSON.parse(config.credentials) as ZLibraryConfig;
  } catch {
    return null;
  }
}

/**
 * Get a usable Z-Library session, re-using cached `remix_userid`/
 * `remix_userkey` cookies from a previous `authenticateZLibrary` call
 * (stored alongside the email/password by `saveZLibraryCredentials` in
 * `download_source_config.credentials`) rather than logging in again on
 * every single download. If a session isn't already cached — the stored
 * config only has email/password, e.g. because the original login attempt
 * failed — this authenticates once and persists the result for next time.
 *
 * Returns null if there is nothing configured to authenticate with at all.
 */
async function getZlibrarySession(): Promise<{ remix_userid: string; remix_userkey: string } | null> {
  const config = getZlibraryStoredConfig();
  if (!config) return null;

  if (config.remix_userid && config.remix_userkey) {
    return { remix_userid: config.remix_userid, remix_userkey: config.remix_userkey };
  }

  if (!config.email || !config.password) return null;

  const session = await authenticateZLibrary(config.email, config.password);
  if (!session) return null;

  upsertDownloadSourceConfig('zlibrary', true, { ...config, ...session });
  return session;
}

/**
 * Z-Library's detail page ships its real download link behind a plain
 * anchor once the request carries a logged-in session's cookies. The
 * markup below targets the current `dlButton` anchor (checked either
 * attribute order, since minified markup can put `href` before or after
 * `class`), falling back to a bare `/dl/...` link elsewhere on the page.
 * This is a single reasonable pattern, not an exhaustive scrape — if
 * Z-Library's markup has moved on again, this needs updating the same way
 * `searchZLibrary`'s parser would.
 */
function findZlibraryDownloadPath(html: string): string | null {
  const dlButtonMatch =
    html.match(/class="[^"]*dlButton[^"]*"[^>]*href="([^"]+)"/i) ??
    html.match(/href="([^"]+)"[^>]*class="[^"]*dlButton[^"]*"/i);
  if (dlButtonMatch?.[1]) return dlButtonMatch[1];

  const fallbackMatch = html.match(/href="(\/dl\/[^"]+)"/i);
  return fallbackMatch?.[1] ?? null;
}

/**
 * Resolve a book's real download link via Z-Library.
 *
 * Unlike LibGen and Anna's Archive, a Z-Library search result's
 * `downloadUrl` is the book's *detail page*, not a file — this fetches that
 * page with an authenticated session's cookies, scrapes it for the real
 * download link, then probes that link the same way the other two sources
 * do. Z-Library downloads always require an account, so this throws
 * `ZLibraryNotConfiguredError` rather than returning an empty list when
 * there is nothing to authenticate with — a caller should treat that as a
 * clean, specific failure rather than "no mirrors resolved".
 */
export async function resolveZlibraryDownload(id: string): Promise<ResolvedDownload[]> {
  const session = await getZlibrarySession();
  if (!session) throw new ZLibraryNotConfiguredError();

  const domain = getZLibraryDomain();
  const detailUrl = `https://${domain}/book/${id}`;
  const cookie = `remix_userid=${session.remix_userid}; remix_userkey=${session.remix_userkey}`;

  const response = await fetch(detailUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Cookie': cookie,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    console.warn(`Z-Library detail page failed for book ${id}: ${response.status}`);
    return [];
  }

  const html = await response.text();
  if (detectChallenge(html, response)) {
    throw new SourceBlockedError('zlibrary', `${domain} is behind a bot check right now`);
  }

  const downloadPath = findZlibraryDownloadPath(html);
  if (!downloadPath) {
    console.error(`Could not find a download link on the Z-Library detail page for book ${id}`);
    return [];
  }

  const downloadUrl = downloadPath.startsWith('http') ? downloadPath : `https://${domain}${downloadPath}`;

  try {
    const candidate = await probeDownloadUrl(downloadUrl, {
      headers: { 'Cookie': cookie, 'Referer': detailUrl },
      fallbackFilename: `zlibrary-${id}.epub`,
    });
    return candidate ? [candidate] : [];
  } catch (error) {
    if (error instanceof LinkBrokenError) {
      console.warn(`Z-Library download link broken for book ${id}: ${error.message}`);
      return [];
    }
    throw error;
  }
}

export default {
  searchZLibrary,
  getZLibrarySearchUrl,
  getZLibraryDomain,
  authenticateZLibrary,
  resolveZlibraryDownload,
};
