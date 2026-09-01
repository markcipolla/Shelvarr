import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { validateApiAuth } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ komgaId: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { komgaId } = await params;

  if (!komgaId) {
    return NextResponse.json({ error: 'Missing komgaId' }, { status: 400 });
  }

  const book = queryOne<{
    id: number;
    title: string;
    metadata_id: string | null;
    komga_book_id: string | null;
  }>(
    'SELECT id, title, metadata_id, komga_book_id FROM books WHERE komga_book_id = ?',
    [komgaId]
  );

  if (!book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: book.id,
    title: book.title,
    hardcoverId: book.metadata_id,
    komgaBookId: book.komga_book_id,
  });
}
