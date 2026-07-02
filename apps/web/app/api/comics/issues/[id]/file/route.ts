import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { kapowarrClient, configureKapowarrFromDb } from '@/lib/services/kapowarr';
import { validateApiAuth, openComicArchive } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

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

  const configured = await configureKapowarrFromDb();
  if (!configured) {
    return NextResponse.json({ error: 'Kapowarr not configured' }, { status: 503 });
  }

  // Phase 1: resolve the issue from Kapowarr. A failure here is an upstream
  // problem (issue missing / Kapowarr unreachable), NOT a missing local file.
  let issue;
  try {
    issue = await kapowarrClient.getIssue(issueId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[comics/file] getIssue(${issueId}) failed: ${message}`);
    const upstream404 = /\b404\b/.test(message);
    return NextResponse.json(
      { error: `Kapowarr could not return issue ${issueId}: ${message}` },
      { status: upstream404 ? 404 : 502 }
    );
  }

  const file = issue.files?.[0];
  if (!file || !file.filepath) {
    // Log the raw shape: if issues wrongly appear "downloaded", this reveals
    // what Kapowarr actually put in `files` for this issue.
    console.error(
      `[comics/file] issue ${issueId} has no downloadable file; files=${JSON.stringify(issue.files)}`
    );
    return NextResponse.json({ error: 'No file available for this issue' }, { status: 404 });
  }

  // Phase 2: open the file on disk (after KAPOWARR_PATH_MAP remap).
  try {
    const { contentType, body, filename } = await openComicArchive(file.filepath);

    return new Response(body as ReadableStream | BodyInit, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'File error';
    console.error(
      `[comics/file] openComicArchive failed for issue ${issueId} (${file.filepath}): ${message}`
    );
    if (/unsupported comic format/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 415 });
    }
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
