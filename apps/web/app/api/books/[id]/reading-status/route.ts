import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { upsertReadingStatus, HardcoverStatusId } from '@/lib/services/metadata/hardcover';

const STATUS_MAP: Record<string, HardcoverStatusId> = {
  reading: 2,
  read: 3,
  dnf: 5,
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const bookId = parseInt(id, 10);

  if (isNaN(bookId)) {
    return NextResponse.json({ error: 'Invalid book ID' }, { status: 400 });
  }

  const body = await request.json() as { status?: string };
  const statusId = body.status ? STATUS_MAP[body.status] : undefined;

  if (!statusId) {
    return NextResponse.json(
      { error: 'Invalid status. Must be: reading, read, or dnf' },
      { status: 400 }
    );
  }

  const book = queryOne<{ metadata_id: string | null; metadata_source: string | null }>(
    'SELECT metadata_id, metadata_source FROM books WHERE id = ?',
    [bookId]
  );

  if (!book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
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
