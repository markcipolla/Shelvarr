/**
 * Unified Metadata Service
 * Combines Google Books and OpenLibrary APIs
 */

import * as googleBooks from './googleBooks.js';
import * as openLibrary from './openLibrary.js';

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
  source: 'googlebooks' | 'openlibrary';
  sourceId: string;
}

export interface SearchOptions {
  sources?: ('googlebooks' | 'openlibrary')[];
  maxResults?: number;
}

const DEFAULT_SOURCES: ('googlebooks' | 'openlibrary')[] = ['googlebooks', 'openlibrary'];

/**
 * Search for books across multiple sources
 */
export async function searchBooks(
  query: string,
  options: SearchOptions = {}
): Promise<BookMetadata[]> {
  const sources = options.sources || DEFAULT_SOURCES;
  const maxResults = options.maxResults || 10;

  const results: BookMetadata[] = [];
  const errors: Error[] = [];

  // Search each source in parallel
  const searches = sources.map(async (source) => {
    try {
      let items: BookMetadata[];
      if (source === 'googlebooks') {
        items = await googleBooks.searchBooks(query, maxResults);
      } else {
        items = await openLibrary.searchBooks(query, maxResults);
      }
      return items;
    } catch (error) {
      errors.push(error as Error);
      return [];
    }
  });

  const searchResults = await Promise.all(searches);
  for (const items of searchResults) {
    results.push(...items);
  }

  // If all sources failed, throw an error
  if (results.length === 0 && errors.length > 0) {
    throw new Error(`All metadata sources failed: ${errors.map(e => e.message).join(', ')}`);
  }

  return results;
}

/**
 * Search for a book by ISBN across all sources
 */
export async function searchByIsbn(
  isbn: string,
  options: SearchOptions = {}
): Promise<BookMetadata | null> {
  const sources = options.sources || DEFAULT_SOURCES;
  const errors: Error[] = [];

  // Try sources in order until we get a match
  for (const source of sources) {
    try {
      let result: BookMetadata | null;
      if (source === 'googlebooks') {
        result = await googleBooks.searchByIsbn(isbn);
      } else {
        result = await openLibrary.searchByIsbn(isbn);
      }
      if (result) {
        return result;
      }
    } catch (error) {
      errors.push(error as Error);
    }
  }

  // If all sources failed with errors, throw
  if (errors.length === sources.length) {
    throw new Error(`ISBN lookup failed: ${errors.map(e => e.message).join(', ')}`);
  }

  return null;
}

/**
 * Search by title and optional author
 */
export async function searchByTitleAuthor(
  title: string,
  author?: string,
  options: SearchOptions = {}
): Promise<BookMetadata[]> {
  const sources = options.sources || DEFAULT_SOURCES;
  const results: BookMetadata[] = [];
  const errors: Error[] = [];

  // Search each source in parallel
  const searches = sources.map(async (source) => {
    try {
      let items: BookMetadata[];
      if (source === 'googlebooks') {
        items = await googleBooks.searchByTitleAuthor(title, author);
      } else {
        items = await openLibrary.searchByTitleAuthor(title, author);
      }
      return items;
    } catch (error) {
      errors.push(error as Error);
      return [];
    }
  });

  const searchResults = await Promise.all(searches);
  for (const items of searchResults) {
    results.push(...items);
  }

  if (results.length === 0 && errors.length > 0) {
    throw new Error(`Search failed: ${errors.map(e => e.message).join(', ')}`);
  }

  return results;
}

/**
 * Get book details by source and ID
 */
export async function getBookBySourceId(
  source: 'googlebooks' | 'openlibrary',
  sourceId: string
): Promise<BookMetadata | null> {
  if (source === 'googlebooks') {
    return googleBooks.getBookById(sourceId);
  } else {
    return openLibrary.getWorkById(sourceId);
  }
}

/**
 * Auto-match a book based on filename/existing metadata
 */
export async function autoMatch(
  title: string,
  author?: string,
  isbn?: string
): Promise<BookMetadata | null> {
  // If we have an ISBN, try that first
  if (isbn) {
    const isbnResult = await searchByIsbn(isbn);
    if (isbnResult) {
      return isbnResult;
    }
  }

  // Build a combined search query (like manual search does)
  const query = author ? `${title} ${author}` : title;

  // Try plain text search first (more flexible, like manual search)
  let results = await searchBooks(query, { maxResults: 5 });

  // If no results, try the more specific title+author search
  if (results.length === 0 && title) {
    results = await searchByTitleAuthor(title, author);
  }

  if (results.length === 0) {
    return null;
  }

  // Return the first result (usually the best match)
  return results[0] || null;
}

// Re-export individual services for direct access
export { googleBooks, openLibrary };
