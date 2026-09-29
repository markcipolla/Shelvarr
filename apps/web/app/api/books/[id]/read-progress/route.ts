import { NextResponse } from 'next/server';
import '@/lib/config';
import { queryOne, getReadProgress, upsertReadProgress, deleteReadProgress } from '@/lib/db';
import { validateApiAuth, getReadingUserId } from '@shelvarr/services';
import { upsertReadingStatus } from '@/lib/services/metadata/hardcover';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getReadingUserId(request.headers);
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

  // A client that leaves a field out is saying nothing about it, not zero.
  //
  // The page: a client that only says "completed" — the card's tick, the
  // phone's detail screen — keeps its place in the book. Writing 0 over it
  // would lose the page for good, so marking the book incomplete again would
  // reopen it at the start.
  //
  // And "completed" the same way: a position save that omits it must not
  // un-finish a book somebody has explicitly marked read, or the book climbs
  // straight back onto Currently Reading the next time the reader saves.
  // Only an explicit `completed: false` — Mark unread, Undo — clears it.
  const saved = getReadProgress(userId, bookId);
  const page = body.page ?? saved?.page ?? 0;
  const completed = body.completed ?? saved?.completed === 1;
  upsertReadProgress(userId, bookId, page, completed);

  // Sync status to Hardcover on transitions (start reading / finish). Hardcover
  // is configured once for the whole server, so this mirrors whoever read the
  // book into the one linked account — it is not per-user, and cannot be.
  if (book.metadata_id && book.metadata_source === 'hardcover') {
    const today = new Date().toISOString().split('T')[0];
    if (completed) {
      void upsertReadingStatus(book.metadata_id, 3, undefined, today).catch((err) => {
        console.error('Hardcover completion sync failed:', err);
      });
    } else if ((body.page ?? 0) > 0) {
      void upsertReadingStatus(book.metadata_id, 2, today).catch((err) => {
        console.error('Hardcover "reading" sync failed:', err);
      });
    }
  }

  return NextResponse.json(getReadProgress(userId, bookId));
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  deleteReadProgress(getReadingUserId(request.headers), parseInt(id));
  return new NextResponse(null, { status: 204 });
}
