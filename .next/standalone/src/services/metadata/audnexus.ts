/**
 * Audnexus API Service
 * https://audnex.us/
 *
 * Note: Audnexus requires an ASIN (Amazon ID) to look up books.
 * It doesn't have a title/ISBN search endpoint.
 * Best used when ASIN is known, or as a secondary source.
 */

import config from '../../config/index.js';

const API_BASE = 'https://api.audnex.us';

export interface AudnexusBook {
  asin: string;
  title: string;
  subtitle?: string;
  authors?: Array<{ asin: string; name: string }>;
  narrators?: Array<{ asin: string; name: string }>;
  publisherName?: string;
  summary?: string;
  releaseDate?: string;
  image?: string;
  seriesPrimary?: {
    asin: string;
    name: string;
    position?: string;
  };
  seriesSecondary?: {
    asin: string;
    name: string;
    position?: string;
  };
  genres?: Array<{ asin: string; name: string; type: string }>;
  runtimeLengthMin?: number;
  language?: string;
  region?: string;
}

export interface AudnexusAuthor {
  asin: string;
  name: string;
  description?: string;
  image?: string;
  genres?: Array<{ asin: string; name: string; type: string }>;
}

export interface BookMetadata {
  title: string;
  authors: string;
  publisher?: string;
  publishDate?: string;
  description?: string;
  isbn?: string;
  coverUrl?: string;
  pageCount?: number;
  categories?: string[];
  language?: string;
  seriesName?: string;
  seriesNumber?: number;
  source: 'audnexus';
  sourceId: string;
}

// Rate limiting
let lastRequestTime = 0;
const minInterval = 1000 / (config.rateLimits.audnexus / 60);

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < minInterval) {
    await new Promise(resolve => setTimeout(resolve, minInterval - timeSinceLastRequest));
  }

  lastRequestTime = Date.now();
  return fetch(url, {
    headers: {
      'Accept': 'application/json',
    },
  });
}

/**
 * Get book by ASIN
 */
export async function getBookByAsin(asin: string, region = 'us'): Promise<BookMetadata | null> {
  const url = `${API_BASE}/books/${asin}?region=${region}`;

  try {
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Audnexus API error: ${response.status}`);
    }

    const book = await response.json() as AudnexusBook;
    return bookToMetadata(book);
  } catch (error) {
    console.error('Audnexus get book error:', error);
    throw error;
  }
}

/**
 * Search authors by name
 */
export async function searchAuthors(name: string, region = 'us'): Promise<AudnexusAuthor[]> {
  const url = `${API_BASE}/authors?name=${encodeURIComponent(name)}&region=${region}`;

  try {
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      throw new Error(`Audnexus API error: ${response.status}`);
    }

    return await response.json() as AudnexusAuthor[];
  } catch (error) {
    console.error('Audnexus search authors error:', error);
    throw error;
  }
}

/**
 * Get author by ASIN
 */
export async function getAuthorByAsin(asin: string, region = 'us'): Promise<AudnexusAuthor | null> {
  const url = `${API_BASE}/authors/${asin}?region=${region}`;

  try {
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Audnexus API error: ${response.status}`);
    }

    return await response.json() as AudnexusAuthor;
  } catch (error) {
    console.error('Audnexus get author error:', error);
    throw error;
  }
}

/**
 * Audnexus doesn't support title/ISBN search.
 * These functions return empty results.
 */
export async function searchBooks(_query: string, _maxResults = 10): Promise<BookMetadata[]> {
  // Audnexus doesn't have a search endpoint - requires ASIN
  return [];
}

export async function searchByIsbn(_isbn: string): Promise<BookMetadata | null> {
  // Audnexus doesn't support ISBN lookup
  return null;
}

export async function searchByTitleAuthor(_title: string, _author?: string): Promise<BookMetadata[]> {
  // Audnexus doesn't support title/author search
  return [];
}

export async function getBookById(id: string): Promise<BookMetadata | null> {
  // ID is the ASIN
  return getBookByAsin(id);
}

/**
 * Convert Audnexus book to our metadata format
 */
function bookToMetadata(book: AudnexusBook): BookMetadata {
  const authors = book.authors?.map(a => a.name).join(', ') || 'Unknown';
  const categories = book.genres?.map(g => g.name) || [];

  // Parse series number from position string (e.g., "1" or "1.5")
  let seriesNumber: number | undefined;
  if (book.seriesPrimary?.position) {
    const num = parseFloat(book.seriesPrimary.position);
    if (!isNaN(num)) {
      seriesNumber = num;
    }
  }

  return {
    title: book.subtitle ? `${book.title}: ${book.subtitle}` : book.title,
    authors,
    publisher: book.publisherName,
    publishDate: book.releaseDate,
    description: book.summary,
    coverUrl: book.image,
    categories,
    language: book.language,
    seriesName: book.seriesPrimary?.name,
    seriesNumber,
    source: 'audnexus',
    sourceId: book.asin,
  };
}

/**
 * Check if this provider is configured (always true - no API key needed)
 */
export function isConfigured(): boolean {
  return true;
}
