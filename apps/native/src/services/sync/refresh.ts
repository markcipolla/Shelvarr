/**
 * Background refresh policy for the native app. Decides whether the
 * local mirror needs to sync based on how long ago the last sync ran,
 * then invokes the sync engine. Safe to call from app startup or any
 * foreground event — enforces a minimum interval between syncs.
 */
import { getLastSyncedAt } from '../db/syncState';
import { syncFromServer, type SyncResult } from './index';

const SYNC_KEY = 'all';
const DEFAULT_MIN_INTERVAL_MIN = 30;

export interface MaybeSyncResult {
  ran: boolean;
  skippedBecause?: 'recent' | 'offline';
  ageMinutes?: number;
  result?: SyncResult;
  error?: string;
}

export async function maybeSync(
  minIntervalMinutes = DEFAULT_MIN_INTERVAL_MIN
): Promise<MaybeSyncResult> {
  const last = await getLastSyncedAt(SYNC_KEY);
  if (last) {
    const ageMs = Date.now() - Date.parse(last);
    const ageMinutes = ageMs / 60_000;
    if (Number.isFinite(ageMinutes) && ageMinutes < minIntervalMinutes) {
      return { ran: false, skippedBecause: 'recent', ageMinutes };
    }
  }

  try {
    const result = await syncFromServer();
    return { ran: true, result };
  } catch (err) {
    return {
      ran: false,
      skippedBecause: 'offline',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
