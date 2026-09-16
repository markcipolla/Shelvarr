import { getReadComicVolumeIds } from '@/lib/db';
import type { ComicVolumeSummary } from '@shelvarr/types';
import { getReadingUserId } from '@/lib/auth';

/** A volume carrying whether the person looking at it has read the whole thing. */
export type ComicVolumeWithReadState<T extends ComicVolumeSummary = ComicVolumeSummary> = T & {
  read: boolean;
};

/**
 * Tag volumes with the signed-in person's read state, so a grid can show which
 * ones are finished. One query covers the whole page; on a server without
 * accounts this is the shared shelf, as everything progress-shaped is.
 */
export async function withComicReadState<T extends ComicVolumeSummary>(
  volumes: T[]
): Promise<Array<ComicVolumeWithReadState<T>>> {
  if (volumes.length === 0) return [];
  const readIds = getReadComicVolumeIds(
    await getReadingUserId(),
    volumes.map((volume) => volume.id)
  );
  return volumes.map((volume) => ({ ...volume, read: readIds.has(volume.id) }));
}
