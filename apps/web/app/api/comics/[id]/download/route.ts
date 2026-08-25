import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth, getcomics, queue } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

/**
 * Download a specific GetComics article for this volume — the "grab this one"
 * button next to a manual search result.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const volumeId = parseInt(id, 10);
  if (!Number.isFinite(volumeId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    link?: string;
    issueId?: number;
    forceMatch?: boolean;
  };
  if (!body.link) {
    return NextResponse.json({ error: 'link is required' }, { status: 400 });
  }

  try {
    const post = await getcomics.fetchPostByLink(body.link);
    if (!post) {
      return NextResponse.json(
        { error: `Could not load the GetComics article at ${body.link}` },
        { status: 404 }
      );
    }

    const downloads = await getcomics.createDownloadsFromPost({
      volumeId,
      post,
      issueId: body.issueId ?? null,
      forceMatch: body.forceMatch ?? false,
    });

    const tasks = downloads.map((download) =>
      queue.enqueueTask('comic_download', { comicDownloadId: download.id })
    );

    return NextResponse.json({ downloads, tasks }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to queue download';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
