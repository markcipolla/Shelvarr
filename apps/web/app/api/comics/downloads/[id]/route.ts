import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth } from '@shelvarr/services';
import { deleteComicDownload, getComicDownload, setComicDownloadState } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Cancel a queued or running download. A download that has already finished
 * is removed from the queue outright; cancelling one in flight marks it so the
 * running task stops writing to it.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const downloadId = parseInt(id, 10);
  if (!Number.isFinite(downloadId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const download = getComicDownload(downloadId);
  if (!download) {
    return NextResponse.json({ error: 'Download not found' }, { status: 404 });
  }

  if (download.state === 'queued' || download.state === 'downloading' || download.state === 'importing') {
    setComicDownloadState(downloadId, 'cancelled');
    return NextResponse.json({ cancelled: true });
  }

  deleteComicDownload(downloadId);
  return NextResponse.json({ deleted: true });
}
