/**
 * Library Genesis (LibGen) Integration
 *
 * LibGen has a JSON API for searching books.
 * Uses open-slum.org status to determine working mirrors.
 */

import { getSourceStatusCache } from '@shelvarr/db';

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

    // LibGen+ table structure (first cell layout, 2026):
    //   <td>
    //     [optional <b>Series Name N<a href="edition.php?id=...">...</a></b><br>]
    //     <a href="edition.php?id=...">Title <i>...</i></a>
    //     <br><a href="edition.php?id=..."><i><font color="green">ISBNs</font></i></a>
    //     ...badges...
    //   </td>
    //   <td>Author</td> <td>Publisher</td> <td><nobr>Year</nobr></td>
    //   <td>Language</td> <td>Pages</td>
    //   <td><nobr><a>Size</a></nobr></td> <td>ext</td>
    //   <td>...md5=XXX...</td>

    // Find all table rows that contain book data (have md5 links)
    const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;

    while ((rowMatch = rowPattern.exec(html)) !== null) {
      const rowHtml = rowMatch[1] || '';

      // Must have MD5 to be a valid result row
      const md5Match = rowHtml.match(/md5=([a-f0-9]{32})/i);
      if (!md5Match) continue;

      const md5 = md5Match[1]!.toLowerCase();

      // Extract all <td> contents
      const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells: string[] = [];
      let tdMatch;

      while ((tdMatch = tdPattern.exec(rowHtml)) !== null) {
        cells.push(tdMatch[1] || '');
      }

      // Need at least 8 cells for a valid row
      if (cells.length < 8) continue;

      // Helper to strip HTML and clean text
      const stripHtml = (html: string) => {
        return html
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, ' ')
          .trim();
      };

      // Extract title from first cell. Preferred source is the first
      // <a href="edition.php?id=..."> link with non-empty visible text —
      // that holds the actual title. When a series is present the <b> tag
      // wraps the series name + issue number (not the title), so we skip it.
      // Anchor on `href=` rather than `<a ...href=` because the preceding
      // `title="…"` attribute may contain a literal `<br>`, which breaks a
      // naive `<a[^>]*` match.
      let title = 'Unknown';
      const firstCell = cells[0] || '';
      const editionLinkPattern = /href="[^"]*edition\.php[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
      let linkMatch;
      while ((linkMatch = editionLinkPattern.exec(firstCell)) !== null) {
        const text = stripHtml(linkMatch[1] || '');
        if (text) {
          title = text;
          break;
        }
      }
      // Fallback for older table formats where title lived in <b>…</b>.
      if (title === 'Unknown') {
        const boldMatch = firstCell.match(/<b>([^<]+)/i);
        if (boldMatch) {
          title = boldMatch[1]!.trim().replace(/\s+\d+\s*$/, '').trim();
        }
      }

      // Extract size from cell that contains MB/KB
      let size = 'Unknown';
      const sizeCell = cells.find(c => /\d+\s*(MB|KB|GB)/i.test(c));
      if (sizeCell) {
        const sizeMatch = sizeCell.match(/(\d+\s*(MB|KB|GB))/i);
        if (sizeMatch) size = sizeMatch[1]!;
      }

      // Extension is typically the cell before md5 cell, or look for common extensions
      let extension = 'pdf';
      const extCell = cells.find(c => /^(epub|pdf|mobi|azw3?|djvu|fb2|txt|doc|rtf)$/i.test(stripHtml(c)));
      if (extCell) extension = stripHtml(extCell).toLowerCase();

      // Clean author, publisher, etc. using stripHtml
      const author = stripHtml(cells[1] || '') || 'Unknown';
      const publisher = stripHtml(cells[2] || '');
      const yearRaw = stripHtml(cells[3] || '');
      const year = yearRaw.replace(/\D/g, '');
      const language = stripHtml(cells[4] || '');
      const pages = stripHtml(cells[5] || '');

      results.push({
        id: md5,
        md5,
        title,
        author,
        publisher: publisher || undefined,
        year: year || undefined,
        language: language || undefined,
        pages: pages || undefined,
        size,
        extension,
        downloadUrl: getLibGenDownloadUrl(md5),
        searchUrl: getLibGenSearchUrl(query),
      });

      if (results.length >= 15) break;
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

/**
 * Get the actual direct download URL by scraping the ads.php page
 * Returns the get.php URL with the required key parameter
 */
export async function getActualDownloadUrl(md5: string): Promise<string | null> {
  try {
    const adsUrl = `https://${getLibGenDomain()}/ads.php?md5=${md5}`;

    const response = await fetch(adsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      console.warn(`LibGen ads page fetch failed: ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Look for the GET link: href="get.php?md5=XXX&key=YYY"
    const getPattern = /href="(get\.php\?md5=[a-f0-9]+&key=[^"]+)"/i;
    const match = html.match(getPattern);

    if (match?.[1]) {
      return `https://${getLibGenDomain()}/${match[1]}`;
    }

    // Fallback: look for any direct download link
    const directPattern = /href="(https?:\/\/[^"]+\/get[^"]+)"/i;
    const directMatch = html.match(directPattern);

    if (directMatch?.[1]) {
      return directMatch[1];
    }

    return null;
  } catch (error) {
    console.error('Error getting actual download URL:', error);
    return null;
  }
}

/**
 * Download a file from LibGen and return the buffer and filename
 */
export async function downloadFile(md5: string): Promise<{
  buffer: Buffer;
  filename: string;
  contentType: string;
} | null> {
  try {
    const downloadUrl = await getActualDownloadUrl(md5);
    if (!downloadUrl) {
      console.error('Could not get download URL for', md5);
      return null;
    }

    const response = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      console.warn(`LibGen download failed: ${response.status}`);
      return null;
    }

    // Get filename from Content-Disposition header or URL
    const contentDisposition = response.headers.get('content-disposition');
    let filename = `${md5}.epub`; // Default

    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (filenameMatch?.[1]) {
        filename = filenameMatch[1].replace(/['"]/g, '');
      }
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return { buffer, filename, contentType };
  } catch (error) {
    console.error('Error downloading file:', error);
    return null;
  }
}

export default {
  searchLibGen,
  getLibGenSearchUrl,
  getLibGenDownloadUrl,
  getActualDownloadUrl,
  downloadFile,
  getLibGenDomain,
};
