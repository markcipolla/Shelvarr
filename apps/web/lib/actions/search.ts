'use server';

import { query, searchBooksFts, searchComicsFts, buildFtsQuery, listComicVolumes } from '@/lib/db';
import * as metadataService from '@/lib/services/metadata';
import type { Book } from '@/types';
import type { ComicVolumeSummary } from '@shelvarr/types';

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

  // Search books via FTS5
  const books = searchBooksFts(searchQuery, Math.ceil(limit / 3));

  for (const book of books) {
    let authorName = '';
    if (book.authors) {
      try {
        const arr = JSON.parse(book.authors) as unknown;
        if (Array.isArray(arr) && arr.length > 0) {
          authorName = String(arr[0]);
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

  // Search comics via FTS5 against the local cache (works offline).
  const comicRows = searchComicsFts(searchQuery, Math.ceil(limit / 3));
  for (const volume of comicRows) {
    const subtitle = [volume.publisher, volume.year].filter(Boolean).join(' · ');
    results.push({
      type: 'comic',
      id: volume.id,
      title: volume.title,
      subtitle: subtitle || undefined,
      coverUrl: `/api/comics/${volume.id}/cover`,
      href: `/comics/${volume.slug}`,
    });
  }

  return results.slice(0, limit);
}

function searchLocalComics(searchQuery: string, limit: number): ComicVolumeSummary[] {
  try {
    return listComicVolumes({ search: searchQuery }).slice(0, limit);
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

  const match = buildFtsQuery(searchQuery);
  if (!match) return [];

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
    metadata_source: string | null;
    metadata_id: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT b.* FROM books_fts f
       JOIN books b ON b.id = f.rowid
      WHERE f.books_fts MATCH ?
        AND b.deleted_at IS NULL
      ORDER BY rank
      LIMIT ?`,
    [match, limit]
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
    metadataSource: row.metadata_source,
    metadataId: row.metadata_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Search the comic library. Used by the /search page.
 */
export async function searchLocalComicsList(searchQuery: string, limit = 20): Promise<ComicVolumeSummary[]> {
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
