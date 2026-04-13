import { Hono } from 'hono';
import { query, queryOne } from '@shelvarr/db';
import { toKomgaSeries, toKomgaBook, toPagedResponse } from '../adapters/komga-response.js';
import { getReadProgress } from '@shelvarr/db';

const series = new Hono();

interface SeriesRow {
  id: number;
  name: string;
  author: string | null;
  total_books: number | null;
  metadata_source: string | null;
  metadata_id: string | null;
  created_at: string;
  books_count?: number;
  library_id?: number;
}

interface BookRow {
  id: number;
  library_id: number;
  file_path: string;
  file_hash: string | null;
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
}

// GET /api/v1/series?library_id=X
series.get('/', (c) => {
  const libraryId = c.req.query('library_id');
  const page = parseInt(c.req.query('page') || '0');
  const size = parseInt(c.req.query('size') || '20');
  const offset = page * size;

  let whereClause = '';
  const params: unknown[] = [];

  if (libraryId) {
    // Get series from books in this library
    whereClause = 'WHERE s.id IN (SELECT DISTINCT bs.series_id FROM book_series bs JOIN books b ON bs.book_id = b.id WHERE b.library_id = ?)';
    params.push(libraryId);
  }

  const countRow = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM series s ${whereClause}`,
    params
  );
  const totalElements = countRow?.count || 0;

  const rows = query<SeriesRow>(
    `SELECT s.*,
     (SELECT COUNT(*) FROM book_series bs WHERE bs.series_id = s.id) as books_count
     FROM series s ${whereClause}
     ORDER BY s.name COLLATE NOCASE
     LIMIT ? OFFSET ?`,
    [...params, size, offset]
  );

  return c.json(toPagedResponse(rows.map(toKomgaSeries), page, size, totalElements));
});

// GET /api/v1/series/:id
series.get('/:id', (c) => {
  const id = c.req.param('id');
  const row = queryOne<SeriesRow>(
    `SELECT s.*,
     (SELECT COUNT(*) FROM book_series bs WHERE bs.series_id = s.id) as books_count
     FROM series s WHERE s.id = ?`,
    [id]
  );

  if (!row) {
    return c.json({ error: 'Series not found' }, 404);
  }

  return c.json(toKomgaSeries(row));
});

// GET /api/v1/series/:id/books
series.get('/:id/books', (c) => {
  const id = c.req.param('id');

  const books = query<BookRow>(
    `SELECT b.* FROM books b
     JOIN book_series bs ON b.id = bs.book_id
     WHERE bs.series_id = ?
     ORDER BY bs.position, b.title COLLATE NOCASE`,
    [id]
  );

  return c.json(books.map(b => toKomgaBook(b, getReadProgress(b.id))));
});

// GET /api/v1/series/:id/thumbnail
series.get('/:id/thumbnail', (c) => {
  // Get the first book in the series and redirect to its thumbnail
  const book = queryOne<{ id: number; cover_url: string | null }>(
    `SELECT b.id, b.cover_url FROM books b
     JOIN book_series bs ON b.id = bs.book_id
     WHERE bs.series_id = ?
     ORDER BY bs.position LIMIT 1`,
    [c.req.param('id')]
  );

  if (book?.cover_url) {
    return c.redirect(book.cover_url);
  }

  return c.notFound();
});

export default series;
