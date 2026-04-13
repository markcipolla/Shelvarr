/**
 * Hardcover.app API Service
 * https://docs.hardcover.app/api/getting-started/
 *
 * GraphQL API for book metadata with excellent series support.
 * Requires API token from account settings.
 */

import config from '../../config/index.js';

const API_BASE = 'https://api.hardcover.app/v1/graphql';

export interface HardcoverBook {
  id: number;
  title: string;
  subtitle?: string;
  slug: string;
  release_date?: string;
  pages?: number;
  description?: string;
  image?: {
    url: string;
  };
  cached_contributors?: Array<{
    author: {
      id: number;
      name: string;
    };
  }>;
  cached_tags?: Array<{
    tag: string;
  }>;
  book_series?: Array<{
    series: {
      id: number;
      name: string;
    };
    position?: number;
  }>;
  editions?: Array<{
    isbn_13?: string;
    isbn_10?: string;
  }>;
}

export interface HardcoverSearchResult {
  results: string; // JSON string of results
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
  source: 'hardcover';
  sourceId: string;
}

// Rate limiting
let lastRequestTime = 0;
const minInterval = 1000 / (config.rateLimits.hardcover / 60);

async function rateLimitedFetch(query: string, variables: Record<string, unknown> = {}): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < minInterval) {
    await new Promise(resolve => setTimeout(resolve, minInterval - timeSinceLastRequest));
  }

  lastRequestTime = Date.now();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  // Add authorization if token is configured
  const token = getApiToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(API_BASE, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });
}

/**
 * Get API token from config or database settings
 */
function getApiToken(): string | null {
  return config.hardcoverToken;
}

/**
 * Search for books
 */
export async function searchBooks(query: string, maxResults = 10): Promise<BookMetadata[]> {
  if (!query.trim()) {
    return [];
  }

  const graphqlQuery = `
    query Search($query: String!, $perPage: Int!) {
      search(query: $query, query_type: "books", per_page: $perPage, page: 1) {
        results
      }
    }
  `;

  try {
    const response = await rateLimitedFetch(graphqlQuery, {
      query,
      perPage: maxResults,
    });

    if (!response.ok) {
      throw new Error(`Hardcover API error: ${response.status}`);
    }

    const data = await response.json() as { data?: { search?: HardcoverSearchResult }; errors?: Array<{ message: string }> };

    if (data.errors && data.errors.length > 0) {
      throw new Error(`Hardcover GraphQL error: ${data.errors[0]?.message || 'Unknown error'}`);
    }

    if (!data.data?.search?.results) {
      return [];
    }

    // Parse the results JSON string
    const results = JSON.parse(data.data.search.results) as Array<{
      document?: HardcoverBook;
      hit?: HardcoverBook;
    }>;

    return results
      .map(r => r.document || r.hit)
      .filter((book): book is HardcoverBook => !!book)
      .map(bookToMetadata);
  } catch (error) {
    console.error('Hardcover search error:', error);
    throw error;
  }
}

/**
 * Search by ISBN
 */
export async function searchByIsbn(isbn: string): Promise<BookMetadata | null> {
  const cleanIsbn = isbn.replace(/[-\s]/g, '');

  // Search for the ISBN
  const results = await searchBooks(cleanIsbn, 5);

  // Find a result that matches the ISBN
  for (const result of results) {
    if (result.isbn === cleanIsbn) {
      return result;
    }
  }

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
 * Get book by ID
 */
export async function getBookById(id: string): Promise<BookMetadata | null> {
  const graphqlQuery = `
    query GetBook($id: Int!) {
      books(where: { id: { _eq: $id } }) {
        id
        title
        subtitle
        slug
        release_date
        pages
        description
        image {
          url
        }
        cached_contributors
        cached_tags
        book_series {
          series {
            id
            name
          }
          position
        }
        editions(limit: 1) {
          isbn_13
          isbn_10
        }
      }
    }
  `;

  try {
    const response = await rateLimitedFetch(graphqlQuery, {
      id: parseInt(id, 10),
    });

    if (!response.ok) {
      throw new Error(`Hardcover API error: ${response.status}`);
    }

    const data = await response.json() as { data?: { books?: HardcoverBook[] }; errors?: Array<{ message: string }> };

    if (data.errors && data.errors.length > 0) {
      throw new Error(`Hardcover GraphQL error: ${data.errors[0]?.message || 'Unknown error'}`);
    }

    const book = data.data?.books?.[0];
    if (!book) {
      return null;
    }

    return bookToMetadata(book);
  } catch (error) {
    console.error('Hardcover get book error:', error);
    throw error;
  }
}

/**
 * Convert Hardcover book to our metadata format
 */
function bookToMetadata(book: HardcoverBook): BookMetadata {
  // Extract authors from cached_contributors
  let authors = 'Unknown';
  if (book.cached_contributors && Array.isArray(book.cached_contributors)) {
    const authorNames = book.cached_contributors
      .filter(c => c.author?.name)
      .map(c => c.author.name);
    if (authorNames.length > 0) {
      authors = authorNames.join(', ');
    }
  }

  // Extract categories from cached_tags
  const categories = book.cached_tags?.map(t => t.tag) || [];

  // Extract series info
  let seriesName: string | undefined;
  let seriesNumber: number | undefined;
  const primarySeries = book.book_series?.[0];
  if (primarySeries) {
    seriesName = primarySeries.series?.name;
    seriesNumber = primarySeries.position ?? undefined;
  }

  // Extract ISBN
  let isbn: string | undefined;
  const primaryEdition = book.editions?.[0];
  if (primaryEdition) {
    isbn = primaryEdition.isbn_13 || primaryEdition.isbn_10;
  }

  return {
    title: book.subtitle ? `${book.title}: ${book.subtitle}` : book.title,
    authors,
    publishDate: book.release_date,
    description: book.description,
    isbn,
    coverUrl: book.image?.url,
    pageCount: book.pages,
    categories,
    seriesName,
    seriesNumber,
    source: 'hardcover',
    sourceId: String(book.id),
  };
}

/**
 * Check if this provider is configured
 */
export function isConfigured(): boolean {
  return !!getApiToken();
}
