import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { upsertReadingStatus, HardcoverStatusId } from '@/lib/services/metadata/hardcover';

export const dynamic = 'force-dynamic';

const STATUS_MAP: Record<string, HardcoverStatusId> = {
  reading: 2,
  read: 3,
  dnf: 5,
};

export async function POST(request: NextRequest) {
  const body = await request.json() as { komgaBookId?: string; status?: string };

  if (!body.komgaBookId) {
    return NextResponse.json({ error: 'Missing komgaBookId' }, { status: 400 });
  }

  const statusId = body.status ? STATUS_MAP[body.status] : undefined;
  if (!statusId) {
    return NextResponse.json(
      { error: 'Invalid status. Must be: reading, read, or dnf' },
      { status: 400 }
    );
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
    return NextResponse.json({ error: 'Book not found for Komga ID' }, { status: 404 });
  }

  if (!book.metadata_id || book.metadata_source !== 'hardcover') {
    return NextResponse.json(
      { error: 'Book has no Hardcover ID' },
      { status: 400 }
    );
  }

  const now = new Date().toISOString().split('T')[0];
  const result = await upsertReadingStatus(
    book.metadata_id,
    statusId,
    statusId === 2 ? now : undefined,
    statusId === 3 ? now : undefined,
  );

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, userBook: result.userBook });
}
