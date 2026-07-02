import Database from 'better-sqlite3';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import type {
  WantedBook,
  DownloadSourceConfig,
  SourceStatusCache,
  KapowarrVolume,
  KapowarrVolumeDetail,
  KapowarrIssue,
  KapowarrFile,
  KapowarrGeneralFile,
} from '@shelvarr/types';

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
    join(__dbDirname, '..', 'schema.sql'),
    join(__dbDirname, 'schema.sql'),
    join(process.cwd(), 'packages', 'db', 'schema.sql'),
    resolve('packages', 'db', 'schema.sql'),
    // Legacy paths for backwards compatibility
    join(process.cwd(), 'lib', 'db', 'schema.sql'),
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
 * Block the current thread for `ms` milliseconds without busy-waiting.
 * Used to back off between retries while better-sqlite3 (which is fully
 * synchronous) holds the thread.
 */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Run a SQLite operation, retrying on SQLITE_BUSY. busy_timeout covers most
 * lock waits, but switching a fresh database to WAL needs an exclusive lock
 * that SQLite can refuse outright when many connections do it at once — which
 * is what happens during `next build`, where ~11 worker processes initialize
 * the same database file simultaneously.
 */
function withBusyRetry<T>(fn: () => T): T {
  const maxAttempts = 40;
  for (let attempt = 1; ; attempt++) {
    try {
      return fn();
    } catch (error) {
      const code = (error as { code?: string }).code;
      if ((code === 'SQLITE_BUSY' || code === 'SQLITE_BUSY_SNAPSHOT') && attempt < maxAttempts) {
        sleepSync(50 * attempt);
        continue;
      }
      throw error;
    }
  }
}

/**
 * Initialize the database connection and run migrations
 */
export function initDatabase(dbPath: string): Database.Database {
  try {
    // Ensure data directory exists
    const dbDir = dirname(dbPath);
    mkdirSync(dbDir, { recursive: true });

    console.log(`Opening SQLite database at: ${dbPath}`);

    // Create database connection
    db = new Database(dbPath);
    const database = db;
    console.log('Database connection created');

    // Wait for locks instead of failing immediately.
    database.pragma('busy_timeout = 15000');

    // Enable WAL mode for better performance. The switch needs an exclusive
    // lock, so retry it: when many processes initialize the same file at once
    // (e.g. next build's page-data workers) the loser of the race otherwise
    // gets an immediate SQLITE_BUSY that busy_timeout does not cover.
    withBusyRetry(() => database.pragma('journal_mode = WAL'));
    console.log('WAL mode enabled');
    database.pragma('foreign_keys = ON');
    console.log('Foreign keys enabled');

    // Run schema + migrations inside a single IMMEDIATE transaction so the
    // write lock is taken up front (waitable via busy_timeout) rather than
    // upgrading mid-statement, and retry the whole block on contention.
    const schemaPath = findSchemaPath();
    console.log(`Loading schema from: ${schemaPath}`);
    const schema = readFileSync(schemaPath, 'utf-8');
    withBusyRetry(() => {
      database.exec('BEGIN IMMEDIATE');
      try {
        database.exec(schema);
        runMigrations(database);
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    });
    console.log('Schema loaded');
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

  // Check if books table has 'komga_book_id' column
  const hasKomgaBookIdColumn = booksInfo.some(col => col.name === 'komga_book_id');

  if (!hasKomgaBookIdColumn) {
    console.log('Running migration: adding komga_book_id column to books');
    database.exec("ALTER TABLE books ADD COLUMN komga_book_id TEXT");
    database.exec("CREATE INDEX IF NOT EXISTS idx_books_komga_book_id ON books(komga_book_id)");
  }

  // Check if author_works table has 'language' column
  const authorWorksInfo = database.prepare("PRAGMA table_info(author_works)").all() as Array<{ name: string }>;
  const hasLanguageColumn = authorWorksInfo.some(col => col.name === 'language');

  if (!hasLanguageColumn) {
    console.log('Running migration: adding language column to author_works');
    database.exec("ALTER TABLE author_works ADD COLUMN language TEXT");
  }

  // Check if books table has 'deleted_at' column (for sync tombstones)
  const hasDeletedAtColumn = booksInfo.some(col => col.name === 'deleted_at');

  if (!hasDeletedAtColumn) {
    console.log('Running migration: adding deleted_at column to books');
    database.exec("ALTER TABLE books ADD COLUMN deleted_at TEXT");
  }

  // Backfill FTS indexes if they're empty but source tables are not.
  // Happens the first time FTS is introduced against an existing database.
  const booksFtsCount = database.prepare('SELECT COUNT(*) AS c FROM books_fts').get() as { c: number };
  const booksCount = database.prepare('SELECT COUNT(*) AS c FROM books').get() as { c: number };
  if (booksFtsCount.c === 0 && booksCount.c > 0) {
    console.log('Running migration: backfilling books_fts');
    database.exec("INSERT INTO books_fts(books_fts) VALUES('rebuild')");
  }

  const comicsFtsCount = database.prepare('SELECT COUNT(*) AS c FROM comics_fts').get() as { c: number };
  const comicsCount = database.prepare('SELECT COUNT(*) AS c FROM comics').get() as { c: number };
  if (comicsFtsCount.c === 0 && comicsCount.c > 0) {
    console.log('Running migration: backfilling comics_fts');
    database.exec("INSERT INTO comics_fts(comics_fts) VALUES('rebuild')");
  }
}

/**
 * Get the database instance.
 * Auto-initializes from environment variables if not yet initialized.
 */
export function getDb(): Database.Database {
  if (!db) {
    const dataDir = process.env['DATA_DIR'] || process.cwd() + '/data';
    const dbPath = process.env['DB_PATH'] || join(dataDir, 'shelvarr.db');
    initDatabase(dbPath);
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
  if (sql.toLowerCase().includes('returning')) {
    const match = sql.match(/insert\s+into\s+(\w+)/i);
    const tableName = match?.[1];

    const sqlWithoutReturning = sql.replace(/\s+returning\s+.*/i, '');
    const result = execute(sqlWithoutReturning, params);

    if (tableName && result.lastInsertRowid) {
      return queryOne<T>(`SELECT * FROM ${tableName} WHERE id = ?`, [result.lastInsertRowid]);
    }
    return null;
  }

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

export function markWantedBookAsAcquired(
  hardcoverId?: string,
  isbn?: string,
  title?: string
): WantedBook | null {
  let wantedBook: WantedBook | null = null;

  if (hardcoverId) {
    wantedBook = queryOne<WantedBook>(
      'SELECT * FROM wanted_books WHERE hardcover_id = ? AND status IN (?, ?)',
      [hardcoverId, 'wanted', 'searching']
    );
  }

  if (!wantedBook && isbn) {
    wantedBook = queryOne<WantedBook>(
      'SELECT * FROM wanted_books WHERE isbn = ? AND status IN (?, ?)',
      [isbn, 'wanted', 'searching']
    );
  }

  if (!wantedBook && title) {
    wantedBook = queryOne<WantedBook>(
      'SELECT * FROM wanted_books WHERE LOWER(title) = LOWER(?) AND status IN (?, ?)',
      [title, 'wanted', 'searching']
    );
  }

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
  const sourceConfig = getDownloadSourceConfig(source);
  return sourceConfig ? sourceConfig.enabled === 1 : true;
}

// ============ Source Status Cache Functions ============

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

  const lastUpdate = new Date(result.oldest.endsWith('Z') ? result.oldest : result.oldest + 'Z');
  const now = new Date();
  const diffMinutes = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
  return diffMinutes > maxAgeMinutes;
}

// ============ Read Progress Functions ============

export interface ReadProgressRow {
  id: number;
  book_id: number;
  page: number;
  completed: number;
  created_at: string;
  updated_at: string;
}

export function getReadProgress(bookId: number): ReadProgressRow | null {
  return queryOne<ReadProgressRow>('SELECT * FROM read_progress WHERE book_id = ?', [bookId]);
}

export function upsertReadProgress(bookId: number, page: number, completed: boolean): void {
  execute(
    `INSERT INTO read_progress (book_id, page, completed, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (book_id) DO UPDATE SET page = ?, completed = ?, updated_at = CURRENT_TIMESTAMP`,
    [bookId, page, completed ? 1 : 0, page, completed ? 1 : 0]
  );
}

export function deleteReadProgress(bookId: number): boolean {
  const result = execute('DELETE FROM read_progress WHERE book_id = ?', [bookId]);
  return result.rowCount > 0;
}

export interface EpubProgressionRow {
  id: number;
  book_id: number;
  device_id: string;
  locator: string;
  progression: number;
  created_at: string;
  updated_at: string;
}

export function getEpubProgression(bookId: number, deviceId: string = 'default'): EpubProgressionRow | null {
  return queryOne<EpubProgressionRow>('SELECT * FROM epub_progression WHERE book_id = ? AND device_id = ?', [bookId, deviceId]);
}

// Latest progression across all devices — used when resuming on a device that
// hasn't recorded its own progress yet, so reading position roams cross-device.
export function getLatestEpubProgression(bookId: number): EpubProgressionRow | null {
  return queryOne<EpubProgressionRow>(
    'SELECT * FROM epub_progression WHERE book_id = ? ORDER BY updated_at DESC LIMIT 1',
    [bookId]
  );
}

export function upsertEpubProgression(bookId: number, deviceId: string, locator: string, progression: number): void {
  execute(
    `INSERT INTO epub_progression (book_id, device_id, locator, progression, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (book_id, device_id) DO UPDATE SET locator = ?, progression = ?, updated_at = CURRENT_TIMESTAMP`,
    [bookId, deviceId, locator, progression, locator, progression]
  );
}

// ============ Comic Read Progress Functions ============

export interface ComicReadProgressRow {
  id: number;
  issue_id: number;
  page: number;
  completed: number;
  total: number | null;
  created_at: string;
  updated_at: string;
}

export function getComicReadProgress(issueId: number): ComicReadProgressRow | null {
  return queryOne<ComicReadProgressRow>('SELECT * FROM comic_read_progress WHERE issue_id = ?', [issueId]);
}

export function upsertComicReadProgress(issueId: number, page: number, completed: boolean, total?: number | null): void {
  execute(
    `INSERT INTO comic_read_progress (issue_id, page, completed, total, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (issue_id) DO UPDATE SET page = ?, completed = ?, total = COALESCE(?, total), updated_at = CURRENT_TIMESTAMP`,
    [issueId, page, completed ? 1 : 0, total ?? null, page, completed ? 1 : 0, total ?? null]
  );
}

export function deleteComicReadProgress(issueId: number): boolean {
  const result = execute('DELETE FROM comic_read_progress WHERE issue_id = ?', [issueId]);
  return result.rowCount > 0;
}

export interface ComicIssueProgress {
  issueId: number;
  page: number;
  completed: boolean;
  total: number | null;
  updatedAt: string;
}

/** Read progress for every tracked issue of a volume, keyed by issue id. */
export function getComicReadProgressForVolume(volumeId: number): ComicIssueProgress[] {
  const rows = query<{
    issue_id: number;
    page: number;
    completed: number;
    total: number | null;
    updated_at: string;
  }>(
    `SELECT crp.issue_id, crp.page, crp.completed, crp.total, crp.updated_at
       FROM comic_read_progress crp
       JOIN comic_issues ci ON ci.id = crp.issue_id
      WHERE ci.volume_id = ?`,
    [volumeId]
  );
  return rows.map((r) => ({
    issueId: r.issue_id,
    page: r.page,
    completed: Boolean(r.completed),
    total: r.total,
    updatedAt: r.updated_at,
  }));
}

export interface InProgressComic {
  volume: KapowarrVolume;
  issueId: number;
  issueNumber: string | null;
  page: number;
  total: number | null;
  updatedAt: string;
}

/**
 * Volumes with at least one partially-read (not completed) issue, most
 * recently read first. One entry per volume, carrying the volume's most
 * recently touched in-progress issue so the reader can resume it.
 */
export function getInProgressComics(limit: number): InProgressComic[] {
  const capped = Math.max(1, Math.min(100, limit));
  const rows = query<
    ComicRow & {
      crp_issue_id: number;
      crp_page: number;
      crp_total: number | null;
      crp_updated_at: string;
      issue_number: string | null;
    }
  >(
    `SELECT c.*,
            crp.issue_id AS crp_issue_id,
            crp.page AS crp_page,
            crp.total AS crp_total,
            crp.updated_at AS crp_updated_at,
            ci.issue_number AS issue_number
       FROM comic_read_progress crp
       JOIN comic_issues ci ON ci.id = crp.issue_id AND ci.deleted_at IS NULL
       JOIN comics c ON c.id = ci.volume_id AND c.deleted_at IS NULL
      WHERE crp.completed = 0 AND crp.page > 0
        AND crp.updated_at = (
          SELECT MAX(crp2.updated_at)
            FROM comic_read_progress crp2
            JOIN comic_issues ci2 ON ci2.id = crp2.issue_id AND ci2.deleted_at IS NULL
           WHERE ci2.volume_id = c.id AND crp2.completed = 0 AND crp2.page > 0
        )
      GROUP BY c.id
      ORDER BY crp.updated_at DESC
      LIMIT ?`,
    [capped]
  );
  return rows.map((r) => ({
    volume: rowToVolume(r),
    issueId: r.crp_issue_id,
    issueNumber: r.issue_number,
    page: r.crp_page,
    total: r.crp_total,
    updatedAt: r.crp_updated_at,
  }));
}

// ============ Comics Cache Functions ============

interface ComicRow {
  id: number;
  comicvine_id: number | null;
  title: string;
  year: number | null;
  publisher: string | null;
  volume_number: number | null;
  description: string | null;
  monitored: number;
  monitor_new_issues: number;
  folder: string | null;
  issue_count: number | null;
  issue_count_monitored: number | null;
  issues_downloaded: number | null;
  issues_downloaded_monitored: number | null;
  total_size: number | null;
  special_version: string | null;
  special_version_locked: number | null;
  site_url: string | null;
  root_folder: number | null;
  volume_folder: string | null;
  general_files: string | null;
  cached_at: string;
  updated_at: string;
  detail_cached_at: string | null;
  deleted_at: string | null;
}

interface ComicIssueRow {
  id: number;
  volume_id: number;
  comicvine_id: number | null;
  issue_number: string | null;
  calculated_issue_number: number | null;
  title: string | null;
  date: string | null;
  description: string | null;
  monitored: number;
  files: string | null;
  cached_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function rowToVolume(row: ComicRow): KapowarrVolume {
  return {
    id: row.id,
    comicvine_id: row.comicvine_id ?? 0,
    title: row.title,
    year: row.year,
    publisher: row.publisher,
    volume_number: row.volume_number ?? 0,
    description: row.description ?? '',
    monitored: Boolean(row.monitored),
    monitor_new_issues: Boolean(row.monitor_new_issues),
    folder: row.folder ?? '',
    issue_count: row.issue_count ?? 0,
    issue_count_monitored: row.issue_count_monitored ?? 0,
    issues_downloaded: row.issues_downloaded ?? 0,
    issues_downloaded_monitored: row.issues_downloaded_monitored ?? 0,
    total_size: row.total_size,
  };
}

function parseJson<T>(text: string | null, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function rowToIssue(row: ComicIssueRow): KapowarrIssue {
  return {
    id: row.id,
    volume_id: row.volume_id,
    comicvine_id: row.comicvine_id ?? 0,
    issue_number: row.issue_number ?? '',
    calculated_issue_number: row.calculated_issue_number ?? 0,
    title: row.title,
    date: row.date,
    description: row.description ?? '',
    monitored: Boolean(row.monitored),
    files: parseJson<KapowarrFile[]>(row.files, []),
  };
}

function rowToVolumeDetail(row: ComicRow, issues: KapowarrIssue[]): KapowarrVolumeDetail {
  return {
    ...rowToVolume(row),
    special_version: row.special_version,
    special_version_locked: Boolean(row.special_version_locked),
    site_url: row.site_url ?? '',
    root_folder: row.root_folder ?? 0,
    volume_folder: row.volume_folder ?? '',
    issues,
    general_files: parseJson<KapowarrGeneralFile[]>(row.general_files, []),
  };
}

export function getCachedComic(id: number): KapowarrVolume | null {
  const row = queryOne<ComicRow>(
    'SELECT * FROM comics WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  return row ? rowToVolume(row) : null;
}

export function getCachedComicDetail(id: number): KapowarrVolumeDetail | null {
  const row = queryOne<ComicRow>(
    'SELECT * FROM comics WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  if (!row || !row.detail_cached_at) return null;
  const issueRows = query<ComicIssueRow>(
    'SELECT * FROM comic_issues WHERE volume_id = ? AND deleted_at IS NULL ORDER BY calculated_issue_number',
    [id]
  );
  return rowToVolumeDetail(row, issueRows.map(rowToIssue));
}

export function getCachedComics(): KapowarrVolume[] {
  const rows = query<ComicRow>(
    'SELECT * FROM comics WHERE deleted_at IS NULL ORDER BY title'
  );
  return rows.map(rowToVolume);
}

export function upsertComicVolume(volume: KapowarrVolume): void {
  execute(
    `INSERT INTO comics (
      id, comicvine_id, title, year, publisher, volume_number, description,
      monitored, monitor_new_issues, folder,
      issue_count, issue_count_monitored, issues_downloaded, issues_downloaded_monitored,
      total_size, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)
    ON CONFLICT (id) DO UPDATE SET
      comicvine_id = excluded.comicvine_id,
      title = excluded.title,
      year = excluded.year,
      publisher = excluded.publisher,
      volume_number = excluded.volume_number,
      description = excluded.description,
      monitored = excluded.monitored,
      monitor_new_issues = excluded.monitor_new_issues,
      folder = excluded.folder,
      issue_count = excluded.issue_count,
      issue_count_monitored = excluded.issue_count_monitored,
      issues_downloaded = excluded.issues_downloaded,
      issues_downloaded_monitored = excluded.issues_downloaded_monitored,
      total_size = excluded.total_size,
      updated_at = CURRENT_TIMESTAMP,
      deleted_at = NULL`,
    [
      volume.id,
      volume.comicvine_id,
      volume.title,
      volume.year,
      volume.publisher,
      volume.volume_number,
      volume.description,
      volume.monitored ? 1 : 0,
      volume.monitor_new_issues ? 1 : 0,
      volume.folder,
      volume.issue_count,
      volume.issue_count_monitored,
      volume.issues_downloaded,
      volume.issues_downloaded_monitored,
      volume.total_size,
    ]
  );
}

export function upsertComicVolumes(volumes: KapowarrVolume[]): void {
  const database = getDb();
  const txn = database.transaction((items: KapowarrVolume[]) => {
    for (const v of items) upsertComicVolume(v);
  });
  txn(volumes);
}

export function upsertComicDetail(detail: KapowarrVolumeDetail): void {
  const database = getDb();
  const txn = database.transaction(() => {
    execute(
      `INSERT INTO comics (
        id, comicvine_id, title, year, publisher, volume_number, description,
        monitored, monitor_new_issues, folder,
        issue_count, issue_count_monitored, issues_downloaded, issues_downloaded_monitored,
        total_size, special_version, special_version_locked, site_url, root_folder, volume_folder,
        general_files, updated_at, detail_cached_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
      ON CONFLICT (id) DO UPDATE SET
        comicvine_id = excluded.comicvine_id,
        title = excluded.title,
        year = excluded.year,
        publisher = excluded.publisher,
        volume_number = excluded.volume_number,
        description = excluded.description,
        monitored = excluded.monitored,
        monitor_new_issues = excluded.monitor_new_issues,
        folder = excluded.folder,
        issue_count = excluded.issue_count,
        issue_count_monitored = excluded.issue_count_monitored,
        issues_downloaded = excluded.issues_downloaded,
        issues_downloaded_monitored = excluded.issues_downloaded_monitored,
        total_size = excluded.total_size,
        special_version = excluded.special_version,
        special_version_locked = excluded.special_version_locked,
        site_url = excluded.site_url,
        root_folder = excluded.root_folder,
        volume_folder = excluded.volume_folder,
        general_files = excluded.general_files,
        updated_at = CURRENT_TIMESTAMP,
        detail_cached_at = CURRENT_TIMESTAMP,
        deleted_at = NULL`,
      [
        detail.id,
        detail.comicvine_id,
        detail.title,
        detail.year,
        detail.publisher,
        detail.volume_number,
        detail.description,
        detail.monitored ? 1 : 0,
        detail.monitor_new_issues ? 1 : 0,
        detail.folder,
        detail.issue_count,
        detail.issue_count_monitored,
        detail.issues_downloaded,
        detail.issues_downloaded_monitored,
        detail.total_size,
        detail.special_version,
        detail.special_version_locked ? 1 : 0,
        detail.site_url,
        detail.root_folder,
        detail.volume_folder,
        JSON.stringify(detail.general_files ?? []),
      ]
    );

    const incomingIds = new Set<number>();
    for (const issue of detail.issues) {
      incomingIds.add(issue.id);
      upsertComicIssue(issue);
    }
    const existing = query<{ id: number }>(
      'SELECT id FROM comic_issues WHERE volume_id = ? AND deleted_at IS NULL',
      [detail.id]
    );
    for (const { id } of existing) {
      if (!incomingIds.has(id)) {
        execute(
          'UPDATE comic_issues SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [id]
        );
      }
    }
  });
  txn();
}

export function upsertComicIssue(issue: KapowarrIssue): void {
  execute(
    `INSERT INTO comic_issues (
      id, volume_id, comicvine_id, issue_number, calculated_issue_number,
      title, date, description, monitored, files, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)
    ON CONFLICT (id) DO UPDATE SET
      volume_id = excluded.volume_id,
      comicvine_id = excluded.comicvine_id,
      issue_number = excluded.issue_number,
      calculated_issue_number = excluded.calculated_issue_number,
      title = excluded.title,
      date = excluded.date,
      description = excluded.description,
      monitored = excluded.monitored,
      files = excluded.files,
      updated_at = CURRENT_TIMESTAMP,
      deleted_at = NULL`,
    [
      issue.id,
      issue.volume_id,
      issue.comicvine_id,
      issue.issue_number,
      issue.calculated_issue_number,
      issue.title,
      issue.date,
      issue.description,
      issue.monitored ? 1 : 0,
      JSON.stringify(issue.files ?? []),
    ]
  );
}

export function softDeleteComic(id: number): void {
  execute(
    'UPDATE comics SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  execute(
    'UPDATE comic_issues SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE volume_id = ? AND deleted_at IS NULL',
    [id]
  );
}

export function isComicDetailStale(id: number, maxAgeMinutes: number): boolean {
  const row = queryOne<{ detail_cached_at: string | null }>(
    'SELECT detail_cached_at FROM comics WHERE id = ?',
    [id]
  );
  if (!row?.detail_cached_at) return true;
  const cachedAt = new Date(row.detail_cached_at.endsWith('Z') ? row.detail_cached_at : row.detail_cached_at + 'Z');
  const diffMinutes = (Date.now() - cachedAt.getTime()) / 60000;
  return diffMinutes > maxAgeMinutes;
}

// ============ Sync Query Functions ============

export interface SyncChangesSince {
  comics: Record<string, unknown>[];
  comic_issues: Record<string, unknown>[];
  books: Record<string, unknown>[];
  now: string;
}

/**
 * Return all rows with updated_at > since for each synced table.
 * Pass `null` to return every row (first-time sync). Soft-deleted rows
 * are included so the client can tombstone them locally.
 */
export function getSyncChangesSince(since: string | null): SyncChangesSince {
  const sinceClause = since ? 'WHERE updated_at > ?' : '';
  const params = since ? [since] : [];

  const comics = query<Record<string, unknown>>(
    `SELECT * FROM comics ${sinceClause} ORDER BY updated_at`,
    params
  );
  const comic_issues = query<Record<string, unknown>>(
    `SELECT * FROM comic_issues ${sinceClause} ORDER BY updated_at`,
    params
  );
  const books = query<Record<string, unknown>>(
    `SELECT * FROM books ${sinceClause} ORDER BY updated_at`,
    params
  );

  const nowRow = queryOne<{ now: string }>(
    `SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS now`
  );

  return {
    comics,
    comic_issues,
    books,
    now: nowRow?.now ?? new Date().toISOString(),
  };
}

// ============ Full-Text Search ============

/**
 * Escape a user search query for safe use as an FTS5 MATCH expression.
 * Splits on whitespace, quotes each token, and appends a `*` so partial
 * typing matches (e.g. "sup" matches "superman"). Empty input yields "".
 */
export function buildFtsQuery(raw: string): string {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/["']/g, ''))
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return '';
  return tokens.map((t) => `"${t}"*`).join(' ');
}

export interface BookSearchRow {
  id: number;
  title: string | null;
  authors: string | null;
  series_name: string | null;
  cover_url: string | null;
}

export function searchBooksFts(raw: string, limit = 20): BookSearchRow[] {
  const match = buildFtsQuery(raw);
  if (!match) return [];
  return query<BookSearchRow>(
    `SELECT b.id, b.title, b.authors, b.series_name, b.cover_url
       FROM books_fts f
       JOIN books b ON b.id = f.rowid
      WHERE f.books_fts MATCH ?
        AND b.deleted_at IS NULL
      ORDER BY rank
      LIMIT ?`,
    [match, limit]
  );
}

export interface ComicSearchRow {
  id: number;
  title: string;
  year: number | null;
  publisher: string | null;
}

export function searchComicsFts(raw: string, limit = 20): ComicSearchRow[] {
  const match = buildFtsQuery(raw);
  if (!match) return [];
  return query<ComicSearchRow>(
    `SELECT c.id, c.title, c.year, c.publisher
       FROM comics_fts f
       JOIN comics c ON c.id = f.rowid
      WHERE f.comics_fts MATCH ?
        AND c.deleted_at IS NULL
      ORDER BY rank
      LIMIT ?`,
    [match, limit]
  );
}

// Aliases for compatibility
export const getPool = getDb;
export const initDatabaseAsync = initDatabase;
