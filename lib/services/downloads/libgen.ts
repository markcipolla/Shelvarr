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
  return `https://${getLibGenDomain()}/search.php?req=${encoded}&lg_topic=libgen&open=0&view=simple&res=25&phrase=1&column=def`;
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
    // Use the JSON API if searching by ISBN
    if (options?.isbn) {
      const apiResults = await searchLibGenByIsbn(options.isbn);
      if (apiResults.length > 0) {
        return apiResults;
      }
    }

    // Otherwise use the search API
    const encoded = encodeURIComponent(query);

    // Get search results from the HTML search page
    const searchPageUrl = `https://${getLibGenDomain()}/search.php?req=${encoded}&lg_topic=libgen&open=0&view=simple&res=25&phrase=1&column=def`;

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
 * Search LibGen by ISBN using JSON API
 */
async function searchLibGenByIsbn(isbn: string): Promise<LibGenResult[]> {
  const results: LibGenResult[] = [];

  try {
    const cleanIsbn = isbn.replace(/[-\s]/g, '');
    const apiUrl = `https://${getLibGenDomain()}/json.php?isbn=${cleanIsbn}&fields=*`;

    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return results;
    }

    const data = await response.json();

    if (Array.isArray(data)) {
      for (const book of data) {
        results.push({
          id: book.id || book.md5,
          md5: book.md5?.toLowerCase() || '',
          title: book.title || 'Unknown',
          author: book.author || 'Unknown',
          extension: book.extension?.toLowerCase() || 'pdf',
          size: book.filesize ? formatFileSize(parseInt(book.filesize)) : 'Unknown',
          year: book.year,
          language: book.language,
          pages: book.pages,
          publisher: book.publisher,
          isbn: book.identifier,
          downloadUrl: getLibGenDownloadUrl(book.md5),
          searchUrl: getLibGenSearchUrl(isbn),
        });
      }
    }
  } catch (error) {
    console.error('LibGen ISBN search error:', error);
  }

  return results;
}

/**
 * Get download URL for a book
 */
export function getLibGenDownloadUrl(md5: string): string {
  return `https://${DOWNLOAD_MIRRORS[0]}/main/${md5}`;
}

/**
 * Format file size from bytes to human readable
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default {
  searchLibGen,
  getLibGenSearchUrl,
  getLibGenDownloadUrl,
  getLibGenDomain,
};
