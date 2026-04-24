/**
 * Offline full-text search against the local SQLite cache. Uses the
 * FTS5 virtual tables populated via triggers on insert/update/delete.
 */
import { getDatabase } from './database';

/**
 * Escape a user search query for safe use as an FTS5 MATCH expression.
 */
export function buildFtsQuery(raw: string): string {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/["']/g, ''))
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return '';
  return tokens.map((t) => `"${t}"*`).join(' ');
}

export interface BookSearchRow {
  id: number;
  title: string | null;
  authors: string | null;
  series_name: string | null;
  cover_url: string | null;
}

export async function searchBooks(raw: string, limit = 20): Promise<BookSearchRow[]> {
  const match = buildFtsQuery(raw);
  if (!match) return [];
  const db = await getDatabase();
  return db.getAllAsync<BookSearchRow>(
    `SELECT b.id, b.title, b.authors, b.series_name, b.cover_url
       FROM books_fts f
       JOIN books b ON b.id = f.rowid
      WHERE f.books_fts MATCH ?
        AND b.deleted_at IS NULL
      ORDER BY rank
      LIMIT ?`,
    [match, limit]
  );
}

export interface ComicSearchRow {
  id: number;
  title: string;
  year: number | null;
  publisher: string | null;
}

export async function searchComics(raw: string, limit = 20): Promise<ComicSearchRow[]> {
  const match = buildFtsQuery(raw);
  if (!match) return [];
  const db = await getDatabase();
  return db.getAllAsync<ComicSearchRow>(
    `SELECT c.id, c.title, c.year, c.publisher
       FROM comics_fts f
       JOIN comics c ON c.id = f.rowid
      WHERE f.comics_fts MATCH ?
        AND c.deleted_at IS NULL
      ORDER BY rank
      LIMIT ?`,
    [match, limit]
  );
}
