/**
 * Z-Library Integration
 *
 * Z-Library requires authentication for downloads but search is available.
 * Mirror choice follows the cached source statuses (see source-status.ts).
 * Reference: https://github.com/sertraline/zlibrary
 */

import { getSourceStatusCache } from '@shelvarr/db';

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
    const searchUrl = `https://${getZLibraryDomain()}/s/${encodeURIComponent(query)}`;

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
  } catch (error) {
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

export default {
  searchZLibrary,
  getZLibrarySearchUrl,
  getZLibraryDomain,
  authenticateZLibrary,
};
