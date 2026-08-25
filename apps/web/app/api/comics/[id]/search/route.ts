import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth, getcomics, queue } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

function parseVolumeId(id: string): number | null {
  const volumeId = parseInt(id, 10);
  return Number.isFinite(volumeId) ? volumeId : null;
}

/**
 * Manual search: everything GetComics has for this volume, ranked, with a
 * reason on the results that don't match.
 */
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

  const issueParam = request.nextUrl.searchParams.get('issueId');
  const issueId = issueParam ? parseInt(issueParam, 10) : null;
  if (issueParam && !Number.isFinite(issueId)) {
    return NextResponse.json({ error: 'Invalid issueId' }, { status: 400 });
  }

  try {
    const { results } = await getcomics.searchVolume(volumeId, { issueId });
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed';
    const notFound = message.includes('not found');
    return NextResponse.json({ error: message }, { status: notFound ? 404 : 502 });
  }
}

/**
 * Auto-search: queue a background task that picks results itself and starts
 * downloading them.
 */
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

  const body = (await request.json().catch(() => ({}))) as { issueId?: number };
  const task = queue.enqueueTask('comic_search', {
    volumeId,
    issueId: body.issueId ?? null,
  });

  return NextResponse.json({ task }, { status: 202 });
}
