import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth, openComicArchive } from '@shelvarr/services';
import { getComicIssueFileRef } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Stream an issue's file to the reader.
 *
 * Managed volumes record their own paths and are opened as-is. A volume that
 * has not been migrated yet still carries the path its previous manager
 * recorded, which goes through the migration path map first.
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
    const { contentType, body, filename } = await openComicArchive(file.filepath, {
      remap: file.needsRemap,
    });

    return new Response(body as ReadableStream | BodyInit, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[comics/file] issue ${issueId} (${file.filepath}): ${message}`);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
