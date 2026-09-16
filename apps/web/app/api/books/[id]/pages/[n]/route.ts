import { createReadStream } from 'fs';
import { extname } from 'path';
import { Readable } from 'stream';
import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth, getIssuePagePath, PdfNotPaginatedError } from '@shelvarr/services';
import { queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/**
 * Serve one page (1-indexed) of a CBZ/CBR book's cached extraction.
 *
 * Mirrors /api/comics/issues/[id]/pages/[n] exactly — see that route and the
 * doc comment on the sibling `/pages` route for why 'book' is passed as the
 * cache namespace, `remap` is always false, and EPUB gets its own 400 instead
 * of falling through to extraction. If this is the first time the book has
 * been requested — `/pages` was never called first — the cache is populated
 * here instead, on demand.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; n: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, n } = await params;
  const bookId = parseInt(id, 10);
  const pageNumber = parseInt(n, 10);
  if (!Number.isFinite(bookId) || !Number.isFinite(pageNumber)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const row = queryOne<{ file_path: string; extension: string | null }>(
    'SELECT file_path, extension FROM books WHERE id = ?',
    [bookId]
  );
  if (!row) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  const ext = (row.extension || extname(row.file_path).replace('.', '')).toLowerCase();
  if (ext === 'epub') {
    return NextResponse.json(
      { error: 'EPUB books are not paginated by this API; use the EPUB reader instead.' },
      { status: 400 }
    );
  }

  try {
    const pagePath = await getIssuePagePath(bookId, row.file_path, pageNumber, {
      remap: false,
      namespace: 'book',
    });
    if (!pagePath) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    const contentType = CONTENT_TYPES[extname(pagePath).toLowerCase()] || 'application/octet-stream';
    const stream = createReadStream(pagePath);
    const webStream = Readable.toWeb(stream) as ReadableStream;

    return new Response(webStream, {
      headers: { 'Content-Type': contentType },
    });
  } catch (err) {
    if (err instanceof PdfNotPaginatedError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[books/pages] book ${bookId} page ${pageNumber} (${row.file_path}): ${message}`);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
