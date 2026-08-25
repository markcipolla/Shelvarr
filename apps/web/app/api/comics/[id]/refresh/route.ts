import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth, queue } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

/** Re-fetch a volume's metadata from ComicVine and rescan its folder. */
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

  return NextResponse.json(
    { task: queue.enqueueTask('comic_refresh', { volumeId }) },
    { status: 202 }
  );
}
