'use server';

import { query } from '@/lib/db';
import * as metadataService from '@/lib/services/metadata';
import { kapowarrClient, configureKapowarrFromDb } from '@/lib/services/kapowarr';
import type { Book } from '@/types';
import type { KapowarrVolume } from '@shelvarr/types';

export interface LocalSearchResult {
  type: 'book' | 'author' | 'series' | 'comic';
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

  // Search comics (Kapowarr)
  const comicVolumes = await searchLocalComics(searchQuery, Math.ceil(limit / 3));
  for (const volume of comicVolumes) {
    const subtitle = [volume.publisher, volume.year].filter(Boolean).join(' · ');
    results.push({
      type: 'comic',
      id: volume.id,
      title: volume.title,
      subtitle: subtitle || undefined,
      coverUrl: `/api/comics/${volume.id}/cover`,
      href: `/comics/${volume.id}`,
    });
  }

  return results.slice(0, limit);
}

async function searchLocalComics(searchQuery: string, limit: number): Promise<KapowarrVolume[]> {
  try {
    const configured = await configureKapowarrFromDb();
    if (!configured) return [];
    const volumes = await kapowarrClient.getVolumes({ query: searchQuery });
    return volumes.slice(0, limit);
  } catch (error) {
    console.warn('Comic search failed:', error);
    return [];
  }
}

/**
 * Search local books by title/author. Used by /search page.
 */
export async function searchLocalBooks(searchQuery: string, limit = 20): Promise<Book[]> {
  if (!searchQuery || searchQuery.length < 2) return [];

  const searchTerm = `%${searchQuery}%`;
  const rows = query<{
    id: number;
    library_id: number;
    file_path: string;
    file_hash: string;
    file_size: number | null;
    title: string | null;
    authors: string | null;
    series: string | null;
    series_name: string | null;
    series_number: number | null;
    isbn: string | null;
    publisher: string | null;
    publish_date: string | null;
    description: string | null;
    cover_url: string | null;
    extension: string | null;
    komga_book_id: string | null;
    metadata_source: string | null;
    metadata_id: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT * FROM books
     WHERE title LIKE ? OR authors LIKE ? OR series_name LIKE ?
     ORDER BY title COLLATE NOCASE
     LIMIT ?`,
    [searchTerm, searchTerm, searchTerm, limit]
  );

  return rows.map(row => ({
    id: row.id,
    libraryId: row.library_id,
    filePath: row.file_path,
    fileHash: row.file_hash,
    fileSize: row.file_size,
    title: row.title,
    authors: row.authors,
    series: row.series,
    seriesName: row.series_name,
    seriesNumber: row.series_number,
    isbn: row.isbn,
    publisher: row.publisher,
    publishDate: row.publish_date,
    description: row.description,
    coverUrl: row.cover_url,
    extension: row.extension,
    komgaBookId: row.komga_book_id,
    metadataSource: row.metadata_source,
    metadataId: row.metadata_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Search local comics (Kapowarr). Used by /search page.
 */
export async function searchLocalComicsList(searchQuery: string, limit = 20): Promise<KapowarrVolume[]> {
  return searchLocalComics(searchQuery, limit);
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
