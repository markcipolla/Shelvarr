/**
 * Applies a batch of server-side rows (from /api/sync) to the local SQLite
 * mirror. Each row may be a normal update or a tombstone (`deleted_at` set).
 * This module is table-generic — it takes a column list and an array of rows.
 */
import { getDatabase } from './database';

export interface RowLike {
  id: number;
  deleted_at: string | null;
  [key: string]: unknown;
}

export async function applyRows(
  table: string,
  rows: RowLike[]
): Promise<{ upserted: number; tombstoned: number }> {
  if (rows.length === 0) return { upserted: 0, tombstoned: 0 };
  const db = await getDatabase();
  let upserted = 0;
  let tombstoned = 0;

  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      if (row.deleted_at) {
        await db.runAsync(
          `UPDATE ${table} SET deleted_at = ?, updated_at = ? WHERE id = ?`,
          [row.deleted_at, String(row.updated_at ?? row.deleted_at), row.id]
        );
        tombstoned += 1;
        continue;
      }

      const columns = Object.keys(row);
      const placeholders = columns.map(() => '?').join(', ');
      const assignments = columns
        .filter((c) => c !== 'id')
        .map((c) => `${c} = excluded.${c}`)
        .join(', ');

      const sql = `INSERT INTO ${table} (${columns.join(', ')})
        VALUES (${placeholders})
        ON CONFLICT (id) DO UPDATE SET ${assignments}`;

      await db.runAsync(sql, columns.map((c) => row[c] as unknown));
      upserted += 1;
    }
  });

  return { upserted, tombstoned };
}
