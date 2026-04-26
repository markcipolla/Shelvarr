/**
 * Background refresh for cached Kapowarr data. Pulls the current volume
 * list and refreshes detail for any volume whose detail cache is older
 * than `maxAgeMinutes`. Designed to be called from a cron, a manual
 * endpoint, or app startup.
 */
import { query, upsertComicVolumes, upsertComicDetail, softDeleteComic } from '@/lib/db';
import { kapowarrClient, configureKapowarrFromDb } from '@/lib/services/kapowarr';
import type { KapowarrVolume } from '@shelvarr/types';

export interface RefreshSummary {
  configured: boolean;
  refreshedVolumes: number;
  refreshedDetails: number;
  tombstoned: number;
  errors: string[];
}

export interface RefreshOptions {
  detailMaxAgeMinutes?: number;
  maxDetailsPerRun?: number;
}

const DEFAULT_DETAIL_MAX_AGE_MIN = 60 * 12; // 12 hours
const DEFAULT_MAX_DETAILS_PER_RUN = 25;

export async function refreshStaleComics(
  options: RefreshOptions = {}
): Promise<RefreshSummary> {
  const {
    detailMaxAgeMinutes = DEFAULT_DETAIL_MAX_AGE_MIN,
    maxDetailsPerRun = DEFAULT_MAX_DETAILS_PER_RUN,
  } = options;

  const summary: RefreshSummary = {
    configured: false,
    refreshedVolumes: 0,
    refreshedDetails: 0,
    tombstoned: 0,
    errors: [],
  };

  const configured = await configureKapowarrFromDb();
  summary.configured = configured;
  if (!configured) return summary;

  let remoteVolumes: KapowarrVolume[];
  try {
    remoteVolumes = await kapowarrClient.getVolumes();
  } catch (err) {
    summary.errors.push(
      `volumes list: ${err instanceof Error ? err.message : String(err)}`
    );
    return summary;
  }

  upsertComicVolumes(remoteVolumes);
  summary.refreshedVolumes = remoteVolumes.length;

  // Soft-delete local comics not returned by the server.
  const remoteIds = new Set(remoteVolumes.map((v) => v.id));
  const localRows = query<{ id: number }>(
    'SELECT id FROM comics WHERE deleted_at IS NULL'
  );
  for (const row of localRows) {
    if (!remoteIds.has(row.id)) {
      softDeleteComic(row.id);
      summary.tombstoned += 1;
    }
  }

  // Refresh details for the most stale volumes.
  const cutoffIso = new Date(Date.now() - detailMaxAgeMinutes * 60_000).toISOString();
  const stale = query<{ id: number }>(
    `SELECT id FROM comics
      WHERE deleted_at IS NULL
        AND (detail_cached_at IS NULL OR detail_cached_at < ?)
      ORDER BY detail_cached_at IS NULL DESC, detail_cached_at ASC
      LIMIT ?`,
    [cutoffIso, maxDetailsPerRun]
  );

  for (const { id } of stale) {
    try {
      const detail = await kapowarrClient.getVolume(id);
      upsertComicDetail(detail);
      summary.refreshedDetails += 1;
    } catch (err) {
      summary.errors.push(
        `detail ${id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return summary;
}
