'use server';

import { query } from '@/lib/db';
import * as metadataService from '@/lib/services/metadata';

export interface LocalSearchResult {
  type: 'book' | 'author' | 'series';
  id: number | string;
  title: string;
  subtitle?: string;
  coverUrl?: string;
  href: string;
}

export interface HardcoverSearchResult {
  hardcoverId: string;
  title: string;
  author?: string;
  coverUrl?: string;
  publishYear?: string;
  description?: string;
}

/**
 * Search local books, authors, and series
 */
export async function searchLocal(searchQuery: string, limit = 10): Promise<LocalSearchResult[]> {
  if (!searchQuery || searchQuery.length < 2) return [];

  const results: LocalSearchResult[] = [];
  const searchTerm = `%${searchQuery}%`;

  // Search books
  const books = query<{
    id: number;
    title: string | null;
    authors: string | null;
    cover_url: string | null;
  }>(
    `SELECT id, title, authors, cover_url FROM books
     WHERE title LIKE ? OR authors LIKE ?
     ORDER BY title COLLATE NOCASE
     LIMIT ?`,
    [searchTerm, searchTerm, Math.ceil(limit / 3)]
  );

  for (const book of books) {
    let authorName = '';
    if (book.authors) {
      try {
        const arr = JSON.parse(book.authors);
        if (Array.isArray(arr) && arr.length > 0) {
          authorName = arr[0];
        }
      } catch {
        authorName = book.authors;
      }
    }
    results.push({
      type: 'book',
      id: book.id,
      title: book.title || 'Unknown',
      subtitle: authorName,
      coverUrl: book.cover_url || undefined,
      href: `/books/${book.id}`,
    });
  }

  // Search authors
  const authors = query<{
    id: number;
    name: string;
    total_works: number | null;
  }>(
    `SELECT id, name, total_works FROM authors
     WHERE name LIKE ?
     ORDER BY name COLLATE NOCASE
     LIMIT ?`,
    [searchTerm, Math.ceil(limit / 3)]
  );

  for (const author of authors) {
    results.push({
      type: 'author',
      id: author.id,
      title: author.name,
      subtitle: author.total_works ? `${author.total_works} works` : undefined,
      href: `/authors/${author.id}`,
    });
  }

  // Search series
  const series = query<{
    name: string;
    book_count: number;
  }>(
    `SELECT series_name as name, COUNT(*) as book_count FROM books
     WHERE series_name LIKE ? AND series_name IS NOT NULL
     GROUP BY series_name
     ORDER BY series_name COLLATE NOCASE
     LIMIT ?`,
    [searchTerm, Math.ceil(limit / 3)]
  );

  for (const s of series) {
    results.push({
      type: 'series',
      id: s.name,
      title: s.name,
      subtitle: `${s.book_count} book${s.book_count !== 1 ? 's' : ''}`,
      href: `/series/${encodeURIComponent(s.name)}`,
    });
  }

  return results.slice(0, limit);
}

/**
 * Search Hardcover for books not in library
 */
export async function searchHardcover(searchQuery: string, limit = 10): Promise<HardcoverSearchResult[]> {
  if (!searchQuery || searchQuery.length < 2) return [];

  try {
    const results = await metadataService.searchBooks(searchQuery, { maxResults: limit });

    return results.map(book => {
      let author = '';
      if (book.authors) {
        try {
          const arr = JSON.parse(book.authors);
          if (Array.isArray(arr) && arr.length > 0) {
            author = arr[0];
          }
        } catch {
          author = book.authors;
        }
      }

      return {
        hardcoverId: book.sourceId,
        title: book.title,
        author,
        coverUrl: book.coverUrl,
        publishYear: book.publishDate?.split('-')[0],
        description: book.description,
      };
    });
  } catch (error) {
    console.error('Hardcover search failed:', error);
    return [];
  }
}
