import { extname } from 'path';
import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth, ensureIssuePagesExtracted, PdfNotPaginatedError } from '@shelvarr/services';
import { queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Page count + list for a CBZ/CBR book, so a reader can fetch pages one at a
 * time instead of downloading and decompressing the whole archive up front.
 *
 * Mirrors /api/comics/issues/[id]/pages exactly, reusing the same
 * extract-once cache (`@shelvarr/services`' `comics/pages.ts`) under the
 * 'book' namespace so a comic issue and a book never collide even if they
 * happen to share an id number. `remap: false` is passed unconditionally —
 * `needsRemap`/`COMIC_PATH_MAP` is a comic-migration concept (see
 * `getComicIssueFileRef`) that has no book equivalent.
 *
 * A PDF book gets the same 400 the comic route gives a PDF issue, pointing
 * at the whole-file route — see the doc comment on `ensureIssuePagesExtracted`
 * for why PDFs aren't paginated this way. An EPUB is neither an image archive
 * nor a PDF, so it gets its own distinct 400 up front rather than falling
 * through to a confusing "unsupported format" extraction failure.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const bookId = parseInt(id, 10);
  if (!Number.isFinite(bookId)) {
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
    const { files } = await ensureIssuePagesExtracted(bookId, row.file_path, {
      remap: false,
      namespace: 'book',
    });
    return NextResponse.json({
      count: files.length,
      pages: files.map((_, index) => ({ n: index + 1 })),
    });
  } catch (err) {
    if (err instanceof PdfNotPaginatedError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[books/pages] book ${bookId} (${row.file_path}): ${message}`);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
