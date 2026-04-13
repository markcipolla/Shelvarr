/**
 * OpenLibrary API Service
 * https://openlibrary.org/developers/api
 */

import config from '../../config/index.js';

const API_BASE = 'https://openlibrary.org';
const COVERS_BASE = 'https://covers.openlibrary.org';

export interface OpenLibraryDoc {
  key: string;
  title: string;
  author_name?: string[];
  author_key?: string[];
  first_publish_year?: number;
  publisher?: string[];
  isbn?: string[];
  cover_i?: number;
  number_of_pages_median?: number;
  subject?: string[];
  language?: string[];
  edition_count?: number;
}

export interface OpenLibrarySearchResult {
  numFound: number;
  start: number;
  docs: OpenLibraryDoc[];
}

export interface OpenLibraryWork {
  key: string;
  title: string;
  description?: string | { value: string };
  subjects?: string[];
  covers?: number[];
  authors?: Array<{ author: { key: string } }>;
}

export interface OpenLibraryEdition {
  key: string;
  title: string;
  authors?: Array<{ key: string }>;
  publishers?: string[];
  publish_date?: string;
  isbn_13?: string[];
  isbn_10?: string[];
  covers?: number[];
  number_of_pages?: number;
  description?: string | { value: string };
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
  source: 'openlibrary';
  sourceId: string;
}

// Simple rate limiter
let lastRequestTime = 0;
const minInterval = 1000 / config.rateLimits.openLibrary;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < minInterval) {
    await new Promise(resolve => setTimeout(resolve, minInterval - timeSinceLastRequest));
  }

  lastRequestTime = Date.now();
  return fetch(url);
}

/**
 * Search OpenLibrary by query string
 */
export async function searchBooks(query: string, maxResults = 10): Promise<BookMetadata[]> {
  if (!query.trim()) {
    return [];
  }

  const params = new URLSearchParams({
    q: query,
    limit: String(maxResults),
    fields: 'key,title,author_name,author_key,first_publish_year,publisher,isbn,cover_i,number_of_pages_median,subject,language',
  });

  const url = `${API_BASE}/search.json?${params}`;

  try {
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      throw new Error(`OpenLibrary API error: ${response.status}`);
    }

    const data = await response.json() as OpenLibrarySearchResult;

    return data.docs.map(docToMetadata);
  } catch (error) {
    console.error('OpenLibrary search error:', error);
    throw error;
  }
}

/**
 * Search by ISBN
 */
export async function searchByIsbn(isbn: string): Promise<BookMetadata | null> {
  const cleanIsbn = isbn.replace(/[-\s]/g, '');

  // Try ISBN endpoint first for precise match
  const url = `${API_BASE}/isbn/${cleanIsbn}.json`;

  try {
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        // Fall back to search
        const results = await searchBooks(`isbn:${cleanIsbn}`, 1);
        return results[0] || null;
      }
      throw new Error(`OpenLibrary API error: ${response.status}`);
    }

    const edition = await response.json() as OpenLibraryEdition;
    return editionToMetadata(edition);
  } catch (error) {
    console.error('OpenLibrary ISBN lookup error:', error);
    // Fall back to search
    const results = await searchBooks(`isbn:${cleanIsbn}`, 1);
    return results[0] || null;
  }
}

/**
 * Search by title and author
 */
export async function searchByTitleAuthor(
  title: string,
  author?: string
): Promise<BookMetadata[]> {
  let query = `title:${title}`;
  if (author) {
    query += ` author:${author}`;
  }
  return searchBooks(query);
}

/**
 * Get work details by OpenLibrary key (e.g., /works/OL123W)
 */
export async function getWorkById(workKey: string): Promise<BookMetadata | null> {
  // Ensure key has correct format
  const key = workKey.startsWith('/works/') ? workKey : `/works/${workKey}`;
  const url = `${API_BASE}${key}.json`;

  try {
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`OpenLibrary API error: ${response.status}`);
    }

    const work = await response.json() as OpenLibraryWork;
    return workToMetadata(work);
  } catch (error) {
    console.error('OpenLibrary get work error:', error);
    throw error;
  }
}

/**
 * Get cover URL for a cover ID
 */
export function getCoverUrl(coverId: number, size: 'S' | 'M' | 'L' = 'M'): string {
  return `${COVERS_BASE}/b/id/${coverId}-${size}.jpg`;
}

/**
 * Convert search doc to our metadata format
 */
function docToMetadata(doc: OpenLibraryDoc): BookMetadata {
  let coverUrl: string | undefined;
  if (doc.cover_i) {
    coverUrl = getCoverUrl(doc.cover_i, 'M');
  }

  // Extract first ISBN
  const isbn = doc.isbn?.[0];

  return {
    title: doc.title,
    authors: doc.author_name?.join(', ') || 'Unknown',
    publisher: doc.publisher?.[0],
    publishDate: doc.first_publish_year?.toString(),
    isbn,
    coverUrl,
    pageCount: doc.number_of_pages_median,
    categories: doc.subject?.slice(0, 5),
    language: doc.language?.[0],
    source: 'openlibrary',
    sourceId: doc.key,
  };
}

/**
 * Convert edition to our metadata format
 */
function editionToMetadata(edition: OpenLibraryEdition): BookMetadata {
  let coverUrl: string | undefined;
  if (edition.covers?.[0]) {
    coverUrl = getCoverUrl(edition.covers[0], 'M');
  }

  // Get ISBN
  const isbn = edition.isbn_13?.[0] || edition.isbn_10?.[0];

  // Extract description
  let description: string | undefined;
  if (edition.description) {
    description = typeof edition.description === 'string'
      ? edition.description
      : edition.description.value;
  }

  return {
    title: edition.title,
    authors: 'Unknown', // Edition doesn't include author names directly
    publisher: edition.publishers?.[0],
    publishDate: edition.publish_date,
    description,
    isbn,
    coverUrl,
    pageCount: edition.number_of_pages,
    source: 'openlibrary',
    sourceId: edition.key,
  };
}

/**
 * Convert work to our metadata format
 */
function workToMetadata(work: OpenLibraryWork): BookMetadata {
  let coverUrl: string | undefined;
  if (work.covers?.[0]) {
    coverUrl = getCoverUrl(work.covers[0], 'M');
  }

  // Extract description
  let description: string | undefined;
  if (work.description) {
    description = typeof work.description === 'string'
      ? work.description
      : work.description.value;
  }

  return {
    title: work.title,
    authors: 'Unknown', // Need separate author lookup
    description,
    coverUrl,
    categories: work.subjects?.slice(0, 5),
    source: 'openlibrary',
    sourceId: work.key,
  };
}
