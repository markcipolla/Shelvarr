import { NextResponse } from 'next/server';
import '@/lib/config';
import { query, getReadProgress } from '@/lib/db';
import { validateApiAuth } from '@shelvarr/services';
import { toApiBook } from '@shelvarr/services/api-response';

export const dynamic = 'force-dynamic';

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const books = query<BookRow>(
    `SELECT b.* FROM books b
     JOIN book_series bs ON b.id = bs.book_id
     WHERE bs.series_id = ?
     ORDER BY bs.position, b.title COLLATE NOCASE`,
    [id]
  );

  return NextResponse.json(books.map(b => toApiBook(b, getReadProgress(b.id))));
}
