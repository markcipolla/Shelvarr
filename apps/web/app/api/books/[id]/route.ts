import { NextResponse } from 'next/server';
import '@/lib/config';
import { queryOne, getReadProgress } from '@/lib/db';
import { validateApiAuth } from '@shelvarr/services';
import { toKomgaBook } from '@shelvarr/services/komga-response';

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
  const row = queryOne<BookRow>('SELECT * FROM books WHERE id = ?', [id]);

  if (!row) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  return NextResponse.json(toKomgaBook(row, getReadProgress(row.id)));
}
