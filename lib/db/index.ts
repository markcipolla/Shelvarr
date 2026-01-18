import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import config from '@/lib/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db: Database.Database | null = null;

/**
 * Initialize the database connection and run migrations
 */
export function initDatabase(): Database.Database {
  // Ensure data directory exists
  const dbDir = dirname(config.dbPath);
  mkdirSync(dbDir, { recursive: true });

  console.log(`Opening SQLite database at: ${config.dbPath}`);

  // Create database connection
  db = new Database(config.dbPath);

  // Enable foreign keys and WAL mode for better performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run schema
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  // Run migrations for schema updates
  runMigrations(db);

  console.log('Database initialized successfully');
  return db;
}

/**
 * Run database migrations for schema updates
 */
function runMigrations(database: Database.Database): void {
  // Check if libraries table has 'type' column
  const librariesInfo = database.prepare("PRAGMA table_info(libraries)").all() as Array<{ name: string }>;
  const hasTypeColumn = librariesInfo.some(col => col.name === 'type');

  if (!hasTypeColumn) {
    console.log('Running migration: adding type column to libraries');
    database.exec("ALTER TABLE libraries ADD COLUMN type TEXT DEFAULT 'book'");
  }

  // Check if books table has 'series' column (for multiple series support)
  const booksInfo = database.prepare("PRAGMA table_info(books)").all() as Array<{ name: string }>;
  const hasSeriesColumn = booksInfo.some(col => col.name === 'series');

  if (!hasSeriesColumn) {
    console.log('Running migration: adding series column to books');
    database.exec("ALTER TABLE books ADD COLUMN series TEXT");
  }

  // Check if author_works table has 'language' column
  const authorWorksInfo = database.prepare("PRAGMA table_info(author_works)").all() as Array<{ name: string }>;
  const hasLanguageColumn = authorWorksInfo.some(col => col.name === 'language');

  if (!hasLanguageColumn) {
    console.log('Running migration: adding language column to author_works');
    database.exec("ALTER TABLE author_works ADD COLUMN language TEXT");
  }
}

/**
 * Get the database instance (auto-initializes if needed)
 */
export function getDb(): Database.Database {
  if (!db) {
    initDatabase();
  }
  return db!;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Execute a query and return all rows
 */
export function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): T[] {
  const stmt = getDb().prepare(sql);
  return stmt.all(...params) as T[];
}

/**
 * Execute a query and return the first row
 */
export function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): T | null {
  const stmt = getDb().prepare(sql);
  const row = stmt.get(...params);
  return (row as T) || null;
}

/**
 * Execute a query that modifies data (INSERT, UPDATE, DELETE)
 */
export function execute(
  sql: string,
  params: unknown[] = []
): { rowCount: number; lastInsertRowid: number } {
  const stmt = getDb().prepare(sql);
  const result = stmt.run(...params);
  return {
    rowCount: result.changes,
    lastInsertRowid: Number(result.lastInsertRowid),
  };
}

/**
 * Execute an INSERT and return the inserted row
 */
export function insertReturning<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): T | null {
  // SQLite doesn't support RETURNING in older versions, so we do it manually
  // First, check if the SQL has RETURNING clause
  if (sql.toLowerCase().includes('returning')) {
    // Strip the RETURNING clause and get the table name
    const match = sql.match(/insert\s+into\s+(\w+)/i);
    const tableName = match?.[1];

    // Execute without RETURNING
    const sqlWithoutReturning = sql.replace(/\s+returning\s+.*/i, '');
    const result = execute(sqlWithoutReturning, params);

    if (tableName && result.lastInsertRowid) {
      return queryOne<T>(`SELECT * FROM ${tableName} WHERE id = ?`, [result.lastInsertRowid]);
    }
    return null;
  }

  // Regular insert
  const result = execute(sql, params);
  return { id: result.lastInsertRowid } as T;
}

/**
 * Get a setting value
 */
export function getSetting<T = unknown>(key: string, defaultValue: T | null = null): T | null {
  const row = queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);

  if (!row) return defaultValue;

  try {
    return JSON.parse(row.value) as T;
  } catch {
    return row.value as T;
  }
}

/**
 * Set a setting value
 */
export function setSetting(key: string, value: unknown): void {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  execute(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = ?',
    [key, serialized, serialized]
  );
}

/**
 * Get all settings
 */
export function getAllSettings(): Record<string, unknown> {
  const rows = query<{ key: string; value: string }>('SELECT key, value FROM settings');

  const settings: Record<string, unknown> = {};

  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }

  return settings;
}

// Aliases for compatibility
export const getPool = getDb;
export const initDatabaseAsync = initDatabase;

export default {
  initDatabase,
  getDb,
  getPool,
  closeDatabase,
  query,
  queryOne,
  execute,
  insertReturning,
  getSetting,
  setSetting,
  getAllSettings,
};
