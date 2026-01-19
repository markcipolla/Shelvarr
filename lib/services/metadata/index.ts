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
 * Score a result based on how well it matches the query
 * Exported for testing
 */
export function scoreResult(
  result: BookMetadata,
  title: string,
  author?: string,
  isbn?: string
): number {
  let score = 0;
  const t = result.title.toLowerCase();
  const queryTitle = title.toLowerCase();

  // Title match scoring (most important)
  if (t === queryTitle) {
    score += 100; // Exact match
  } else if (t.startsWith(queryTitle) || queryTitle.startsWith(t)) {
    score += 80; // Starts with
  } else if (t.includes(queryTitle) || queryTitle.includes(t)) {
    score += 60; // Contains
  } else {
    // Word-based matching
    const qWords = queryTitle.split(/\s+/).filter(w => w.length > 2);
    const tWords = t.split(/\s+/).filter(w => w.length > 2);
    const matches = qWords.filter(qw => tWords.some(tw => tw.includes(qw) || qw.includes(tw)));
    if (qWords.length > 0) {
      score += Math.min(50, (matches.length / qWords.length) * 50);
    }
  }

  // Author match scoring
  if (author && result.authors && result.authors !== 'Unknown') {
    const queryAuthor = author.toLowerCase();
    const resultAuthor = result.authors.toLowerCase();
    if (resultAuthor.includes(queryAuthor) || queryAuthor.includes(resultAuthor)) {
      score += 30;
    } else {
      // Partial author name match
      const authorWords = queryAuthor.split(/\s+/).filter(w => w.length > 2);
      const resultWords = resultAuthor.split(/\s+/).filter(w => w.length > 2);
      const matches = authorWords.filter(aw => resultWords.some(rw => rw.includes(aw) || aw.includes(rw)));
      if (authorWords.length > 0) {
        score += Math.min(20, (matches.length / authorWords.length) * 20);
      }
    }
  }

  // ISBN exact match is a strong signal
  if (isbn && result.isbn) {
    const cleanIsbn = isbn.replace(/[-\s]/g, '');
    const resultIsbn = result.isbn.replace(/[-\s]/g, '');
    if (cleanIsbn === resultIsbn) {
      score += 50;
    }
  }

  // Metadata completeness scoring (prefer results with more data)
  if (result.coverUrl) score += 10;
  if (result.description && result.description.length > 50) score += 10;
  if (result.series?.length) score += 8;
  if (result.authors && result.authors !== 'Unknown') score += 5;
  if (result.publisher) score += 2;
  if (result.publishDate) score += 2;
  if (result.isbn) score += 2;

  return score;
}

/**
 * Auto-match a book - search and return the best match
 * Fetches multiple results and picks the highest-scored one
 */
export async function autoMatch(
  title: string,
  author?: string,
  isbn?: string
): Promise<BookMetadata | null> {
  if (!hardcover.isConfigured()) return null;

  // Build search query - title + author works best
  const query = [title, author].filter(Boolean).join(' ').trim();
  if (!query) return null;

  // Fetch multiple results to pick the best one
  const results = await hardcover.searchBooks(query, 10);
  if (results.length === 0) return null;

  // Score and sort results
  const scored = results
    .map(r => ({ result: r, score: scoreResult(r, title, author, isbn) }))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.result || null;
}

export { hardcover };
