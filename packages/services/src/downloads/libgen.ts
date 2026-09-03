/**
 * Library Genesis (LibGen) Integration
 *
 * LibGen has a JSON API for searching books.
 * Mirror choice follows the cached source statuses (see source-status.ts).
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

// LibGen source names (as cached by the status service) and their domains
const LIBGEN_SOURCES: Record<string, string> = {
  libgen_vg: 'libgen.vg',
  libgen_la: 'libgen.la',
  libgen_bz: 'libgen.bz',
  libgen_gl: 'libgen.gl',
};

// Fallback mirrors if status unavailable
const LIBGEN_FALLBACK = 'libgen.vg';

/**
 * Get every LibGen mirror, best-first: sources last probed as up, then
 * degraded, then unchecked, then known-down. Callers that can fail over walk
 * the whole list; `getLibGenDomain` just takes the head.
 */
export function getLibGenDomains(): string[] {
  const rank: Record<string, number> = { up: 0, degraded: 1, unknown: 2, down: 3 };

  const entries = Object.entries(LIBGEN_SOURCES).map(([source, domain]) => ({ source, domain }));

  try {
    const statuses = getSourceStatusCache();
    entries.sort((a, b) => {
      const aRank = rank[statuses.find(s => s.source === a.source)?.status ?? 'unknown'] ?? 2;
      const bRank = rank[statuses.find(s => s.source === b.source)?.status ?? 'unknown'] ?? 2;
      return aRank - bRank;
    });
  } catch {
    // Ignore errors, keep the declared order
  }

  const domains = entries.map(e => e.domain);
  if (!domains.includes(LIBGEN_FALLBACK)) domains.push(LIBGEN_FALLBACK);
  return domains;
}

/**
 * Get the current best LibGen domain
 */
export function getLibGenDomain(): string {
  return getLibGenDomains()[0] ?? LIBGEN_FALLBACK;
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
      signal: AbortSignal.timeout(15000),
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

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Fetch that retries once on a transient failure. LibGen mirrors intermittently
 * answer 500 under load, which is not a reason to fail a whole download task.
 */
async function fetchWithRetry(url: string, init: RequestInit, attempts = 2): Promise<Response | null> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok) return response;

      console.warn(`LibGen request to ${url} failed: ${response.status}`);
      if (!RETRYABLE_STATUSES.has(response.status)) return null;
    } catch (error) {
      console.warn(`LibGen request to ${url} errored:`, error);
    }

    if (attempt < attempts) {
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }

  return null;
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

/**
 * Scrape the ads.php page on one mirror for the get.php URL (which carries a
 * short-lived key). Returns null if that mirror won't serve the page.
 */
async function getDownloadUrlFromDomain(domain: string, md5: string): Promise<string | null> {
  const response = await fetchWithRetry(`https://${domain}/ads.php?md5=${md5}`, {
    headers: { ...BROWSER_HEADERS, 'Accept': 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(15000),
  });

  if (!response) return null;

  const html = await response.text();

  // Look for the GET link: href="get.php?md5=XXX&key=YYY"
  const getPattern = /href="(get\.php\?md5=[a-f0-9]+&key=[^"]+)"/i;
  const match = html.match(getPattern);
  if (match?.[1]) {
    return `https://${domain}/${match[1]}`;
  }

  // Fallback: look for any direct download link
  const directPattern = /href="(https?:\/\/[^"]+\/get[^"]+)"/i;
  const directMatch = html.match(directPattern);
  if (directMatch?.[1]) {
    return directMatch[1];
  }

  return null;
}

/**
 * Get the actual direct download URL by scraping the ads.php page.
 * Tries each mirror in turn so one flaky host doesn't sink the download.
 */
export async function getActualDownloadUrl(md5: string): Promise<string | null> {
  for (const domain of getLibGenDomains()) {
    const url = await getDownloadUrlFromDomain(domain, md5);
    if (url) return url;
  }

  console.error('Could not get download URL for', md5);
  return null;
}

/**
 * Download a file from LibGen and return the buffer and filename.
 * Falls over to the next mirror if a host fails at either step.
 */
export async function downloadFile(md5: string): Promise<{
  buffer: Buffer;
  filename: string;
  contentType: string;
} | null> {
  for (const domain of getLibGenDomains()) {
    try {
      const downloadUrl = await getDownloadUrlFromDomain(domain, md5);
      if (!downloadUrl) continue;

      const response = await fetchWithRetry(downloadUrl, {
        headers: { ...BROWSER_HEADERS, 'Accept': '*/*', 'Referer': `https://${domain}/ads.php?md5=${md5}` },
        redirect: 'follow',
      });
      if (!response) continue;

      const contentType = response.headers.get('content-type') || 'application/octet-stream';

      // A HTML body here is a rate-limit or error page, not the book.
      if (contentType.includes('text/html')) {
        console.warn(`LibGen mirror ${domain} served HTML instead of a file for ${md5}`);
        continue;
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

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length === 0) {
        console.warn(`LibGen mirror ${domain} returned an empty file for ${md5}`);
        continue;
      }

      return { buffer, filename, contentType };
    } catch (error) {
      console.error(`Error downloading ${md5} from ${domain}:`, error);
    }
  }

  console.error('All LibGen mirrors failed for', md5);
  return null;
}

export default {
  searchLibGen,
  getLibGenSearchUrl,
  getLibGenDownloadUrl,
  getActualDownloadUrl,
  downloadFile,
  getLibGenDomain,
  getLibGenDomains,
};
