/**
 * Lazily opens the local SQLite database used for offline caching.
 * The expo-sqlite API is async; all cache modules await getDatabase().
 */
import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL } from './schema';

let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export const DB_NAME = 'shelvarr-cache.db';

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = (async () => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync(SCHEMA_SQL);
    return db;
  })();
  return _dbPromise;
}

export async function resetDatabase(): Promise<void> {
  if (!_dbPromise) return;
  const db = await _dbPromise;
  await db.closeAsync();
  _dbPromise = null;
}
