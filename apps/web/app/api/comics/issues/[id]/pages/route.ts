import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth, ensureIssuePagesExtracted, PdfNotPaginatedError } from '@shelvarr/services';
import { getComicIssueFileRef } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Page count + list for an issue, so a reader can fetch pages one at a time
 * instead of downloading and decompressing the whole archive up front.
 *
 * The first request for an issue extracts every page image into a per-issue
 * cache directory (see `@shelvarr/services`' `comics/pages.ts`); later
 * requests for the same issue just read the cached list back. PDFs are not
 * paginated by this API — see the doc comment on `ensureIssuePagesExtracted`
 * for why — and get a 400 pointing at the whole-file route instead.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const issueId = parseInt(id, 10);
  if (!Number.isFinite(issueId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const file = getComicIssueFileRef(issueId);
  if (!file) {
    return NextResponse.json({ error: 'No file available for this issue' }, { status: 404 });
  }

  try {
    const { files } = await ensureIssuePagesExtracted(issueId, file.filepath, {
      remap: file.needsRemap,
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
    console.error(`[comics/pages] issue ${issueId} (${file.filepath}): ${message}`);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
