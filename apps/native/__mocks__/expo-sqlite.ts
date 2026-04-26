/**
 * Jest mock for expo-sqlite backed by better-sqlite3 running in-memory.
 * Gives tests real SQL semantics while keeping the production import of
 * `expo-sqlite` untouched on-device.
 */
import BetterSqlite3 from 'better-sqlite3';

class FakeDatabase {
  private db: BetterSqlite3.Database;
  closed = false;

  constructor() {
    this.db = new BetterSqlite3(':memory:');
  }

  async execAsync(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async runAsync(sql: string, params: unknown[] = []): Promise<{ lastInsertRowId: number; changes: number }> {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return {
      lastInsertRowId: Number(result.lastInsertRowid),
      changes: result.changes,
    };
  }

  async getAllAsync<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  async getFirstAsync<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    const row = stmt.get(...params);
    return (row ?? null) as T | null;
  }

  async withTransactionAsync(fn: () => Promise<void>): Promise<void> {
    this.db.exec('BEGIN');
    try {
      await fn();
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async closeAsync(): Promise<void> {
    this.db.close();
    this.closed = true;
  }
}

const openDatabases = new Map<string, FakeDatabase>();

export async function openDatabaseAsync(name: string): Promise<FakeDatabase> {
  const existing = openDatabases.get(name);
  if (existing && !existing.closed) return existing;
  const fresh = new FakeDatabase();
  openDatabases.set(name, fresh);
  return fresh;
}

export function _resetAllDatabases(): void {
  for (const db of openDatabases.values()) {
    if (!db.closed) {
      db.closeAsync().catch(() => {});
    }
  }
  openDatabases.clear();
}

export type SQLiteDatabase = FakeDatabase;
