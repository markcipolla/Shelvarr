/**
 * BookBrainz API Service
 * https://bookbrainz.org/
 *
 * Open source book database (part of MetaBrainz).
 * No API key required.
 */

import config from '../../config/index.js';

const API_BASE = 'https://api.bookbrainz.org/1';

export interface BookBrainzSearchResult {
  resultCount: number;
  searchResult: Array<{
    bbid: string;
    defaultAlias: {
      language: string;
      name: string;
      primary: boolean;
      sortName: string;
    };
    entityType: string;
  }>;
  totalCount: number;
}

export interface BookBrainzEdition {
  bbid: string;
  defaultAlias?: {
    language: string;
    name: string;
    primary: boolean;
    sortName: string;
  };
  authorCredits?: {
    authorCount: number;
    names: Array<{
      name: string;
      authorBBID: string;
    }>;
  };
  editionFormat?: string;
  languages?: string[];
  pages?: number;
  publishers?: Array<{
    bbid: string;
    name: string;
  }>;
  releaseEventDate?: string;
  identifiers?: Array<{
    type: string;
    value: string;
  }>;
  disambiguation?: string;
}

export interface BookBrainzWork {
  bbid: string;
  defaultAlias?: {
    language: string;
    name: string;
    primary: boolean;
    sortName: string;
  };
  authorCredits?: {
    authorCount: number;
    names: Array<{
      name: string;
      authorBBID: string;
    }>;
  };
  languages?: string[];
  type?: string;
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
  source: 'bookbrainz';
  sourceId: string;
}

// Rate limiting
let lastRequestTime = 0;
const minInterval = 1000 / (config.rateLimits.bookbrainz / 60);

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
      'User-Agent': 'Shelvarr/1.0 (https://github.com/markcipolla/Shelvarr)',
    },
  });
}

/**
 * Search for editions (books)
 */
export async function searchBooks(query: string, maxResults = 10): Promise<BookMetadata[]> {
  if (!query.trim()) {
    return [];
  }

  const url = `${API_BASE}/search?q=${encodeURIComponent(query)}&type=edition&size=${maxResults}`;

  try {
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      throw new Error(`BookBrainz API error: ${response.status}`);
    }

    const data = await response.json() as BookBrainzSearchResult;

    // Fetch details for each result
    const metadataPromises = data.searchResult.slice(0, maxResults).map(async (result) => {
      try {
        const edition = await getEditionDetails(result.bbid);
        if (edition) {
          return editionToMetadata(edition);
        }
        // Fallback to basic info from search result
        return {
          title: result.defaultAlias.name,
          authors: 'Unknown',
          source: 'bookbrainz' as const,
          sourceId: result.bbid,
        };
      } catch {
        return {
          title: result.defaultAlias.name,
          authors: 'Unknown',
          source: 'bookbrainz' as const,
          sourceId: result.bbid,
        };
      }
    });

    return Promise.all(metadataPromises);
  } catch (error) {
    console.error('BookBrainz search error:', error);
    throw error;
  }
}

/**
 * Get edition details by BBID
 */
async function getEditionDetails(bbid: string): Promise<BookBrainzEdition | null> {
  const url = `${API_BASE}/edition/${bbid}`;

  try {
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`BookBrainz API error: ${response.status}`);
    }

    return await response.json() as BookBrainzEdition;
  } catch (error) {
    console.error('BookBrainz get edition error:', error);
    return null;
  }
}

/**
 * Search by ISBN
 */
export async function searchByIsbn(isbn: string): Promise<BookMetadata | null> {
  const cleanIsbn = isbn.replace(/[-\s]/g, '');

  // BookBrainz doesn't have direct ISBN lookup, search for it
  const results = await searchBooks(cleanIsbn, 5);

  // Return first result if any
  return results[0] || null;
}

/**
 * Search by title and author
 */
export async function searchByTitleAuthor(title: string, author?: string): Promise<BookMetadata[]> {
  const query = author ? `${title} ${author}` : title;
  return searchBooks(query);
}

/**
 * Get book by ID (BBID)
 */
export async function getBookById(id: string): Promise<BookMetadata | null> {
  const edition = await getEditionDetails(id);
  if (!edition) {
    return null;
  }
  return editionToMetadata(edition);
}

/**
 * Search for series
 */
export async function searchSeries(query: string): Promise<Array<{ bbid: string; name: string }>> {
  const url = `${API_BASE}/search?q=${encodeURIComponent(query)}&type=series&size=10`;

  try {
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      throw new Error(`BookBrainz API error: ${response.status}`);
    }

    const data = await response.json() as BookBrainzSearchResult;

    return data.searchResult.map(result => ({
      bbid: result.bbid,
      name: result.defaultAlias.name,
    }));
  } catch (error) {
    console.error('BookBrainz series search error:', error);
    return [];
  }
}

/**
 * Convert BookBrainz edition to our metadata format
 */
function editionToMetadata(edition: BookBrainzEdition): BookMetadata {
  // Extract authors
  let authors = 'Unknown';
  if (edition.authorCredits?.names && edition.authorCredits.names.length > 0) {
    authors = edition.authorCredits.names.map(n => n.name).join(', ');
  }

  // Extract publisher
  const publisher = edition.publishers?.[0]?.name;

  // Extract ISBN from identifiers
  let isbn: string | undefined;
  if (edition.identifiers) {
    const isbnIdentifier = edition.identifiers.find(
      i => i.type === 'ISBN-13' || i.type === 'ISBN-10'
    );
    isbn = isbnIdentifier?.value;
  }

  // Parse release date (format might be "+002016" or similar)
  let publishDate: string | undefined;
  if (edition.releaseEventDate) {
    const match = edition.releaseEventDate.match(/(\d{4})/);
    if (match) {
      publishDate = match[1];
    }
  }

  return {
    title: edition.defaultAlias?.name || 'Unknown Title',
    authors,
    publisher,
    publishDate,
    pageCount: edition.pages,
    language: edition.languages?.[0],
    isbn,
    source: 'bookbrainz',
    sourceId: edition.bbid,
  };
}

/**
 * Check if this provider is configured (always true - no API key needed)
 */
export function isConfigured(): boolean {
  return true;
}
