import { NextResponse } from 'next/server';
import '@/lib/config';
import { queryOne, getReadProgress, upsertReadProgress, deleteReadProgress } from '@/lib/db';
import { validateApiAuth } from '@shelvarr/services';

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

  const book = queryOne<{ id: number }>('SELECT id FROM books WHERE id = ?', [bookId]);
  if (!book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  upsertReadProgress(bookId, body.page || 0, body.completed || false);
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
