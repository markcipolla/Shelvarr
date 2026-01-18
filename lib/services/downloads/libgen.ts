/**
 * Library Genesis (LibGen) Integration
 *
 * LibGen has a JSON API for searching books.
 * Uses open-slum.org status to determine working mirrors.
 */

import { getSourceStatusCache } from '@/lib/db';

export interface LibGenResult {
  id: string;
  title: string;
  author: string;
  extension: string;
  size: string;
  md5: string;
  year?: string;
  language?: string;
  pages?: string;
  publisher?: string;
  isbn?: string;
  downloadUrl: string;
  searchUrl: string;
}

// LibGen source names from open-slum.org and their domains
const LIBGEN_SOURCES: Record<string, string> = {
  libgen_vg: 'libgen.vg',
  libgen_la: 'libgen.la',
  libgen_bz: 'libgen.bz',
  libgen_gl: 'libgen.gl',
};

// Fallback mirrors if status unavailable
const LIBGEN_FALLBACK = 'libgen.vg';

const DOWNLOAD_MIRRORS = [
  'library.lol',
  'download.library.lol',
] as const;

/**
 * Get the current working LibGen domain based on open-slum.org status
 */
export function getLibGenDomain(): string {
  try {
    const statuses = getSourceStatusCache();

    // Find a libgen source that's up
    for (const [source, domain] of Object.entries(LIBGEN_SOURCES)) {
      const status = statuses.find(s => s.source === source);
      if (status?.status === 'up') {
        return domain;
      }
    }

    // If none are up, try degraded
    for (const [source, domain] of Object.entries(LIBGEN_SOURCES)) {
      const status = statuses.find(s => s.source === source);
      if (status?.status === 'degraded') {
        return domain;
      }
    }
  } catch {
    // Ignore errors, use fallback
  }

  return LIBGEN_FALLBACK;
}

/**
 * Generate a search URL for LibGen
 */
export function getLibGenSearchUrl(query: string): string {
  const encoded = encodeURIComponent(query);
  return `https://${getLibGenDomain()}/index.php?req=${encoded}&lg_topic=libgen&open=0&view=simple&res=25&phrase=1&column=def`;
}

/**
 * Search LibGen using their JSON API
 */
export async function searchLibGen(
  query: string,
  options?: { isbn?: string }
): Promise<LibGenResult[]> {
  const results: LibGenResult[] = [];

  try {
    // If ISBN provided, search by ISBN instead of title
    const searchQuery = options?.isbn ? options.isbn.replace(/[-\s]/g, '') : query;
    const encoded = encodeURIComponent(searchQuery);

    // Get search results from the HTML search page
    const searchPageUrl = `https://${getLibGenDomain()}/index.php?req=${encoded}&lg_topic=libgen&open=0&view=simple&res=25&phrase=1&column=def`;

    const response = await fetch(searchPageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      console.warn(`LibGen search failed: ${response.status}`);
      return results;
    }

    const html = await response.text();

    // Parse book IDs from the search results page
    const idPattern = /href=['"]book\/index\.php\?md5=([a-f0-9]{32})['"]|md5=([a-f0-9]{32})/gi;
    const md5s: string[] = [];

    let match;
    while ((match = idPattern.exec(html)) !== null) {
      const md5 = match[1] || match[2];
      if (md5 && !md5s.includes(md5.toLowerCase())) {
        md5s.push(md5.toLowerCase());
      }
      if (md5s.length >= 15) break;
    }

    // For each MD5, create a result
    // Full details would require additional API calls
    // For now, parse from HTML table
    const rowPattern = /<tr[^>]*>[\s\S]*?<td[^>]*>(\d+)<\/td>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]*>([^<]*)<\/a>[\s\S]*?<td[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*>([^<]*)<\/td>[\s\S]*?md5=([a-f0-9]{32})/gi;

    while ((match = rowPattern.exec(html)) !== null) {
      const [, , authorRaw, titleRaw, publisherRaw, yearRaw, , extensionRaw, md5Raw] = match;
      const md5 = md5Raw ?? '';
      if (!md5) continue;

      results.push({
        id: md5,
        md5: md5.toLowerCase(),
        title: titleRaw?.trim() || 'Unknown',
        author: authorRaw?.trim() || 'Unknown',
        publisher: publisherRaw?.trim(),
        year: yearRaw?.trim(),
        extension: extensionRaw?.trim()?.toLowerCase() || 'pdf',
        size: 'Unknown',
        downloadUrl: getLibGenDownloadUrl(md5),
        searchUrl: getLibGenSearchUrl(query),
      });

      if (results.length >= 15) break;
    }

    // Simpler fallback pattern
    if (results.length === 0) {
      const simplePattern = /md5=([a-f0-9]{32})[^>]*>([^<]+)/gi;
      while ((match = simplePattern.exec(html)) !== null) {
        const [, md5Raw, titleRaw] = match;
        const md5 = md5Raw ?? '';
        const title = titleRaw ?? '';
        if (!md5) continue;
        if (title.length > 3 && !results.find(r => r.md5 === md5.toLowerCase())) {
          results.push({
            id: md5,
            md5: md5.toLowerCase(),
            title: title.trim(),
            author: 'Unknown',
            extension: 'pdf',
            size: 'Unknown',
            downloadUrl: getLibGenDownloadUrl(md5),
            searchUrl: getLibGenSearchUrl(query),
          });
          if (results.length >= 15) break;
        }
      }
    }
  } catch (error) {
    console.error('LibGen search error:', error);
  }

  return results;
}

/**
 * Get download URL for a book
 */
export function getLibGenDownloadUrl(md5: string): string {
  return `https://${DOWNLOAD_MIRRORS[0]}/main/${md5}`;
}

export default {
  searchLibGen,
  getLibGenSearchUrl,
  getLibGenDownloadUrl,
  getLibGenDomain,
};
