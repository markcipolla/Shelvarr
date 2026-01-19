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

    // LibGen+ uses a table with id="tablelibgen"
    // Each row: Title/Series | Author | Publisher | Year | Language | Pages | Size | Ext | Mirrors
    // Parse each table row
    const rowPattern = /<tr>\s*<td><b>([^<]+)<[\s\S]*?<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td[^>]*><[^>]*>([^<]*)<[\s\S]*?<\/td>\s*<td>([^<]*)<\/td>\s*<td>[\s\S]*?md5=([a-f0-9]{32})/gi;

    let match;
    while ((match = rowPattern.exec(html)) !== null) {
      const [, titleRaw, authorRaw, publisherRaw, yearRaw, langRaw, pagesRaw, sizeRaw, extRaw, md5Raw] = match;
      const md5 = md5Raw ?? '';
      if (!md5) continue;

      // Clean up the title (remove series number prefix like "Children of Time 2")
      let title = titleRaw?.trim() || 'Unknown';
      // Remove trailing series indicators
      title = title.replace(/\s+\d+\s*$/, '').trim();

      results.push({
        id: md5,
        md5: md5.toLowerCase(),
        title,
        author: authorRaw?.trim() || 'Unknown',
        publisher: publisherRaw?.trim(),
        year: yearRaw?.trim(),
        language: langRaw?.trim(),
        pages: pagesRaw?.trim(),
        extension: extRaw?.trim()?.toLowerCase() || 'pdf',
        size: sizeRaw?.trim() || 'Unknown',
        downloadUrl: getLibGenDownloadUrl(md5),
        searchUrl: getLibGenSearchUrl(query),
      });

      if (results.length >= 15) break;
    }

    // Fallback: simpler pattern if table parsing fails
    if (results.length === 0) {
      // Extract MD5 and nearby title from mirror links
      const fallbackPattern = /<td><b>([^<]+)<[\s\S]*?md5=([a-f0-9]{32})/gi;
      while ((match = fallbackPattern.exec(html)) !== null) {
        const [, titleRaw, md5Raw] = match;
        const md5 = md5Raw ?? '';
        const title = titleRaw?.trim() || '';
        if (!md5 || !title) continue;
        if (!results.find(r => r.md5 === md5.toLowerCase())) {
          results.push({
            id: md5,
            md5: md5.toLowerCase(),
            title,
            author: 'Unknown',
            extension: 'unknown',
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
 * Get download page URL for a book (user clicks through to get actual download)
 */
export function getLibGenDownloadUrl(md5: string): string {
  return `https://${getLibGenDomain()}/ads.php?md5=${md5}`;
}

export default {
  searchLibGen,
  getLibGenSearchUrl,
  getLibGenDownloadUrl,
  getLibGenDomain,
};
