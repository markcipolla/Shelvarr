import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth, getReadingUserId } from '@shelvarr/services';
import { getReadComicVolumeIds, listComicVolumes } from '@/lib/db';
import type { ComicListSort } from '@/lib/db';

export const dynamic = 'force-dynamic';

const VALID_SORTS: ComicListSort[] = [
  'title',
  'year',
  'volume_number',
  'recently_added',
  'publisher',
];

/**
 * The comic library, filtered and sorted in the database. Each volume carries
 * `read`: whether the requester has finished every issue of it.
 */
export async function GET(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get('search') || undefined;
  const sortParam = searchParams.get('sort');
  const sort =
    sortParam && (VALID_SORTS as string[]).includes(sortParam)
      ? (sortParam as ComicListSort)
      : undefined;

  const volumes = listComicVolumes({ ...(search ? { search } : {}), ...(sort ? { sort } : {}) });
  const readIds = getReadComicVolumeIds(
    getReadingUserId(request.headers),
    volumes.map((volume) => volume.id)
  );

  return NextResponse.json({
    volumes: volumes.map((volume) => ({ ...volume, read: readIds.has(volume.id) })),
  });
}
