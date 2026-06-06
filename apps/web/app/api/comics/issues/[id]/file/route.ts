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

  try {
    const issue = await kapowarrClient.getIssue(issueId);
    const file = issue.files[0];
    if (!file) {
      return NextResponse.json({ error: 'No file available for this issue' }, { status: 404 });
    }

    const { contentType, body, filename } = await openComicArchive(file.filepath);

    return new Response(body as ReadableStream | BodyInit, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'File not found';
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
