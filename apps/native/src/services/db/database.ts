/**
 * Lazily opens the local SQLite database used for offline caching.
 * The expo-sqlite API is async; all cache modules await getDatabase().
 */
import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL } from './schema';

let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export const DB_NAME = 'shelvarr-cache.db';

/**
 * Columns added to the cache after it first shipped.
 *
 * `CREATE TABLE IF NOT EXISTS` leaves an existing table alone, so a column
 * added to SCHEMA_SQL never reaches an installed app without this. Dropping
 * the cache instead would cost the user their offline library.
 */
const ADDED_COLUMNS: Array<[table: string, column: string, definition: string]> = [
  ['comics', 'slug', 'TEXT'],
];

async function addMissingColumns(db: SQLite.SQLiteDatabase): Promise<void> {
  for (const [table, column, definition] of ADDED_COLUMNS) {
    const existing = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(${table})`
    );
    if (existing.some((col) => col.name === column)) continue;
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = (async () => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync(SCHEMA_SQL);
    await addMissingColumns(db);
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
