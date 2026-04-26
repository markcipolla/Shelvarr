import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { kapowarrClient, configureKapowarrFromDb } from '@/lib/services/kapowarr';
import { validateApiAuth } from '@shelvarr/services';
import { getCachedComicDetail, upsertComicDetail } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
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

  const cached = getCachedComicDetail(volumeId);

  const configured = await configureKapowarrFromDb();
  if (!configured) {
    if (cached) {
      return NextResponse.json({ configured: false, volume: cached, cached: true });
    }
    return NextResponse.json({ configured: false });
  }

  try {
    const volume = await kapowarrClient.getVolume(volumeId);
    upsertComicDetail(volume);
    return NextResponse.json({ configured: true, volume });
  } catch (err) {
    if (cached) {
      return NextResponse.json({
        configured: true,
        volume: cached,
        cached: true,
        error: err instanceof Error ? err.message : 'Failed to load comic',
      });
    }
    return NextResponse.json({
      configured: true,
      error: err instanceof Error ? err.message : 'Failed to load comic',
    });
  }
}
