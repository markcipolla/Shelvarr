import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { query, queryOne, getReadProgress } from '@/lib/db';
import { validateApiAuth } from '@shelvarr/services';
import { toApiBook, toPagedResponse } from '@shelvarr/services/api-response';

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

export function GET(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get('search');
  const readStatus = searchParams.get('read_status');
  const libraryId = searchParams.get('library_id');
  const sort = searchParams.get('sort') || 'created_at';
  const page = parseInt(searchParams.get('page') || '0');
  const size = parseInt(searchParams.get('size') || '20');
  const offset = page * size;

  let whereClause = 'WHERE 1=1';
  const params: unknown[] = [];

  if (search) {
    whereClause += ' AND (b.title LIKE ? OR b.authors LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  if (libraryId) {
    whereClause += ' AND b.library_id = ?';
    params.push(libraryId);
  }

  if (readStatus === 'IN_PROGRESS') {
    whereClause += ' AND b.id IN (SELECT rp.book_id FROM read_progress rp WHERE rp.completed = 0 AND rp.page > 0)';
  } else if (readStatus === 'UNREAD') {
    whereClause += ' AND b.id NOT IN (SELECT rp.book_id FROM read_progress rp)';
  } else if (readStatus === 'READ') {
    whereClause += ' AND b.id IN (SELECT rp.book_id FROM read_progress rp WHERE rp.completed = 1)';
  }

  const countRow = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM books b ${whereClause}`,
    params
  );
  const totalElements = countRow?.count || 0;

  let orderBy = 'b.created_at DESC';
  if (sort === 'title') orderBy = 'b.title COLLATE NOCASE';
  if (sort === 'updated_at') orderBy = 'b.updated_at DESC';

  const rows = query<BookRow>(
    `SELECT b.* FROM books b ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...params, size, offset]
  );

  const content = rows.map(b => toApiBook(b, getReadProgress(b.id)));
  return NextResponse.json(toPagedResponse(content, page, size, totalElements));
}
