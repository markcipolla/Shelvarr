/**
 * Hardcover.app API Service
 * https://docs.hardcover.app/api/getting-started/
 *
 * Simplified: Always fetch full book details for complete metadata.
 */

import { getServiceConfig } from '../config.js';
import { getSetting } from '@shelvarr/db';

const API_BASE = 'https://api.hardcover.app/v1/graphql';

interface HardcoverBook {
  id: number;
  title: string;
  subtitle?: string;
  slug: string;
  release_date?: string;
  pages?: number;
  description?: string;
  image?: { url: string };
  cached_contributors?: Array<{ author: { id: number; name: string } }> | string;
  contributions?: Array<{ author: { id: number; name: string } }>;
  authors?: Array<{ name: string }> | string;
  author?: string;
  cached_tags?: Array<{ tag: string }> | string;
  book_series?: Array<{ series: { id: number; name: string }; position?: number }>;
  editions?: Array<{ isbn_13?: string; isbn_10?: string }>;
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
  series?: Array<[string, number | null]>; // Array of [seriesName, position]
  source: 'hardcover';
  sourceId: string;
}

// Rate limiting
let lastRequestTime = 0;
function getMinInterval() {
  return 1000 / (getServiceConfig().rateLimits.hardcover / 60);
}

function getApiToken(): string | null {
  const dbToken = getSetting<string>('hardcover_api_key', null);
  if (dbToken) {
    let cleaned = dbToken.trim().replace(/^["']|["']$/g, '');
    if (cleaned.toLowerCase().startsWith('bearer ')) {
      cleaned = cleaned.substring(7).trim();
    }
    return cleaned || null;
  }
  let envToken = getServiceConfig().hardcoverToken?.trim() || null;
  if (envToken?.toLowerCase().startsWith('bearer ')) {
    envToken = envToken.substring(7).trim();
  }
  return envToken;
}

async function graphqlFetch<T>(query: string, variables: Record<string, unknown> = {}): Promise<T | null> {
  const now = Date.now();
  const interval = getMinInterval();
  if (now - lastRequestTime < interval) {
    await new Promise(resolve => setTimeout(resolve, interval - (now - lastRequestTime)));
  }
  lastRequestTime = Date.now();

  const token = getApiToken();
  if (!token) {
    console.error('Hardcover: No API token configured');
    return null;
  }

  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const errorMsg = `Hardcover API error: ${response.status}`;
    console.error(errorMsg);
    // Throw on rate limits and server errors so tasks fail properly
    if (response.status === 429 || response.status >= 500) {
      throw new Error(errorMsg);
    }
    return null;
  }

  const data = await response.json() as { data?: T; errors?: Array<{ message: string }> };
  if (data.errors?.length) {
    console.error(`Hardcover error: ${data.errors[0]?.message}`);
    return null;
  }

  return data.data || null;
}

function safeParseField<T>(field: unknown): T | null {
  if (!field) return null;
  if (typeof field === 'string') {
    try { return JSON.parse(field) as T; } catch { return null; }
  }
  return field as T;
}

function bookToMetadata(book: HardcoverBook): BookMetadata {
  // Extract authors from various possible structures
  let authors = 'Unknown';
  const contributors = safeParseField<Array<{ author: { name: string } }>>(book.cached_contributors);
  if (contributors?.length) {
    const names = contributors.filter(c => c.author?.name).map(c => c.author.name);
    if (names.length) authors = names.join(', ');
  }
  if (authors === 'Unknown' && book.contributions?.length) {
    const names = book.contributions.filter(c => c.author?.name).map(c => c.author.name);
    if (names.length) authors = names.join(', ');
  }
  if (authors === 'Unknown' && book.author) {
    authors = book.author;
  }

  // Extract categories - handle various formats
  let categories: string[] = [];
  const rawTags = safeParseField<unknown>(book.cached_tags);
  if (Array.isArray(rawTags)) {
    categories = rawTags
      .map(t => (typeof t === 'string' ? t : (t as { tag?: string })?.tag))
      .filter((t): t is string => !!t);
  }

  // Extract all series (a book can belong to multiple series)
  const series: Array<[string, number | null]> = [];
  if (book.book_series?.length) {
    for (const bs of book.book_series) {
      if (bs.series?.name) {
        series.push([bs.series.name, bs.position ?? null]);
      }
    }
  }

  // Extract ISBN
  const primaryEdition = book.editions?.[0];
  const isbn = primaryEdition?.isbn_13 || primaryEdition?.isbn_10;

  return {
    title: book.subtitle ? `${book.title}: ${book.subtitle}` : book.title,
    authors,
    publishDate: book.release_date,
    description: book.description,
    isbn,
    coverUrl: book.image?.url,
    pageCount: book.pages,
    categories,
    series: series.length > 0 ? series : undefined,
    source: 'hardcover',
    sourceId: String(book.id),
  };
}

/**
 * Get full book details by ID - this is the source of truth for complete metadata
 */
export async function getBookById(id: string): Promise<BookMetadata | null> {
  const query = `
    query GetBook($id: Int!) {
      books(where: { id: { _eq: $id } }) {
        id
        title
        subtitle
        release_date
        pages
        description
        image { url }
        cached_contributors
        cached_tags
        book_series {
          series { id name }
          position
        }
        editions(limit: 1) {
          isbn_13
          isbn_10
        }
      }
    }
  `;

  const data = await graphqlFetch<{ books?: HardcoverBook[] }>(query, { id: parseInt(id, 10) });
  const book = data?.books?.[0];
  return book ? bookToMetadata(book) : null;
}

/**
 * Search and return full book details for each result
 */
export async function searchBooks(searchQuery: string, maxResults = 10): Promise<BookMetadata[]> {
  if (!searchQuery.trim()) return [];

  const query = `
    query Search($query: String!, $perPage: Int!) {
      search(query: $query, query_type: "books", per_page: $perPage, page: 1) {
        results
      }
    }
  `;

  const data = await graphqlFetch<{ search?: { results: string | unknown[] } }>(query, {
    query: searchQuery,
    perPage: maxResults,
  });

  if (!data?.search?.results) {
    console.log('Hardcover search: No results in response');
    return [];
  }

  // Parse results - can be JSON string, array, or object with hits/books
  type SearchResult = { document?: { id: number }; hit?: { id: number }; id?: number };
  let results: SearchResult[] = [];
  const raw = data.search.results;

  if (typeof raw === 'string') {
    try { results = JSON.parse(raw) as SearchResult[]; } catch { return []; }
  } else if (Array.isArray(raw)) {
    results = raw as SearchResult[];
  } else if (typeof raw === 'object' && raw !== null) {
    // Handle object wrapper formats like { hits: [...] } or { books: [...] }
    const obj = raw as Record<string, unknown>;
    if ('hits' in obj && Array.isArray(obj.hits)) {
      results = obj.hits as SearchResult[];
    } else if ('books' in obj && Array.isArray(obj.books)) {
      results = (obj.books as Array<{ id: number }>).map(b => ({ id: b.id }));
    } else if ('results' in obj && Array.isArray(obj.results)) {
      results = obj.results as SearchResult[];
    } else {
      // Try to find any array property
      const arrayProp = Object.entries(obj).find(([, v]) => Array.isArray(v));
      if (arrayProp) {
        results = arrayProp[1] as SearchResult[];
      } else {
        return [];
      }
    }
  } else {
    return [];
  }

  // Extract book IDs from search results - handle various structures
  // Note: Hardcover returns IDs as strings, so we need to parse them
  type DocType = { id?: string | number; book_id?: string | number };
  const bookIds = results
    .map(r => {
      const doc = (r as { document?: DocType }).document;
      const hit = (r as { hit?: DocType }).hit;
      const rawId = doc?.id || doc?.book_id || hit?.id || hit?.book_id || (r as DocType).id;
      return typeof rawId === 'string' ? parseInt(rawId, 10) : rawId;
    })
    .filter((id): id is number => typeof id === 'number' && !isNaN(id))
    .slice(0, maxResults);

  if (bookIds.length === 0) return [];

  // Fetch full details for all books in one query
  const booksQuery = `
    query GetBooks($ids: [Int!]!) {
      books(where: { id: { _in: $ids } }) {
        id
        title
        subtitle
        release_date
        pages
        description
        image { url }
        cached_contributors
        cached_tags
        book_series {
          series { id name }
          position
        }
        editions(limit: 1) {
          isbn_13
          isbn_10
        }
      }
    }
  `;

  const booksData = await graphqlFetch<{ books?: HardcoverBook[] }>(booksQuery, { ids: bookIds });

  if (!booksData?.books) return [];

  // Maintain order from search results
  // Note: Ensure IDs are compared as numbers (API may return them as strings or numbers)
  const booksById = new Map(booksData.books.map(b => [Number(b.id), b]));
  return bookIds
    .map(id => booksById.get(id))
    .filter((b): b is HardcoverBook => !!b)
    .map(bookToMetadata);
}

/**
 * Search by ISBN - returns first match with full details
 */
export async function searchByIsbn(isbn: string): Promise<BookMetadata | null> {
  const results = await searchBooks(isbn.replace(/[-\s]/g, ''), 3);
  return results.find(r => r.isbn === isbn.replace(/[-\s]/g, '')) || results[0] || null;
}

export function isConfigured(): boolean {
  return !!getApiToken();
}

// ============ Reading Status Mutations ============

// Hardcover status IDs: 1=want to read, 2=currently reading, 3=read, 5=DNF
export type HardcoverStatusId = 1 | 2 | 3 | 5;

interface UserBook {
  id: number;
  status_id: number;
  book_id: number;
  started_reading_at?: string;
  finished_reading_at?: string;
}

/**
 * Search for a user's existing tracking of a book
 */
export async function searchUserBook(hardcoverId: string): Promise<UserBook | null> {
  const query = `
    query GetUserBook($bookId: Int!) {
      user_books(where: { book_id: { _eq: $bookId } }) {
        id
        status_id
        book_id
        started_reading_at
        finished_reading_at
      }
    }
  `;

  const data = await graphqlFetch<{ user_books?: UserBook[] }>(query, {
    bookId: parseInt(hardcoverId, 10),
  });

  return data?.user_books?.[0] ?? null;
}

/**
 * Add a book to user's tracking with a status
 */
export async function insertUserBook(
  hardcoverId: string,
  statusId: HardcoverStatusId,
  startedAt?: string,
  finishedAt?: string,
): Promise<UserBook | null> {
  const mutation = `
    mutation InsertUserBook($bookId: Int!, $statusId: Int!, $startedAt: date, $finishedAt: date) {
      insert_user_books_one(object: {
        book_id: $bookId,
        status_id: $statusId,
        started_reading_at: $startedAt,
        finished_reading_at: $finishedAt
      }) {
        id
        status_id
        book_id
        started_reading_at
        finished_reading_at
      }
    }
  `;

  const data = await graphqlFetch<{ insert_user_books_one?: UserBook }>(mutation, {
    bookId: parseInt(hardcoverId, 10),
    statusId,
    startedAt: startedAt ?? null,
    finishedAt: finishedAt ?? null,
  });

  return data?.insert_user_books_one ?? null;
}

/**
 * Update status on an existing user book entry
 */
export async function updateUserBook(
  userBookId: number,
  statusId: HardcoverStatusId,
  startedAt?: string,
  finishedAt?: string,
): Promise<UserBook | null> {
  const mutation = `
    mutation UpdateUserBook($id: Int!, $statusId: Int!, $startedAt: date, $finishedAt: date) {
      update_user_books_by_pk(
        pk_columns: { id: $id },
        _set: {
          status_id: $statusId,
          started_reading_at: $startedAt,
          finished_reading_at: $finishedAt
        }
      ) {
        id
        status_id
        book_id
        started_reading_at
        finished_reading_at
      }
    }
  `;

  const data = await graphqlFetch<{ update_user_books_by_pk?: UserBook }>(mutation, {
    id: userBookId,
    statusId,
    startedAt: startedAt ?? null,
    finishedAt: finishedAt ?? null,
  });

  return data?.update_user_books_by_pk ?? null;
}

/**
 * Upsert reading status — searches for existing entry, then inserts or updates
 */
export async function upsertReadingStatus(
  hardcoverId: string,
  statusId: HardcoverStatusId,
  startedAt?: string,
  finishedAt?: string,
): Promise<{ success: boolean; userBook?: UserBook; error?: string }> {
  try {
    const existing = await searchUserBook(hardcoverId);

    if (existing) {
      // Don't downgrade: if already "read" (3), don't set back to "reading" (2)
      if (existing.status_id === 3 && statusId === 2) {
        return { success: true, userBook: existing };
      }

      const updated = await updateUserBook(
        existing.id,
        statusId,
        startedAt ?? existing.started_reading_at,
        finishedAt,
      );
      return updated
        ? { success: true, userBook: updated }
        : { success: false, error: 'Failed to update user book' };
    }

    const inserted = await insertUserBook(hardcoverId, statusId, startedAt, finishedAt);
    return inserted
      ? { success: true, userBook: inserted }
      : { success: false, error: 'Failed to insert user book' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Hardcover upsertReadingStatus error: ${message}`);
    return { success: false, error: message };
  }
}

/**
 * Series book info from Hardcover
 */
export interface SeriesBook {
  id: string;
  title: string;
  authors: string;
  position: number | null;
  coverUrl?: string;
  publishDate?: string;
  description?: string;
}

/**
 * Full series info from Hardcover
 */
export interface SeriesInfo {
  id: string;
  name: string;
  books: SeriesBook[];
}

/**
 * Search for a series by name and return all books in it
 * Uses book search since direct series query may not be available
 */
export async function searchSeries(seriesName: string): Promise<SeriesInfo | null> {
  if (!seriesName.trim()) return null;

  // Search for books in the series by searching the series name
  // This works because Hardcover's search includes series data
  const searchResults = await searchBooks(`"${seriesName}"`, 30);

  if (!searchResults.length) {
    return null;
  }

  // Filter to books that are actually in this series
  const normalizedSearch = seriesName.toLowerCase().trim();
  const seriesBooks: SeriesBook[] = [];
  let foundSeriesId: string | undefined;
  let foundSeriesName = seriesName;

  for (const book of searchResults) {
    if (!book.series) continue;

    // Check if this book is in the series we're looking for
    for (const [name, position] of book.series) {
      if (name.toLowerCase().trim() === normalizedSearch ||
          name.toLowerCase().includes(normalizedSearch) ||
          normalizedSearch.includes(name.toLowerCase())) {
        foundSeriesName = name; // Use the actual series name from the data
        seriesBooks.push({
          id: book.sourceId,
          title: book.title,
          authors: book.authors,
          position: position,
          coverUrl: book.coverUrl,
          publishDate: book.publishDate,
          description: book.description,
        });
        break;
      }
    }
  }

  if (seriesBooks.length === 0) {
    return null;
  }

  // Sort by position
  seriesBooks.sort((a, b) => {
    if (a.position !== null && b.position !== null) return a.position - b.position;
    if (a.position !== null) return -1;
    if (b.position !== null) return 1;
    return a.title.localeCompare(b.title);
  });

  // Remove duplicates (same book ID)
  const uniqueBooks = seriesBooks.filter((book, index, self) =>
    index === self.findIndex(b => b.id === book.id)
  );

  return {
    id: foundSeriesId || `search-${encodeURIComponent(seriesName)}`,
    name: foundSeriesName,
    books: uniqueBooks,
  };
}

/**
 * Get series by Hardcover series ID
 * Note: Direct series queries may not be available, falls back to search
 */
export async function getSeriesById(seriesId: string): Promise<SeriesInfo | null> {
  // Direct series queries may not be available in the API
  // Fall back to null - caller should use searchSeries instead
  console.log(`getSeriesById called with ${seriesId} - use searchSeries instead`);
  return null;
}
