/**
 * Anna's Archive Integration
 *
 * Anna's Archive is a search engine for shadow libraries.
 * They have a public search interface.
 */

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

const ANNAS_DOMAIN = 'annas-archive.org';

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

  return `https://${ANNAS_DOMAIN}/search?${params.toString()}`;
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

    const searchUrl = `https://${ANNAS_DOMAIN}/search?${params.toString()}`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      console.warn(`Anna's Archive search failed: ${response.status}`);
      return results;
    }

    const html = await response.text();

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
        downloadUrl: `https://${ANNAS_DOMAIN}/md5/${md5}`,
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
          downloadUrl: `https://${ANNAS_DOMAIN}/md5/${md5}`,
          searchUrl: getAnnasSearchUrl(query),
        });
        if (results.length >= 15) break;
      }
    }
  } catch (error) {
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
    const detailUrl = `https://${ANNAS_DOMAIN}/md5/${md5}`;

    const response = await fetch(detailUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      return links;
    }

    const html = await response.text();

    // Extract download links
    const linkPattern = /href="(https?:\/\/[^"]+(?:download|get)[^"]*)"/gi;
    let match;
    while ((match = linkPattern.exec(html)) !== null) {
      const link = match[1];
      if (link) links.push(link);
    }
  } catch (error) {
    console.error("Anna's Archive download links error:", error);
  }

  return links;
}

export default {
  searchAnnas,
  getAnnasSearchUrl,
  getAnnasDownloadLinks,
};
