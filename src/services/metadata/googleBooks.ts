/**
 * Google Books API Service
 * https://developers.google.com/books/docs/v1/using
 */

import config from '../../config/index.js';

const API_BASE = 'https://www.googleapis.com/books/v1';

export interface GoogleBookVolume {
  id: string;
  volumeInfo: {
    title: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    industryIdentifiers?: Array<{
      type: string;
      identifier: string;
    }>;
    pageCount?: number;
    categories?: string[];
    imageLinks?: {
      smallThumbnail?: string;
      thumbnail?: string;
      small?: string;
      medium?: string;
      large?: string;
    };
    language?: string;
    previewLink?: string;
    infoLink?: string;
  };
}

export interface GoogleBooksSearchResult {
  totalItems: number;
  items?: GoogleBookVolume[];
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
  source: 'googlebooks';
  sourceId: string;
}

// Simple rate limiter
let lastRequestTime = 0;
const minInterval = 1000 / config.rateLimits.googleBooks; // ms between requests

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
 * Search Google Books by query string
 */
export async function searchBooks(query: string, maxResults = 10): Promise<BookMetadata[]> {
  if (!query.trim()) {
    return [];
  }

  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
    printType: 'books',
  });

  const url = `${API_BASE}/volumes?${params}`;

  try {
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      throw new Error(`Google Books API error: ${response.status}`);
    }

    const data = await response.json() as GoogleBooksSearchResult;

    if (!data.items) {
      return [];
    }

    return data.items.map(volumeToMetadata);
  } catch (error) {
    console.error('Google Books search error:', error);
    throw error;
  }
}

/**
 * Search by ISBN
 */
export async function searchByIsbn(isbn: string): Promise<BookMetadata | null> {
  const cleanIsbn = isbn.replace(/[-\s]/g, '');
  const results = await searchBooks(`isbn:${cleanIsbn}`, 1);
  return results[0] || null;
}

/**
 * Search by title and author
 */
export async function searchByTitleAuthor(
  title: string,
  author?: string
): Promise<BookMetadata[]> {
  let query = `intitle:${title}`;
  if (author) {
    query += `+inauthor:${author}`;
  }
  return searchBooks(query);
}

/**
 * Get book details by Google Books ID
 */
export async function getBookById(volumeId: string): Promise<BookMetadata | null> {
  const url = `${API_BASE}/volumes/${volumeId}`;

  try {
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Google Books API error: ${response.status}`);
    }

    const volume = await response.json() as GoogleBookVolume;
    return volumeToMetadata(volume);
  } catch (error) {
    console.error('Google Books get by ID error:', error);
    throw error;
  }
}

/**
 * Convert Google Books volume to our metadata format
 */
function volumeToMetadata(volume: GoogleBookVolume): BookMetadata {
  const info = volume.volumeInfo;

  // Find ISBN-13 or ISBN-10
  let isbn: string | undefined;
  if (info.industryIdentifiers) {
    const isbn13 = info.industryIdentifiers.find(id => id.type === 'ISBN_13');
    const isbn10 = info.industryIdentifiers.find(id => id.type === 'ISBN_10');
    isbn = isbn13?.identifier || isbn10?.identifier;
  }

  // Get best available cover image
  let coverUrl: string | undefined;
  if (info.imageLinks) {
    coverUrl = info.imageLinks.large ||
               info.imageLinks.medium ||
               info.imageLinks.small ||
               info.imageLinks.thumbnail ||
               info.imageLinks.smallThumbnail;
    // Convert to https if needed
    if (coverUrl?.startsWith('http:')) {
      coverUrl = coverUrl.replace('http:', 'https:');
    }
  }

  return {
    title: info.subtitle ? `${info.title}: ${info.subtitle}` : info.title,
    authors: info.authors?.join(', ') || 'Unknown',
    publisher: info.publisher,
    publishDate: info.publishedDate,
    description: info.description,
    isbn,
    coverUrl,
    pageCount: info.pageCount,
    categories: info.categories,
    language: info.language,
    source: 'googlebooks',
    sourceId: volume.id,
  };
}
