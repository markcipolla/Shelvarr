import { Hono } from 'hono';
import { createReadStream, statSync } from 'fs';
import { extname } from 'path';
import { Readable } from 'stream';
import {
  query,
  queryOne,
  getReadProgress,
  upsertReadProgress,
  deleteReadProgress as dbDeleteReadProgress,
  getEpubProgression,
  upsertEpubProgression,
} from '@shelvarr/db';
import { toKomgaBook, toPagedResponse, toEpubProgression } from '../adapters/komga-response.js';

const books = new Hono();

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

// GET /api/v1/books — search, filter, paginate
books.get('/', (c) => {
  const search = c.req.query('search');
  const readStatus = c.req.query('read_status');
  const libraryId = c.req.query('library_id');
  const sort = c.req.query('sort') || 'created_at';
  const page = parseInt(c.req.query('page') || '0');
  const size = parseInt(c.req.query('size') || '20');
  const offset = page * size;

  let whereClause = 'WHERE 1=1';
  const params: unknown[] = [];

  if (search) {
    whereClause += ' AND (b.title LIKE ? OR b.authors LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  if (libraryId) {
    whereClause += ' AND b.library_id = ?';
    params.push(libraryId);
  }

  if (readStatus === 'IN_PROGRESS') {
    whereClause += ' AND b.id IN (SELECT rp.book_id FROM read_progress rp WHERE rp.completed = 0 AND rp.page > 0)';
  } else if (readStatus === 'UNREAD') {
    whereClause += ' AND b.id NOT IN (SELECT rp.book_id FROM read_progress rp)';
  } else if (readStatus === 'READ') {
    whereClause += ' AND b.id IN (SELECT rp.book_id FROM read_progress rp WHERE rp.completed = 1)';
  }

  const countRow = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM books b ${whereClause}`,
    params
  );
  const totalElements = countRow?.count || 0;

  let orderBy = 'b.created_at DESC';
  if (sort === 'title') orderBy = 'b.title COLLATE NOCASE';
  if (sort === 'updated_at') orderBy = 'b.updated_at DESC';

  const rows = query<BookRow>(
    `SELECT b.* FROM books b ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...params, size, offset]
  );

  const content = rows.map(b => toKomgaBook(b, getReadProgress(b.id)));
  return c.json(toPagedResponse(content, page, size, totalElements));
});

// GET /api/v1/books/ondeck
books.get('/ondeck', (c) => {
  const page = parseInt(c.req.query('page') || '0');
  const size = parseInt(c.req.query('size') || '20');
  const offset = page * size;

  // On deck = in progress (have read_progress but not completed)
  const countRow = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM books b
     JOIN read_progress rp ON b.id = rp.book_id
     WHERE rp.completed = 0 AND rp.page > 0`
  );
  const totalElements = countRow?.count || 0;

  const rows = query<BookRow>(
    `SELECT b.* FROM books b
     JOIN read_progress rp ON b.id = rp.book_id
     WHERE rp.completed = 0 AND rp.page > 0
     ORDER BY rp.updated_at DESC
     LIMIT ? OFFSET ?`,
    [size, offset]
  );

  const content = rows.map(b => toKomgaBook(b, getReadProgress(b.id)));
  return c.json(toPagedResponse(content, page, size, totalElements));
});

// GET /api/v1/books/:id
books.get('/:id', (c) => {
  const id = c.req.param('id');
  const row = queryOne<BookRow>('SELECT * FROM books WHERE id = ?', [id]);

  if (!row) {
    return c.json({ error: 'Book not found' }, 404);
  }

  return c.json(toKomgaBook(row, getReadProgress(row.id)));
});

// GET /api/v1/books/:id/thumbnail
books.get('/:id/thumbnail', (c) => {
  const id = c.req.param('id');
  const row = queryOne<{ cover_url: string | null }>('SELECT cover_url FROM books WHERE id = ?', [id]);

  if (row?.cover_url) {
    return c.redirect(row.cover_url);
  }

  return c.notFound();
});

// GET /api/v1/books/:id/file — stream the actual book file
books.get('/:id/file', (c) => {
  const id = c.req.param('id');
  const row = queryOne<{ file_path: string; extension: string | null; title: string | null }>(
    'SELECT file_path, extension, title FROM books WHERE id = ?',
    [id]
  );

  if (!row) {
    return c.json({ error: 'Book not found' }, 404);
  }

  try {
    const stats = statSync(row.file_path);
    const ext = row.extension || extname(row.file_path).replace('.', '');
    const mediaTypeMap: Record<string, string> = {
      epub: 'application/epub+zip',
      pdf: 'application/pdf',
      cbz: 'application/x-cbz',
      cbr: 'application/x-cbr',
      mobi: 'application/x-mobipocket-ebook',
    };
    const contentType = mediaTypeMap[ext] || 'application/octet-stream';
    const filename = row.title ? `${row.title}.${ext}` : row.file_path.split('/').pop() || 'book';

    const stream = createReadStream(row.file_path);
    const webStream = Readable.toWeb(stream) as ReadableStream;

    return new Response(webStream, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stats.size),
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch {
    return c.json({ error: 'File not found on disk' }, 404);
  }
});

// GET /api/v1/books/:id/pages — page list for CBZ/CBR
books.get('/:id/pages', (c) => {
  // For ebooks this returns an empty array; page-based readers would need CBZ extraction
  return c.json([]);
});

// GET /api/v1/books/:id/pages/:n — serve individual page image
books.get('/:id/pages/:n', (c) => {
  // Not implemented for ebook-only libraries
  return c.notFound();
});

// PATCH /api/v1/books/:id/read-progress
books.patch('/:id/read-progress', async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json<{ page?: number; completed?: boolean }>();

  const book = queryOne<{ id: number }>('SELECT id FROM books WHERE id = ?', [id]);
  if (!book) {
    return c.json({ error: 'Book not found' }, 404);
  }

  upsertReadProgress(id, body.page || 0, body.completed || false);
  return c.json(getReadProgress(id));
});

// DELETE /api/v1/books/:id/read-progress
books.delete('/:id/read-progress', (c) => {
  const id = parseInt(c.req.param('id'));
  dbDeleteReadProgress(id);
  return c.body(null, 204);
});

// GET /api/v1/books/:id/progression — EPUB progression
books.get('/:id/progression', (c) => {
  const id = parseInt(c.req.param('id'));
  const deviceId = c.req.query('device_id') || 'default';

  const progression = getEpubProgression(id, deviceId);
  if (!progression) {
    return c.json(null);
  }

  return c.json(toEpubProgression(progression));
});

// PUT /api/v1/books/:id/progression — update EPUB progression
books.put('/:id/progression', async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json<{
    deviceId?: string;
    locator: unknown;
    progression: number;
  }>();

  const book = queryOne<{ id: number }>('SELECT id FROM books WHERE id = ?', [id]);
  if (!book) {
    return c.json({ error: 'Book not found' }, 404);
  }

  const deviceId = body.deviceId || 'default';
  const locator = typeof body.locator === 'string' ? body.locator : JSON.stringify(body.locator);

  upsertEpubProgression(id, deviceId, locator, body.progression);

  // Also update read progress based on progression
  upsertReadProgress(id, 0, body.progression >= 0.98);

  const result = getEpubProgression(id, deviceId);
  return c.json(toEpubProgression(result));
});

export default books;
