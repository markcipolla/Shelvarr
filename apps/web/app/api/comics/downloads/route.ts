import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth } from '@shelvarr/services';
import { getComicDownloads, getComicDownloadHistory } from '@/lib/db';
import type { ComicDownloadState } from '@shelvarr/types';

export const dynamic = 'force-dynamic';

const STATES: ComicDownloadState[] = [
  'queued',
  'downloading',
  'importing',
  'completed',
  'failed',
  'cancelled',
];

/** The comic download queue, plus recent history. */
export async function GET(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const stateParam = params.get('state');
  if (stateParam && !STATES.includes(stateParam as ComicDownloadState)) {
    return NextResponse.json({ error: `Unknown state: ${stateParam}` }, { status: 400 });
  }

  const volumeParam = params.get('volumeId');
  const volumeId = volumeParam ? parseInt(volumeParam, 10) : undefined;
  if (volumeParam && !Number.isFinite(volumeId)) {
    return NextResponse.json({ error: 'Invalid volumeId' }, { status: 400 });
  }

  return NextResponse.json({
    downloads: getComicDownloads({
      ...(stateParam ? { state: stateParam as ComicDownloadState } : {}),
      ...(volumeId !== undefined ? { volumeId } : {}),
    }),
    history: getComicDownloadHistory(25, volumeId),
  });
}
