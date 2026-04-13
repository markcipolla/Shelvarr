import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { query, queryOne } from '@/lib/db';
import { validateApiAuth } from '@shelvarr/services';
import { toKomgaSeries, toPagedResponse } from '@shelvarr/services/komga-response';

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

export function GET(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const libraryId = searchParams.get('library_id');
  const page = parseInt(searchParams.get('page') || '0');
  const size = parseInt(searchParams.get('size') || '20');
  const offset = page * size;

  let whereClause = '';
  const params: unknown[] = [];

  if (libraryId) {
    whereClause = 'WHERE s.id IN (SELECT DISTINCT bs.series_id FROM book_series bs JOIN books b ON bs.book_id = b.id WHERE b.library_id = ?)';
    params.push(libraryId);
  }

  const countRow = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM series s ${whereClause}`,
    params
  );
  const totalElements = countRow?.count || 0;

  const rows = query<SeriesRow>(
    `SELECT s.*,
     (SELECT COUNT(*) FROM book_series bs WHERE bs.series_id = s.id) as books_count
     FROM series s ${whereClause}
     ORDER BY s.name COLLATE NOCASE
     LIMIT ? OFFSET ?`,
    [...params, size, offset]
  );

  return NextResponse.json(toPagedResponse(rows.map(toKomgaSeries), page, size, totalElements));
}
