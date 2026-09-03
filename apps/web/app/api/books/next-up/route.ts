import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { getNextUpBooks, getWantToReadBooks, getReadProgress } from '@/lib/db';
import { validateApiAuth } from '@shelvarr/services';
import { toApiBook, toPagedResponse } from '@shelvarr/services/api-response';

// Cap on how many books are gathered before in-memory pagination. This home row
// is short, so this is effectively "all" while bounding the query.
const MAX_ROWS = 500;

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

// Merge book lists, keeping the first occurrence of each id (order-preserving).
function dedupeById(rows: BookRow[]): BookRow[] {
  const seen = new Set<number>();
  const out: BookRow[] = [];
  for (const row of rows) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      out.push(row);
    }
  }
  return out;
}

// "Next Up" = the next unread book in each series the user is partway through,
// plus books the user marked "want to read" on Hardcover and hasn't started.
export function GET(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const page = parseInt(searchParams.get('page') || '0');
  const size = parseInt(searchParams.get('size') || '20');
  const offset = page * size;

  const seriesRows = getNextUpBooks<BookRow>(MAX_ROWS, 0);
  const wantToReadRows = getWantToReadBooks<BookRow>(MAX_ROWS, 0);

  const merged = dedupeById([...seriesRows, ...wantToReadRows]);
  const pageRows = merged.slice(offset, offset + size);
  const content = pageRows.map((b) => toApiBook(b, getReadProgress(b.id)));

  return NextResponse.json(toPagedResponse(content, page, size, merged.length));
}
