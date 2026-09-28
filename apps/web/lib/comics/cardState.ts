import { getActiveComicDownloadCounts, getReadComicVolumeIds } from '@/lib/db';
import type { ComicVolumeSummary } from '@shelvarr/types';
import { getReadingUserId } from '@/lib/auth';

/** A volume carrying what a grid draws on top of its cover. */
export type ComicVolumeCardState<T extends ComicVolumeSummary = ComicVolumeSummary> = T & {
  /** Whether the person looking at it has read the whole thing. */
  read: boolean;
  /** Downloads in flight for this volume — 0 when nothing is on its way. */
  downloading: number;
};

/**
 * Tag volumes with the signed-in person's read state and their in-flight
 * downloads, so a grid can show which ones are finished and which are still
 * filling up. Two queries cover the whole page; on a server without accounts
 * the read state is the shared shelf, as everything progress-shaped is.
 */
export async function withComicCardState<T extends ComicVolumeSummary>(
  volumes: T[]
): Promise<Array<ComicVolumeCardState<T>>> {
  if (volumes.length === 0) return [];
  const ids = volumes.map((volume) => volume.id);
  const readIds = getReadComicVolumeIds(await getReadingUserId(), ids);
  const downloading = getActiveComicDownloadCounts(ids);
  return volumes.map((volume) => ({
    ...volume,
    read: readIds.has(volume.id),
    downloading: downloading.get(volume.id) ?? 0,
  }));
}
