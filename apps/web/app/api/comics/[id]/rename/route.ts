import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth, comicRename, queue } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

function parseVolumeId(id: string): number | null {
  const volumeId = parseInt(id, 10);
  return Number.isFinite(volumeId) ? volumeId : null;
}

/** What a rename would do. An empty `files` list means nothing to do. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const volumeId = parseVolumeId(id);
  if (volumeId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    return NextResponse.json(comicRename.previewVolumeRename(volumeId));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to preview rename';
    return NextResponse.json({ error: message }, { status: message.includes('not found') ? 404 : 500 });
  }
}

/** Apply the rename in the background. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const volumeId = parseVolumeId(id);
  if (volumeId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  return NextResponse.json(
    { task: queue.enqueueTask('comic_rename', { volumeId }) },
    { status: 202 }
  );
}
