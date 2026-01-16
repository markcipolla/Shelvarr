/**
 * Unified Metadata Service
 * Combines multiple book metadata APIs
 */

import * as googleBooks from './googleBooks.js';
import * as openLibrary from './openLibrary.js';
import * as hardcover from './hardcover.js';
import * as bookbrainz from './bookbrainz.js';
import * as audnexus from './audnexus.js';
import * as comicvine from './comicvine.js';
import * as wikidata from './wikidata.js';
import { getSetting } from '../../db/index.js';
import type { MetadataSource } from '../../types/index.js';

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
  source: MetadataSource;
  sourceId: string;
}

export interface SearchOptions {
  sources?: MetadataSource[];
  maxResults?: number;
}

// All available sources
const ALL_SOURCES: MetadataSource[] = [
  'googlebooks',
  'openlibrary',
  'hardcover',
  'bookbrainz',
  'audnexus',
  'comicvine',
  'wikidata',
];

// Default sources (ones that don't require API keys)
const DEFAULT_SOURCES: MetadataSource[] = ['googlebooks', 'openlibrary'];

/**
 * Get enabled sources from settings
 */
export async function getEnabledSources(): Promise<MetadataSource[]> {
  try {
    const sourceSettings = await getSetting<Record<string, { enabled: boolean }>>('metadata_sources', {}) || {};

    // Start with default sources
    const enabled: MetadataSource[] = [];

    for (const source of ALL_SOURCES) {
      const settings = sourceSettings[source];

      // If source has explicit settings, use them
      if (settings !== undefined) {
        if (settings.enabled && isSourceConfigured(source)) {
          enabled.push(source);
        }
      } else {
        // Default: enable sources that don't require API keys
        if (DEFAULT_SOURCES.includes(source)) {
          enabled.push(source);
        }
      }
    }

    return enabled.length > 0 ? enabled : DEFAULT_SOURCES;
  } catch {
    return DEFAULT_SOURCES;
  }
}

/**
 * Check if a source is properly configured (has required API key if needed)
 */
export function isSourceConfigured(source: MetadataSource): boolean {
  switch (source) {
    case 'googlebooks':
    case 'openlibrary':
    case 'bookbrainz':
    case 'audnexus':
    case 'wikidata':
      return true; // No API key required

    case 'hardcover':
      return hardcover.isConfigured();

    case 'comicvine':
      return comicvine.isConfigured();

    default:
      return false;
  }
}

/**
 * Get source display info
 */
export function getSourceInfo(source: MetadataSource): {
  displayName: string;
  requiresApiKey: boolean;
  apiKeyUrl?: string;
} {
  switch (source) {
    case 'googlebooks':
      return { displayName: 'Google Books', requiresApiKey: false };
    case 'openlibrary':
      return { displayName: 'OpenLibrary', requiresApiKey: false };
    case 'hardcover':
      return {
        displayName: 'Hardcover',
        requiresApiKey: true,
        apiKeyUrl: 'https://hardcover.app/account/api',
      };
    case 'bookbrainz':
      return { displayName: 'BookBrainz', requiresApiKey: false };
    case 'audnexus':
      return { displayName: 'Audnexus', requiresApiKey: false };
    case 'comicvine':
      return {
        displayName: 'ComicVine',
        requiresApiKey: true,
        apiKeyUrl: 'https://comicvine.gamespot.com/api/',
      };
    case 'wikidata':
      return { displayName: 'Wikidata', requiresApiKey: false };
    default:
      return { displayName: source, requiresApiKey: false };
  }
}

/**
 * Get all sources with their configuration status
 */
export async function getAllSourcesStatus(): Promise<Array<{
  name: MetadataSource;
  displayName: string;
  enabled: boolean;
  configured: boolean;
  requiresApiKey: boolean;
  apiKeyUrl?: string;
}>> {
  const enabledSources = await getEnabledSources();

  return ALL_SOURCES.map(source => {
    const info = getSourceInfo(source);
    return {
      name: source,
      displayName: info.displayName,
      enabled: enabledSources.includes(source),
      configured: isSourceConfigured(source),
      requiresApiKey: info.requiresApiKey,
      apiKeyUrl: info.apiKeyUrl,
    };
  });
}

/**
 * Search for a single source
 */
async function searchSource(
  source: MetadataSource,
  query: string,
  maxResults: number
): Promise<BookMetadata[]> {
  switch (source) {
    case 'googlebooks':
      return googleBooks.searchBooks(query, maxResults);
    case 'openlibrary':
      return openLibrary.searchBooks(query, maxResults);
    case 'hardcover':
      return hardcover.searchBooks(query, maxResults);
    case 'bookbrainz':
      return bookbrainz.searchBooks(query, maxResults);
    case 'audnexus':
      return audnexus.searchBooks(query, maxResults);
    case 'comicvine':
      return comicvine.searchBooks(query, maxResults);
    case 'wikidata':
      return wikidata.searchBooks(query, maxResults);
    default:
      return [];
  }
}

/**
 * Search by ISBN for a single source
 */
async function searchSourceByIsbn(
  source: MetadataSource,
  isbn: string
): Promise<BookMetadata | null> {
  switch (source) {
    case 'googlebooks':
      return googleBooks.searchByIsbn(isbn);
    case 'openlibrary':
      return openLibrary.searchByIsbn(isbn);
    case 'hardcover':
      return hardcover.searchByIsbn(isbn);
    case 'bookbrainz':
      return bookbrainz.searchByIsbn(isbn);
    case 'audnexus':
      return audnexus.searchByIsbn(isbn);
    case 'comicvine':
      return comicvine.searchByIsbn(isbn);
    case 'wikidata':
      return wikidata.searchByIsbn(isbn);
    default:
      return null;
  }
}

/**
 * Search by title/author for a single source
 */
async function searchSourceByTitleAuthor(
  source: MetadataSource,
  title: string,
  author?: string
): Promise<BookMetadata[]> {
  switch (source) {
    case 'googlebooks':
      return googleBooks.searchByTitleAuthor(title, author);
    case 'openlibrary':
      return openLibrary.searchByTitleAuthor(title, author);
    case 'hardcover':
      return hardcover.searchByTitleAuthor(title, author);
    case 'bookbrainz':
      return bookbrainz.searchByTitleAuthor(title, author);
    case 'audnexus':
      return audnexus.searchByTitleAuthor(title, author);
    case 'comicvine':
      return comicvine.searchByTitleAuthor(title, author);
    case 'wikidata':
      return wikidata.searchByTitleAuthor(title, author);
    default:
      return [];
  }
}

// Timeout helper
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  const timeout = new Promise<T>((resolve) => {
    setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeout]);
}

// Per-source timeout in milliseconds (fast sources get more time)
const SOURCE_TIMEOUTS: Record<MetadataSource, number> = {
  googlebooks: 5000,
  openlibrary: 5000,
  hardcover: 8000,
  bookbrainz: 8000,
  audnexus: 5000,
  comicvine: 8000,
  wikidata: 10000, // SPARQL can be slow
};

/**
 * Search for books across multiple sources
 */
export async function searchBooks(
  query: string,
  options: SearchOptions = {}
): Promise<BookMetadata[]> {
  const sources = options.sources || await getEnabledSources();
  const maxResults = options.maxResults || 10;

  const results: BookMetadata[] = [];

  // Search each source in parallel with individual timeouts
  const searches = sources.map(async (source) => {
    if (!isSourceConfigured(source)) {
      return [];
    }
    const timeout = SOURCE_TIMEOUTS[source] || 5000;
    try {
      return await withTimeout(
        searchSource(source, query, maxResults),
        timeout,
        [] // Return empty on timeout
      );
    } catch {
      return []; // Return empty on error
    }
  });

  const searchResults = await Promise.all(searches);
  for (const items of searchResults) {
    results.push(...items);
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
  const sources = options.sources || await getEnabledSources();

  // Search all sources in parallel with timeouts, return first result
  const searches = sources.map(async (source) => {
    if (!isSourceConfigured(source)) {
      return null;
    }
    const timeout = SOURCE_TIMEOUTS[source] || 5000;
    try {
      return await withTimeout(
        searchSourceByIsbn(source, isbn),
        timeout,
        null
      );
    } catch {
      return null;
    }
  });

  const results = await Promise.all(searches);
  // Return first non-null result
  return results.find(r => r !== null) || null;
}

/**
 * Search by title and optional author
 */
export async function searchByTitleAuthor(
  title: string,
  author?: string,
  options: SearchOptions = {}
): Promise<BookMetadata[]> {
  const sources = options.sources || await getEnabledSources();
  const results: BookMetadata[] = [];

  // Search each source in parallel with timeouts
  const searches = sources.map(async (source) => {
    if (!isSourceConfigured(source)) {
      return [];
    }
    const timeout = SOURCE_TIMEOUTS[source] || 5000;
    try {
      return await withTimeout(
        searchSourceByTitleAuthor(source, title, author),
        timeout,
        []
      );
    } catch {
      return [];
    }
  });

  const searchResults = await Promise.all(searches);
  for (const items of searchResults) {
    results.push(...items);
  }

  return results;
}

/**
 * Get book details by source and ID
 */
export async function getBookBySourceId(
  source: MetadataSource,
  sourceId: string
): Promise<BookMetadata | null> {
  switch (source) {
    case 'googlebooks':
      return googleBooks.getBookById(sourceId);
    case 'openlibrary':
      return openLibrary.getWorkById(sourceId);
    case 'hardcover':
      return hardcover.getBookById(sourceId);
    case 'bookbrainz':
      return bookbrainz.getBookById(sourceId);
    case 'audnexus':
      return audnexus.getBookById(sourceId);
    case 'comicvine':
      return comicvine.getBookById(sourceId);
    case 'wikidata':
      return wikidata.getBookById(sourceId);
    default:
      return null;
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
export {
  googleBooks,
  openLibrary,
  hardcover,
  bookbrainz,
  audnexus,
  comicvine,
  wikidata,
};

// Export list of all available sources
export { ALL_SOURCES };
