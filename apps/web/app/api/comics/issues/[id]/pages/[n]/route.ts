import { createReadStream } from 'fs';
import { extname } from 'path';
import { Readable } from 'stream';
import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth, getIssuePagePath, PdfNotPaginatedError } from '@shelvarr/services';
import { getComicIssueFileRef } from '@/lib/db';

export const dynamic = 'force-dynamic';

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/**
 * Serve one page (1-indexed) of an issue's cached extraction.
 *
 * If this is the first time the issue has been requested — `/pages` was
 * never called first — the cache is populated here instead, on demand.
 * Once cached, this is just a file stream: no re-extraction.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; n: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, n } = await params;
  const issueId = parseInt(id, 10);
  const pageNumber = parseInt(n, 10);
  if (!Number.isFinite(issueId) || !Number.isFinite(pageNumber)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const file = getComicIssueFileRef(issueId);
  if (!file) {
    return NextResponse.json({ error: 'No file available for this issue' }, { status: 404 });
  }

  try {
    const pagePath = await getIssuePagePath(issueId, file.filepath, pageNumber, {
      remap: file.needsRemap,
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
    console.error(`[comics/pages] issue ${issueId} page ${pageNumber} (${file.filepath}): ${message}`);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
