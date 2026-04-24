import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { kapowarrClient, configureKapowarrFromDb } from '@/lib/services/kapowarr';
import { validateApiAuth } from '@shelvarr/services';
import type { KapowarrSort } from '@shelvarr/services/kapowarr/index';
import { getCachedComics, upsertComicVolumes } from '@/lib/db';

export const dynamic = 'force-dynamic';

const VALID_SORTS: KapowarrSort[] = ['title', 'year', 'volume_number', 'recently_added', 'publisher'];

export async function GET(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get('search') || undefined;
  const sortParam = searchParams.get('sort');
  const sort = sortParam && (VALID_SORTS as string[]).includes(sortParam)
    ? (sortParam as KapowarrSort)
    : undefined;

  const cached = getCachedComics();

  const configured = await configureKapowarrFromDb();
  if (!configured) {
    return NextResponse.json({
      configured: false,
      volumes: cached,
      cached: cached.length > 0,
    });
  }

  try {
    const volumes = await kapowarrClient.getVolumes({ query: search, sort });
    if (!search && !sort) {
      upsertComicVolumes(volumes);
    }
    return NextResponse.json({ configured: true, volumes });
  } catch (err) {
    return NextResponse.json({
      configured: true,
      volumes: cached,
      cached: cached.length > 0,
      error: err instanceof Error ? err.message : 'Failed to load comics',
    });
  }
}
