/**
 * Metadata Service - Hardcover only
 *
 * Simplified: searchBooks always returns full details, autoMatch picks the best result.
 */

import * as hardcover from './hardcover';

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
  series?: Array<[string, number | null]>; // Array of [seriesName, position]
  source: 'hardcover';
  sourceId: string;
}

export interface SearchOptions {
  maxResults?: number;
}

/**
 * Check if Hardcover is configured
 */
export function isConfigured(): boolean {
  return hardcover.isConfigured();
}

/**
 * Get source status for settings UI
 */
export async function getAllSourcesStatus() {
  const configured = hardcover.isConfigured();
  return [{
    name: 'hardcover' as const,
    displayName: 'Hardcover',
    enabled: configured,
    configured,
    requiresApiKey: true,
    apiKeyUrl: 'https://hardcover.app/account/api',
  }];
}

/**
 * Search for books - returns full metadata for each result
 */
export async function searchBooks(
  query: string,
  options: SearchOptions = {}
): Promise<BookMetadata[]> {
  if (!hardcover.isConfigured()) return [];

  const maxResults = options.maxResults || 10;
  return hardcover.searchBooks(query, maxResults);
}

/**
 * Search for a book by ISBN
 */
export async function searchByIsbn(isbn: string): Promise<BookMetadata | null> {
  if (!hardcover.isConfigured()) return null;
  return hardcover.searchByIsbn(isbn);
}

/**
 * Get book details by source ID
 */
export async function getBookBySourceId(
  source: string,
  sourceId: string
): Promise<BookMetadata | null> {
  if (source !== 'hardcover') return null;
  return hardcover.getBookById(sourceId);
}

/**
 * Auto-match a book - search and return the best match
 * Simple approach: search by title+author and return the first result
 */
export async function autoMatch(
  title: string,
  author?: string,
  isbn?: string
): Promise<BookMetadata | null> {
  if (!hardcover.isConfigured()) return null;

  // Build search query
  const query = [title, author, isbn].filter(Boolean).join(' ').trim();
  if (!query) return null;

  const results = await hardcover.searchBooks(query, 1);
  return results[0] || null;
}

export { hardcover };
