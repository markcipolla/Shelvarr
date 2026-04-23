import { NextResponse } from 'next/server';
import '@/lib/config';
import { queryOne, getReadProgress, upsertReadProgress, deleteReadProgress } from '@/lib/db';
import { validateApiAuth } from '@shelvarr/services';
import { upsertReadingStatus } from '@/lib/services/metadata/hardcover';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const bookId = parseInt(id);
  const body = await request.json() as { page?: number; completed?: boolean };

  const book = queryOne<{ id: number; metadata_id: string | null; metadata_source: string | null }>(
    'SELECT id, metadata_id, metadata_source FROM books WHERE id = ?',
    [bookId]
  );
  if (!book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  upsertReadProgress(bookId, body.page || 0, body.completed || false);

  // Sync status to Hardcover on transitions (start reading / finish).
  if (book.metadata_id && book.metadata_source === 'hardcover') {
    const today = new Date().toISOString().split('T')[0];
    if (body.completed) {
      void upsertReadingStatus(book.metadata_id, 3, undefined, today).catch((err) => {
        console.error('Hardcover completion sync failed:', err);
      });
    } else if ((body.page ?? 0) > 0) {
      void upsertReadingStatus(book.metadata_id, 2, today).catch((err) => {
        console.error('Hardcover "reading" sync failed:', err);
      });
    }
  }

  return NextResponse.json(getReadProgress(bookId));
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  deleteReadProgress(parseInt(id));
  return new NextResponse(null, { status: 204 });
}
