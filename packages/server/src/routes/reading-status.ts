import { Hono } from 'hono';
import { queryOne } from '@shelvarr/db';
import { upsertReadingStatus, HardcoverStatusId } from '@shelvarr/services/metadata/hardcover';

const readingStatus = new Hono();

const STATUS_MAP: Record<string, HardcoverStatusId> = {
  reading: 2,
  read: 3,
  dnf: 5,
};

readingStatus.post('/by-komga', async (c) => {
  const body = await c.req.json<{ komgaBookId?: string; status?: string }>();

  if (!body.komgaBookId) {
    return c.json({ error: 'Missing komgaBookId' }, 400);
  }

  const statusId = body.status ? STATUS_MAP[body.status] : undefined;
  if (!statusId) {
    return c.json({ error: 'Invalid status. Must be: reading, read, or dnf' }, 400);
  }

  const book = queryOne<{
    id: number;
    metadata_id: string | null;
    metadata_source: string | null;
  }>(
    'SELECT id, metadata_id, metadata_source FROM books WHERE komga_book_id = ?',
    [body.komgaBookId]
  );

  if (!book) {
    return c.json({ error: 'Book not found for Komga ID' }, 404);
  }

  if (!book.metadata_id || book.metadata_source !== 'hardcover') {
    return c.json({ error: 'Book has no Hardcover ID' }, 400);
  }

  const now = new Date().toISOString().split('T')[0];
  const result = await upsertReadingStatus(
    book.metadata_id,
    statusId,
    statusId === 2 ? now : undefined,
    statusId === 3 ? now : undefined,
  );

  if (!result.success) {
    return c.json({ error: result.error }, 500);
  }

  return c.json({ success: true, userBook: result.userBook });
});

export default readingStatus;
