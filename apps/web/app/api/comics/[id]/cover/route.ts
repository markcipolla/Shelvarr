import { NextResponse } from 'next/server';
import '@/lib/config';
import { getComicVolumeCover } from '@/lib/db';
import { validateApiAuth } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

/** A volume's cover, fetched from ComicVine when it was added. */
export async function GET(
  request: Request,
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

  const cover = getComicVolumeCover(volumeId);
  if (!cover) {
    return NextResponse.json({ error: 'No cover stored for this volume' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(cover), {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
