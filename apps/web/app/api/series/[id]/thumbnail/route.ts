import { NextResponse } from 'next/server';
import '@/lib/config';
import { queryOne } from '@/lib/db';
import { validateApiAuth } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const book = queryOne<{ id: number; cover_url: string | null }>(
    `SELECT b.id, b.cover_url FROM books b
     JOIN book_series bs ON b.id = bs.book_id
     WHERE bs.series_id = ?
     ORDER BY bs.position LIMIT 1`,
    [id]
  );

  if (book?.cover_url) {
    return NextResponse.redirect(book.cover_url);
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
