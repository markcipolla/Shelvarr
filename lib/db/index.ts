import Database from 'better-sqlite3';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import config from '@/lib/config';


// Get directory of this file
let __dbDirname: string;
try {
  const __filename = fileURLToPath(import.meta.url);
  __dbDirname = dirname(__filename);
} catch {
  // Fallback for bundled environments
  __dbDirname = process.cwd();
}

let db: Database.Database | null = null;

/**
 * Find the schema.sql file in various possible locations
 */
function findSchemaPath(): string {
  const possiblePaths = [
    join(__dbDirname, 'schema.sql'),
    join(process.cwd(), 'lib', 'db', 'schema.sql'),
    resolve('lib', 'db', 'schema.sql'),
    join(process.cwd(), '.next', 'standalone', 'lib', 'db', 'schema.sql'),
  ];

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      return p;
    }
  }

  throw new Error(`schema.sql not found. Tried: ${possiblePaths.join(', ')}`);
}

/**
 * Initialize the database connection and run migrations
 */
export function initDatabase(): Database.Database {
  try {
    // Ensure data directory exists
    const dbDir = dirname(config.dbPath);
    mkdirSync(dbDir, { recursive: true });

    console.log(`Opening SQLite database at: ${config.dbPath}`);

    // Create database connection
    db = new Database(config.dbPath);
    console.log('Database connection created');

    // Enable foreign keys and WAL mode for better performance
    db.pragma('journal_mode = WAL');
    console.log('WAL mode enabled');
    db.pragma('foreign_keys = ON');
    console.log('Foreign keys enabled');

    // Run schema
    const schemaPath = findSchemaPath();
    console.log(`Loading schema from: ${schemaPath}`);
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
    console.log('Schema loaded');

    // Run migrations for schema updates
    runMigrations(db);
    console.log('Migrations complete');

    console.log('Database initialized successfully');

    return db;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
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

  // Check if books table has 'extension' column
  const hasExtensionColumn = booksInfo.some(col => col.name === 'extension');

  if (!hasExtensionColumn) {
    console.log('Running migration: adding extension column to books');
    database.exec("ALTER TABLE books ADD COLUMN extension TEXT");
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

// ============ Wanted Books Functions ============

export interface WantedBook {
  id: number;
  hardcover_id: string | null;
  title: string;
  author: string | null;
  isbn: string | null;
  cover_url: string | null;
  description: string | null;
  added_at: string;
  priority: number;
  notes: string | null;
  status: 'wanted' | 'searching' | 'found' | 'acquired';
}

export function getWantedBooks(status?: string): WantedBook[] {
  if (status) {
    return query<WantedBook>('SELECT * FROM wanted_books WHERE status = ? ORDER BY priority DESC, added_at DESC', [status]);
  }
  return query<WantedBook>('SELECT * FROM wanted_books ORDER BY priority DESC, added_at DESC');
}

export function getWantedBookById(id: number): WantedBook | null {
  return queryOne<WantedBook>('SELECT * FROM wanted_books WHERE id = ?', [id]);
}

export function addWantedBook(data: {
  hardcover_id?: string;
  title: string;
  author?: string;
  isbn?: string;
  cover_url?: string;
  description?: string;
  priority?: number;
  notes?: string;
}): WantedBook | null {
  const result = execute(
    `INSERT INTO wanted_books (hardcover_id, title, author, isbn, cover_url, description, priority, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.hardcover_id || null, data.title, data.author || null, data.isbn || null,
     data.cover_url || null, data.description || null, data.priority || 0, data.notes || null]
  );
  return getWantedBookById(result.lastInsertRowid);
}

export function updateWantedBook(id: number, data: Partial<WantedBook>): boolean {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
  if (data.priority !== undefined) { fields.push('priority = ?'); values.push(data.priority); }
  if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes); }

  if (fields.length === 0) return false;

  values.push(id);
  const result = execute(`UPDATE wanted_books SET ${fields.join(', ')} WHERE id = ?`, values);
  return result.rowCount > 0;
}

export function deleteWantedBook(id: number): boolean {
  const result = execute('DELETE FROM wanted_books WHERE id = ?', [id]);
  return result.rowCount > 0;
}

export function isBookWanted(hardcoverId?: string, isbn?: string, title?: string): boolean {
  if (hardcoverId) {
    const result = queryOne('SELECT id FROM wanted_books WHERE hardcover_id = ?', [hardcoverId]);
    if (result) return true;
  }
  if (isbn) {
    const result = queryOne('SELECT id FROM wanted_books WHERE isbn = ?', [isbn]);
    if (result) return true;
  }
  if (title) {
    const result = queryOne('SELECT id FROM wanted_books WHERE title = ?', [title]);
    if (result) return true;
  }
  return false;
}

/**
 * Find a matching wanted book and mark it as acquired
 * Returns the wanted book if found and updated, null otherwise
 */
export function markWantedBookAsAcquired(
  hardcoverId?: string,
  isbn?: string,
  title?: string
): WantedBook | null {
  let wantedBook: WantedBook | null = null;

  // Try to find by hardcover_id first (most reliable)
  if (hardcoverId) {
    wantedBook = queryOne<WantedBook>(
      'SELECT * FROM wanted_books WHERE hardcover_id = ? AND status IN (?, ?)',
      [hardcoverId, 'wanted', 'searching']
    );
  }

  // Try ISBN if no match yet
  if (!wantedBook && isbn) {
    wantedBook = queryOne<WantedBook>(
      'SELECT * FROM wanted_books WHERE isbn = ? AND status IN (?, ?)',
      [isbn, 'wanted', 'searching']
    );
  }

  // Try title as last resort (less reliable)
  if (!wantedBook && title) {
    wantedBook = queryOne<WantedBook>(
      'SELECT * FROM wanted_books WHERE LOWER(title) = LOWER(?) AND status IN (?, ?)',
      [title, 'wanted', 'searching']
    );
  }

  // If found, mark as acquired
  if (wantedBook) {
    execute(
      "UPDATE wanted_books SET status = 'acquired' WHERE id = ?",
      [wantedBook.id]
    );
    return { ...wantedBook, status: 'acquired' };
  }

  return null;
}

// ============ Download Source Config Functions ============

export interface DownloadSourceConfig {
  id: number;
  source: string;
  enabled: number;
  credentials: string | null;
  last_checked: string | null;
}

export function getDownloadSourceConfigs(): DownloadSourceConfig[] {
  return query<DownloadSourceConfig>('SELECT * FROM download_source_config');
}

export function getDownloadSourceConfig(source: string): DownloadSourceConfig | null {
  return queryOne<DownloadSourceConfig>('SELECT * FROM download_source_config WHERE source = ?', [source]);
}

export function upsertDownloadSourceConfig(source: string, enabled: boolean, credentials?: object): void {
  const credentialsJson = credentials ? JSON.stringify(credentials) : null;
  execute(
    `INSERT INTO download_source_config (source, enabled, credentials, last_checked)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (source) DO UPDATE SET enabled = ?, credentials = ?, last_checked = CURRENT_TIMESTAMP`,
    [source, enabled ? 1 : 0, credentialsJson, enabled ? 1 : 0, credentialsJson]
  );
}

export function isSourceEnabled(source: string): boolean {
  const config = getDownloadSourceConfig(source);
  return config ? config.enabled === 1 : true; // Default to enabled if not configured
}

// ============ Source Status Cache Functions ============

export interface SourceStatusCache {
  id: number;
  source: string;
  status: 'up' | 'down' | 'degraded' | 'unknown';
  response_time: number | null;
  last_updated: string;
}

export function getSourceStatusCache(): SourceStatusCache[] {
  return query<SourceStatusCache>('SELECT * FROM source_status_cache');
}

export function getSourceStatus(source: string): SourceStatusCache | null {
  return queryOne<SourceStatusCache>('SELECT * FROM source_status_cache WHERE source = ?', [source]);
}

export function updateSourceStatus(source: string, status: 'up' | 'down' | 'degraded' | 'unknown', responseTime?: number): void {
  execute(
    `INSERT INTO source_status_cache (source, status, response_time, last_updated)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (source) DO UPDATE SET status = ?, response_time = ?, last_updated = CURRENT_TIMESTAMP`,
    [source, status, responseTime || null, status, responseTime || null]
  );
}

export function isStatusCacheStale(maxAgeMinutes: number = 5): boolean {
  const result = queryOne<{ oldest: string }>(
    `SELECT MIN(last_updated) as oldest FROM source_status_cache`
  );
  if (!result?.oldest) return true;

  const lastUpdate = new Date(result.oldest);
  const now = new Date();
  const diffMinutes = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
  return diffMinutes > maxAgeMinutes;
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
  // Wanted books
  getWantedBooks,
  getWantedBookById,
  addWantedBook,
  updateWantedBook,
  deleteWantedBook,
  isBookWanted,
  // Download source config
  getDownloadSourceConfigs,
  getDownloadSourceConfig,
  upsertDownloadSourceConfig,
  isSourceEnabled,
  // Source status cache
  getSourceStatusCache,
  getSourceStatus,
  updateSourceStatus,
  isStatusCacheStale,
};
