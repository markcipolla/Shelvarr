import { NextResponse } from 'next/server';
import '@/lib/config';
import { queryOne } from '@/lib/db';
import { validateApiAuth } from '@shelvarr/services';
import { toApiSeries } from '@shelvarr/services/api-response';

export const dynamic = 'force-dynamic';

interface SeriesRow {
  id: number;
  name: string;
  author: string | null;
  total_books: number | null;
  metadata_source: string | null;
  metadata_id: string | null;
  created_at: string;
  books_count?: number;
  library_id?: number;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const row = queryOne<SeriesRow>(
    `SELECT s.*,
     (SELECT COUNT(*) FROM book_series bs WHERE bs.series_id = s.id) as books_count
     FROM series s WHERE s.id = ?`,
    [id]
  );

  if (!row) {
    return NextResponse.json({ error: 'Series not found' }, { status: 404 });
  }

  return NextResponse.json(toApiSeries(row));
}
