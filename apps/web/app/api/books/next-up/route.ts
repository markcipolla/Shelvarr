import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { getNextUpBooks, countNextUpBooks, getReadProgress } from '@/lib/db';
import { validateApiAuth } from '@shelvarr/services';
import { toKomgaBook, toPagedResponse } from '@shelvarr/services/komga-response';

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

// The next unread book in each series the user is partway through.
export function GET(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const page = parseInt(searchParams.get('page') || '0');
  const size = parseInt(searchParams.get('size') || '20');
  const offset = page * size;

  const totalElements = countNextUpBooks();
  const rows = getNextUpBooks<BookRow>(size, offset);
  const content = rows.map((b) => toKomgaBook(b, getReadProgress(b.id)));

  return NextResponse.json(toPagedResponse(content, page, size, totalElements));
}
