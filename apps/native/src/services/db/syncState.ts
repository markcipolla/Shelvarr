/**
 * Persistent sync state (last-synced timestamp per entity).
 * Stored in the `sync_state` table so we can incrementally pull
 * updates from the server.
 */
import { getDatabase } from './database';

export async function getLastSyncedAt(entity: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ last_synced_at: string | null }>(
    'SELECT last_synced_at FROM sync_state WHERE entity = ?',
    [entity]
  );
  return row?.last_synced_at ?? null;
}

export async function setLastSyncedAt(entity: string, timestamp: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO sync_state (entity, last_synced_at) VALUES (?, ?)
     ON CONFLICT (entity) DO UPDATE SET last_synced_at = ?`,
    [entity, timestamp, timestamp]
  );
}

export async function clearSyncState(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM sync_state', []);
}
