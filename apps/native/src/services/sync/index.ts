/**
 * Syncs the local SQLite mirror with the Shelvarr server.
 * Pulls rows modified since the last successful sync, applies them
 * (upsert or tombstone), and bumps the sync cursor on success.
 */
import { getApiClient } from '../api/client';
import { getLastSyncedAt, setLastSyncedAt } from '../db/syncState';
import { applyRows, type RowLike } from '../db/syncApply';

const SYNC_KEY = 'all';

export interface SyncResult {
  since: string | null;
  now: string;
  comics: { upserted: number; tombstoned: number };
  comic_issues: { upserted: number; tombstoned: number };
  books: { upserted: number; tombstoned: number };
}

interface SyncResponse {
  comics: RowLike[];
  comic_issues: RowLike[];
  books: RowLike[];
  now: string;
}

export async function syncFromServer(): Promise<SyncResult> {
  const since = await getLastSyncedAt(SYNC_KEY);

  const { data } = await getApiClient().get<SyncResponse>('/api/sync', {
    params: since ? { since } : {},
  });

  const comics = await applyRows('comics', data.comics ?? []);
  const comic_issues = await applyRows('comic_issues', data.comic_issues ?? []);
  const books = await applyRows('books', data.books ?? []);

  await setLastSyncedAt(SYNC_KEY, data.now);

  return {
    since,
    now: data.now,
    comics,
    comic_issues,
    books,
  };
}
