import Database from 'better-sqlite3';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import type {
  WantedBook,
  DownloadSourceConfig,
  SourceStatusCache,
  ComicVolumeSummary,
  ComicVolumeDetail,
  ComicIssueSummary,
  ComicFileRef,
  ComicGeneralFile,
  BlocklistReason,
  ComicBlocklistEntry,
  ComicDownload,
  ComicDownloadLink,
  ComicDownloadState,
  DownloadHost,
  IssueNumber,
  ComicFile,
  ComicIssueMetadata,
  ComicRootFolder,
  ComicVolume,
  ComicVolumeMetadata,
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

  // Comic library ownership: columns added when Shelvarr took the comic
  // library in-house.
  const comicsInfo = database.prepare('PRAGMA table_info(comics)').all() as Array<{ name: string }>;
  const comicColumns: Array<[string, string]> = [
    ['alt_title', 'TEXT'],
    // 1 once Shelvarr owns this volume's metadata and files; 0 while it is
    // still a read-only mirror from a previous manager.
    ['managed', 'INTEGER NOT NULL DEFAULT 0'],
    ['root_folder_id', 'INTEGER REFERENCES comic_root_folders(id) ON DELETE SET NULL'],
    // Folder chosen by hand; mass rename leaves it alone.
    ['custom_folder', 'INTEGER NOT NULL DEFAULT 0'],
    // Unix seconds of the last successful ComicVine refresh.
    ['last_cv_fetch', 'INTEGER NOT NULL DEFAULT 0'],
    ['cover', 'BLOB'],
    ['cover_url', 'TEXT'],
  ];
  for (const [name, definition] of comicColumns) {
    if (comicsInfo.some((col) => col.name === name)) continue;
    console.log(`Running migration: adding ${name} column to comics`);
    database.exec(`ALTER TABLE comics ADD COLUMN ${name} ${definition}`);
  }

  // Download retries: alternate links to fall back to, and the attempt count
  // that bounds how often a rate-limited download is re-tried.
  const comicDownloadsInfo = database
    .prepare('PRAGMA table_info(comic_downloads)')
    .all() as Array<{ name: string }>;
  const comicDownloadColumns: Array<[string, string]> = [
    ['alternate_links', 'TEXT'],
    ['attempts', 'INTEGER NOT NULL DEFAULT 0'],
    // No DEFAULT: SQLite rejects a non-constant one in ALTER TABLE, so
    // existing rows are backfilled below instead.
    ['heartbeat_at', 'TEXT'],
  ];
  for (const [name, definition] of comicDownloadColumns) {
    if (comicDownloadsInfo.some((col) => col.name === name)) continue;
    console.log(`Running migration: adding ${name} column to comic_downloads`);
    database.exec(`ALTER TABLE comic_downloads ADD COLUMN ${name} ${definition}`);
    if (name === 'heartbeat_at') {
      // Anything already in the queue counts as alive from now, so the first
      // resume sweep doesn't restart downloads that were only just running.
      database.exec('UPDATE comic_downloads SET heartbeat_at = CURRENT_TIMESTAMP');
    }
  }
  database.exec(
    'CREATE INDEX IF NOT EXISTS idx_comic_downloads_heartbeat ON comic_downloads(state, heartbeat_at)'
  );

  const comicIssuesInfo = database.prepare('PRAGMA table_info(comic_issues)').all() as Array<{ name: string }>;
  if (!comicIssuesInfo.some((col) => col.name === 'comicvine_volume_id')) {
    console.log('Running migration: adding comicvine_volume_id column to comic_issues');
    database.exec('ALTER TABLE comic_issues ADD COLUMN comicvine_volume_id INTEGER');
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

// ============ Hardcover Reading Status (cached from the user's account) ============

export type HardcoverStatusLabel = 'want-to-read' | 'reading' | 'read' | 'dnf';

// Hardcover's status ids: 1=want to read, 2=currently reading, 3=read, 5=DNF.
export const HARDCOVER_STATUS_LABELS: Record<number, HardcoverStatusLabel> = {
  1: 'want-to-read',
  2: 'reading',
  3: 'read',
  5: 'dnf',
};

export function hardcoverStatusLabel(
  statusId: number | null | undefined
): HardcoverStatusLabel | null {
  if (statusId == null) return null;
  return HARDCOVER_STATUS_LABELS[statusId] ?? null;
}

export interface HardcoverStatusEntry {
  hardcoverId: string;
  statusId: number;
}

/**
 * Replace the cached Hardcover reading statuses with a fresh snapshot from the
 * user's account. Runs in a single transaction so readers never observe a
 * partially-synced table. Entries with unknown status ids are dropped.
 * Returns the number of statuses stored.
 */
export function replaceHardcoverStatuses(entries: HardcoverStatusEntry[]): number {
  const valid = entries.filter((e) => e.hardcoverId && HARDCOVER_STATUS_LABELS[e.statusId]);
  const database = getDb();
  const txn = database.transaction((rows: HardcoverStatusEntry[]) => {
    database.prepare('DELETE FROM hardcover_reading_status').run();
    const stmt = database.prepare(
      `INSERT INTO hardcover_reading_status (hardcover_id, status_id, synced_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT (hardcover_id) DO UPDATE SET
         status_id = excluded.status_id,
         synced_at = CURRENT_TIMESTAMP`
    );
    for (const row of rows) {
      stmt.run(String(row.hardcoverId), row.statusId);
    }
  });
  txn(valid);
  return valid.length;
}

// Shared join/filter: hardcover-tracked books at a given status that the user
// hasn't already started or finished reading locally.
const HARDCOVER_STATUS_FROM = `
  FROM books b
  JOIN hardcover_reading_status hs
    ON hs.hardcover_id = b.metadata_id AND b.metadata_source = 'hardcover'
  LEFT JOIN read_progress rp ON rp.book_id = b.id
 WHERE hs.status_id = ?
   AND (rp.completed IS NULL OR rp.completed = 0)
   AND (rp.page IS NULL OR rp.page = 0)`;

function getBooksByHardcoverStatus<T>(statusId: number, limit: number, offset: number): T[] {
  return query<T>(
    `SELECT b.* ${HARDCOVER_STATUS_FROM}
      ORDER BY hs.synced_at DESC, b.title COLLATE NOCASE
      LIMIT ? OFFSET ?`,
    [statusId, Math.max(1, limit), Math.max(0, offset)]
  );
}

function countBooksByHardcoverStatus(statusId: number): number {
  const row = queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count ${HARDCOVER_STATUS_FROM}`,
    [statusId]
  );
  return row?.count ?? 0;
}

/** The cached Hardcover status id for a Hardcover book id, or null if untracked. */
export function getHardcoverStatusId(hardcoverId: string): number | null {
  const row = queryOne<{ status_id: number }>(
    'SELECT status_id FROM hardcover_reading_status WHERE hardcover_id = ?',
    [hardcoverId]
  );
  return row?.status_id ?? null;
}

/** Books the user marked "want to read" on Hardcover and hasn't started locally. */
export function getWantToReadBooks<T = Record<string, unknown>>(limit: number, offset: number): T[] {
  return getBooksByHardcoverStatus<T>(1, limit, offset);
}

export function countWantToReadBooks(): number {
  return countBooksByHardcoverStatus(1);
}

/** Books the user marked "currently reading" on Hardcover with no local progress yet. */
export function getHardcoverReadingBooks<T = Record<string, unknown>>(
  limit: number,
  offset: number
): T[] {
  return getBooksByHardcoverStatus<T>(2, limit, offset);
}

export function countHardcoverReadingBooks(): number {
  return countBooksByHardcoverStatus(2);
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
  volume: ComicVolumeSummary;
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

export interface NextUpComic {
  volume: ComicVolumeSummary;
  /** The next unread, downloaded issue the reader should open. */
  issueId: number;
  issueNumber: string | null;
  /** When the volume's most recent issue was finished (drives ordering). */
  updatedAt: string;
}

/**
 * Volumes where the user has finished at least one issue and a later, unread
 * *next* issue (by issue number) exists — whether or not it is downloaded yet,
 * so the reader can jump in and grab it. Excludes volumes with an issue
 * currently in progress — those live in {@link getInProgressComics}.
 * One entry per volume, most-recently-finished first.
 */
export function getNextUpComics(limit: number): NextUpComic[] {
  const capped = Math.max(1, Math.min(100, limit));
  const rows = query<
    ComicRow & {
      nu_issue_id: number;
      nu_issue_number: string | null;
      last_done_at: string;
    }
  >(
    `SELECT c.*,
            ci.id AS nu_issue_id,
            ci.issue_number AS nu_issue_number,
            done.last_done_at AS last_done_at
       FROM comic_issues ci
       JOIN comics c ON c.id = ci.volume_id AND c.deleted_at IS NULL
       JOIN (
         SELECT ci2.volume_id AS volume_id,
                MAX(ci2.calculated_issue_number) AS max_done,
                MAX(crp2.updated_at) AS last_done_at
           FROM comic_read_progress crp2
           JOIN comic_issues ci2 ON ci2.id = crp2.issue_id AND ci2.deleted_at IS NULL
          WHERE crp2.completed = 1
          GROUP BY ci2.volume_id
       ) done ON done.volume_id = ci.volume_id
       LEFT JOIN comic_read_progress crp ON crp.issue_id = ci.id
      WHERE ci.deleted_at IS NULL
        AND ci.calculated_issue_number > done.max_done
        AND (crp.completed IS NULL OR crp.completed = 0)
        AND ci.volume_id NOT IN (
          SELECT ci3.volume_id
            FROM comic_read_progress crp3
            JOIN comic_issues ci3 ON ci3.id = crp3.issue_id AND ci3.deleted_at IS NULL
           WHERE crp3.completed = 0 AND crp3.page > 0
        )
        AND ci.calculated_issue_number = (
          SELECT MIN(ci4.calculated_issue_number)
            FROM comic_issues ci4
            LEFT JOIN comic_read_progress crp4 ON crp4.issue_id = ci4.id
           WHERE ci4.volume_id = ci.volume_id
             AND ci4.deleted_at IS NULL
             AND ci4.calculated_issue_number > done.max_done
             AND (crp4.completed IS NULL OR crp4.completed = 0)
        )
      GROUP BY c.id
      ORDER BY done.last_done_at DESC
      LIMIT ?`,
    [capped]
  );
  return rows.map((r) => ({
    volume: rowToVolume(r),
    issueId: r.nu_issue_id,
    issueNumber: r.nu_issue_number,
    updatedAt: r.last_done_at,
  }));
}

/**
 * Books that are the next unread entry in a series the user is partway through:
 * at least one book in the series is finished, no book in the series is
 * currently in progress, and a later-numbered unread book exists. Returns the
 * raw book rows (one per series, most-recently-finished first) for the caller
 * to map into API shapes; use {@link countNextUpBooks} for the total.
 */
export function getNextUpBooks<T = Record<string, unknown>>(limit: number, offset: number): T[] {
  return query<T>(
    `SELECT b.*
       FROM books b
       JOIN (
         SELECT b2.series_name AS series_name,
                MAX(b2.series_number) AS max_done,
                MAX(rp2.updated_at) AS last_done_at
           FROM books b2
           JOIN read_progress rp2 ON rp2.book_id = b2.id
          WHERE rp2.completed = 1 AND b2.series_name IS NOT NULL AND b2.series_number IS NOT NULL
          GROUP BY b2.series_name
       ) done ON done.series_name = b.series_name
       LEFT JOIN read_progress rp ON rp.book_id = b.id
      WHERE b.series_number > done.max_done
        AND (rp.completed IS NULL OR rp.completed = 0)
        AND b.series_name NOT IN (
          SELECT b3.series_name
            FROM books b3
            JOIN read_progress rp3 ON rp3.book_id = b3.id
           WHERE rp3.completed = 0 AND rp3.page > 0 AND b3.series_name IS NOT NULL
        )
        AND b.series_number = (
          SELECT MIN(b4.series_number)
            FROM books b4
            LEFT JOIN read_progress rp4 ON rp4.book_id = b4.id
           WHERE b4.series_name = b.series_name
             AND b4.series_number > done.max_done
             AND (rp4.completed IS NULL OR rp4.completed = 0)
        )
      GROUP BY b.series_name
      ORDER BY done.last_done_at DESC
      LIMIT ? OFFSET ?`,
    [Math.max(1, limit), Math.max(0, offset)]
  );
}

/** Total number of series with a "next up" book (see {@link getNextUpBooks}). */
export function countNextUpBooks(): number {
  const row = queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM (
       SELECT b.series_name
         FROM books b
         JOIN (
           SELECT b2.series_name AS series_name, MAX(b2.series_number) AS max_done
             FROM books b2
             JOIN read_progress rp2 ON rp2.book_id = b2.id
            WHERE rp2.completed = 1 AND b2.series_name IS NOT NULL AND b2.series_number IS NOT NULL
            GROUP BY b2.series_name
         ) done ON done.series_name = b.series_name
         LEFT JOIN read_progress rp ON rp.book_id = b.id
        WHERE b.series_number > done.max_done
          AND (rp.completed IS NULL OR rp.completed = 0)
          AND b.series_name NOT IN (
            SELECT b3.series_name
              FROM books b3
              JOIN read_progress rp3 ON rp3.book_id = b3.id
             WHERE rp3.completed = 0 AND rp3.page > 0 AND b3.series_name IS NOT NULL
          )
        GROUP BY b.series_name
     )`
  );
  return row?.count ?? 0;
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

function rowToVolume(row: ComicRow): ComicVolumeSummary {
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

function rowToIssue(row: ComicIssueRow): ComicIssueSummary {
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
    files: parseJson<ComicFileRef[]>(row.files, []),
  };
}

function rowToVolumeDetail(row: ComicRow, issues: ComicIssueSummary[]): ComicVolumeDetail {
  return {
    ...rowToVolume(row),
    special_version: row.special_version,
    special_version_locked: Boolean(row.special_version_locked),
    site_url: row.site_url ?? '',
    root_folder: row.root_folder ?? 0,
    volume_folder: row.volume_folder ?? '',
    issues,
    general_files: parseJson<ComicGeneralFile[]>(row.general_files, []),
  };
}

export function getCachedComic(id: number): ComicVolumeSummary | null {
  const row = queryOne<ComicRow>(
    'SELECT * FROM comics WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  return row ? rowToVolume(row) : null;
}

export function getCachedComicDetail(id: number): ComicVolumeDetail | null {
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

export function getCachedComics(): ComicVolumeSummary[] {
  const rows = query<ComicRow>(
    'SELECT * FROM comics WHERE deleted_at IS NULL ORDER BY title'
  );
  return rows.map(rowToVolume);
}

export type ComicListSort =
  | 'title'
  | 'year'
  | 'volume_number'
  | 'recently_added'
  | 'publisher';

/**
 * The comic library as the UI wants it: every volume Shelvarr knows about,
 * managed or not yet migrated, filtered and sorted in the database.
 */
export function listComicVolumes(
  options: { search?: string; sort?: ComicListSort } = {}
): Array<ComicVolumeSummary & { managed: boolean }> {
  const conditions = ['deleted_at IS NULL'];
  const params: unknown[] = [];

  if (options.search) {
    conditions.push('(title LIKE ? OR publisher LIKE ?)');
    const pattern = `%${options.search}%`;
    params.push(pattern, pattern);
  }

  const orderBy: Record<ComicListSort, string> = {
    title: 'title COLLATE NOCASE ASC',
    year: 'year DESC, title COLLATE NOCASE ASC',
    volume_number: 'volume_number ASC, title COLLATE NOCASE ASC',
    recently_added: 'id DESC',
    publisher: 'publisher COLLATE NOCASE ASC, title COLLATE NOCASE ASC',
  };

  const rows = query<ComicRow & { managed: number }>(
    `SELECT * FROM comics
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy[options.sort ?? 'title']}`,
    params
  );

  return rows.map((row) => ({ ...rowToVolume(row), managed: row.managed === 1 }));
}

export function upsertComicVolume(volume: ComicVolumeSummary): void {
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
      deleted_at = NULL
    WHERE comics.managed = 0`,
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

/** Ids of volumes Shelvarr owns, which a mirror import must never touch. */
function managedVolumeIds(): Set<number> {
  return new Set(
    query<{ id: number }>('SELECT id FROM comics WHERE managed = 1').map((row) => row.id)
  );
}

export function upsertComicVolumes(volumes: ComicVolumeSummary[]): void {
  const database = getDb();
  const managed = managedVolumeIds();
  const txn = database.transaction((items: ComicVolumeSummary[]) => {
    for (const v of items) {
      // A volume Shelvarr manages is its own; an id collision with an
      // imported mirror must not let it be overwritten.
      if (managed.has(v.id)) continue;
      upsertComicVolume(v);
    }
  });
  txn(volumes);
}

export function upsertComicDetail(detail: ComicVolumeDetail): void {
  if (isComicVolumeManaged(detail.id)) return;

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
        deleted_at = NULL
      WHERE comics.managed = 0`,
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

export function upsertComicIssue(issue: ComicIssueSummary): void {
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

// ---------------------------------------------------------------------------
// Comic acquisition: download queue, history, blocklist
// ---------------------------------------------------------------------------

interface ComicDownloadRow {
  id: number;
  volume_id: number;
  issue_id: number | null;
  covered_issues: string | null;
  host: string;
  download_link: string;
  web_link: string | null;
  web_title: string | null;
  web_sub_title: string | null;
  filename_body: string | null;
  alternate_links: string | null;
  state: string;
  progress: number;
  size: number | null;
  attempts: number;
  file_path: string | null;
  error: string | null;
  heartbeat_at: string | null;
  created_at: string;
  completed_at: string | null;
}

function rowToComicDownload(row: ComicDownloadRow): ComicDownload {
  let coveredIssues: IssueNumber = null;
  if (row.covered_issues) {
    try {
      coveredIssues = JSON.parse(row.covered_issues) as IssueNumber;
    } catch {
      coveredIssues = null;
    }
  }

  let alternateLinks: ComicDownloadLink[] = [];
  if (row.alternate_links) {
    try {
      const parsed = JSON.parse(row.alternate_links) as ComicDownloadLink[];
      if (Array.isArray(parsed)) alternateLinks = parsed;
    } catch {
      alternateLinks = [];
    }
  }

  return {
    id: row.id,
    volumeId: row.volume_id,
    issueId: row.issue_id,
    coveredIssues,
    host: row.host as DownloadHost,
    downloadLink: row.download_link,
    webLink: row.web_link,
    webTitle: row.web_title,
    webSubTitle: row.web_sub_title,
    filenameBody: row.filename_body,
    alternateLinks,
    state: row.state as ComicDownloadState,
    progress: row.progress,
    size: row.size,
    attempts: row.attempts ?? 0,
    error: row.error,
    heartbeatAt: row.heartbeat_at,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export interface AddComicDownloadInput {
  volumeId: number;
  issueId?: number | null;
  coveredIssues?: IssueNumber;
  host: DownloadHost;
  downloadLink: string;
  webLink?: string | null;
  webTitle?: string | null;
  webSubTitle?: string | null;
  filenameBody?: string | null;
  /** Fallbacks for the same issues, tried in order if the first link dies. */
  alternateLinks?: ComicDownloadLink[];
}

/** Queue a download. Returns the created row. */
export function addComicDownload(input: AddComicDownloadInput): ComicDownload {
  const row = insertReturning<ComicDownloadRow>(
    `INSERT INTO comic_downloads
       (volume_id, issue_id, covered_issues, host, download_link,
        web_link, web_title, web_sub_title, filename_body, alternate_links, state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued')
     RETURNING *`,
    [
      input.volumeId,
      input.issueId ?? null,
      input.coveredIssues === undefined || input.coveredIssues === null
        ? null
        : JSON.stringify(input.coveredIssues),
      input.host,
      input.downloadLink,
      input.webLink ?? null,
      input.webTitle ?? null,
      input.webSubTitle ?? null,
      input.filenameBody ?? null,
      input.alternateLinks?.length ? JSON.stringify(input.alternateLinks) : null,
    ]
  );
  if (!row) throw new Error('Failed to create comic download');
  return rowToComicDownload(row);
}

export function getComicDownload(id: number): ComicDownload | null {
  const row = queryOne<ComicDownloadRow>('SELECT * FROM comic_downloads WHERE id = ?', [id]);
  return row ? rowToComicDownload(row) : null;
}

export function getComicDownloads(options: { state?: ComicDownloadState; volumeId?: number; limit?: number } = {}): ComicDownload[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.state) {
    conditions.push('state = ?');
    params.push(options.state);
  }
  if (options.volumeId !== undefined) {
    conditions.push('volume_id = ?');
    params.push(options.volumeId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(options.limit ?? 100);

  return query<ComicDownloadRow>(
    `SELECT * FROM comic_downloads ${where} ORDER BY id ASC LIMIT ?`,
    params
  ).map(rowToComicDownload);
}

/** Whether a link is already queued or running — avoids duplicate downloads. */
export function isComicDownloadActive(downloadLink: string): boolean {
  const row = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM comic_downloads
      WHERE download_link = ? AND state IN ('queued', 'downloading', 'importing')`,
    [downloadLink]
  );
  return (row?.count ?? 0) > 0;
}

export function updateComicDownloadProgress(id: number, progress: number, size: number | null): void {
  execute(
    `UPDATE comic_downloads
        SET progress = ?, size = COALESCE(?, size), heartbeat_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [progress, size, id]
  );
}

export function setComicDownloadState(
  id: number,
  state: ComicDownloadState,
  extra: { error?: string | null; filePath?: string | null } = {}
): void {
  const terminal = state === 'completed' || state === 'failed' || state === 'cancelled';
  execute(
    `UPDATE comic_downloads
        SET state = ?,
            error = COALESCE(?, error),
            file_path = COALESCE(?, file_path),
            heartbeat_at = CURRENT_TIMESTAMP,
            completed_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE completed_at END
      WHERE id = ?`,
    [state, extra.error ?? null, extra.filePath ?? null, terminal ? 1 : 0, id]
  );
}

/**
 * Mark a download as being tried, counting the attempt.
 *
 * The count is what stops a host that keeps rate-limiting us from being
 * retried forever; it is returned so the caller can act on the limit.
 */
export function startComicDownloadAttempt(id: number): number {
  execute(
    `UPDATE comic_downloads
        SET state = 'downloading', attempts = attempts + 1, error = NULL,
            heartbeat_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [id]
  );
  const row = queryOne<{ attempts: number }>(
    'SELECT attempts FROM comic_downloads WHERE id = ?',
    [id]
  );
  return row?.attempts ?? 0;
}

/**
 * Put a download back in the queue rather than failing it — for a host that is
 * only temporarily refusing us. Any partial file is left alone so the retry
 * resumes rather than starting over.
 */
export function deferComicDownload(id: number, error: string): void {
  execute(
    `UPDATE comic_downloads
        SET state = 'queued', error = ?, completed_at = NULL,
            heartbeat_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [error, id]
  );
}

/**
 * Point a download at one of its alternates, dropping the links tried so far.
 * Progress resets because the new link is a different file on disk.
 */
export function switchComicDownloadLink(
  id: number,
  next: ComicDownloadLink,
  remaining: ComicDownloadLink[]
): void {
  execute(
    `UPDATE comic_downloads
        SET host = ?, download_link = ?, alternate_links = ?, progress = 0, size = NULL,
            heartbeat_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [next.host, next.link, remaining.length ? JSON.stringify(remaining) : null, id]
  );
}

/**
 * Claim downloads that were left mid-flight when a process stopped.
 *
 * A live download stamps `heartbeat_at` as it goes — on every state change and
 * every progress checkpoint — so anything non-terminal whose heartbeat has
 * gone cold has nobody driving it. The claim is the same UPDATE that finds
 * them, so two server processes sweeping at once cannot both take a row: the
 * loser's subquery no longer matches once the winner's stamp lands.
 *
 * `staleMinutes` must stay above the longest rate-limit backoff, or a download
 * quietly waiting out a host would be claimed from under the process that is
 * already going to retry it.
 */
export function claimStalledComicDownloads(
  staleMinutes: number,
  limit = 25
): ComicDownload[] {
  const rows = getDb()
    .prepare(
      `UPDATE comic_downloads
          SET state = 'queued', heartbeat_at = CURRENT_TIMESTAMP
        WHERE id IN (
          SELECT id FROM comic_downloads
           WHERE state IN ('queued', 'downloading', 'importing')
             AND (heartbeat_at IS NULL
                  OR heartbeat_at <= datetime('now', ?))
           ORDER BY id ASC
           LIMIT ?
        )
        RETURNING *`
    )
    .all(`-${staleMinutes} minutes`, limit) as ComicDownloadRow[];

  return rows.map(rowToComicDownload);
}

/**
 * Put a download back to the start: state, progress and attempts cleared, so
 * it can be driven again from scratch. Alternates already tried are gone, so
 * this retries whatever link the row currently points at.
 */
export function resetComicDownloadForRetry(id: number): void {
  execute(
    `UPDATE comic_downloads
        SET state = 'queued', progress = 0, attempts = 0, error = NULL,
            file_path = NULL, completed_at = NULL, heartbeat_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [id]
  );
}

export function deleteComicDownload(id: number): boolean {
  return execute('DELETE FROM comic_downloads WHERE id = ?', [id]).rowCount > 0;
}

export interface ComicDownloadHistoryEntry {
  volumeId: number | null;
  issueId?: number | null;
  webLink?: string | null;
  webTitle?: string | null;
  webSubTitle?: string | null;
  fileTitle?: string | null;
  host?: DownloadHost | null;
  success: boolean;
}

export function addComicDownloadHistory(entry: ComicDownloadHistoryEntry): void {
  execute(
    `INSERT INTO comic_download_history
       (volume_id, issue_id, web_link, web_title, web_sub_title, file_title, host, success)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.volumeId,
      entry.issueId ?? null,
      entry.webLink ?? null,
      entry.webTitle ?? null,
      entry.webSubTitle ?? null,
      entry.fileTitle ?? null,
      entry.host ?? null,
      entry.success ? 1 : 0,
    ]
  );
}

export function getComicDownloadHistory(limit = 50, volumeId?: number): Array<Record<string, unknown>> {
  const where = volumeId !== undefined ? 'WHERE volume_id = ?' : '';
  const params: unknown[] = volumeId !== undefined ? [volumeId, limit] : [limit];
  return query(
    `SELECT * FROM comic_download_history ${where} ORDER BY downloaded_at DESC, id DESC LIMIT ?`,
    params
  );
}

interface ComicBlocklistRow {
  id: number;
  volume_id: number | null;
  issue_id: number | null;
  web_link: string | null;
  web_title: string | null;
  web_sub_title: string | null;
  download_link: string;
  host: string | null;
  reason: string;
  added_at: string;
}

function rowToBlocklistEntry(row: ComicBlocklistRow): ComicBlocklistEntry {
  return {
    id: row.id,
    volumeId: row.volume_id,
    issueId: row.issue_id,
    webLink: row.web_link,
    webTitle: row.web_title,
    webSubTitle: row.web_sub_title,
    downloadLink: row.download_link,
    host: row.host as DownloadHost | null,
    reason: row.reason as BlocklistReason,
    addedAt: row.added_at,
  };
}

export interface AddComicBlocklistInput {
  downloadLink: string;
  reason: BlocklistReason;
  volumeId?: number | null;
  issueId?: number | null;
  webLink?: string | null;
  webTitle?: string | null;
  webSubTitle?: string | null;
  host?: DownloadHost | null;
}

/** Blocklist a link. Re-blocklisting an existing link refreshes its reason. */
export function addToComicBlocklist(input: AddComicBlocklistInput): void {
  execute(
    `INSERT INTO comic_blocklist
       (volume_id, issue_id, web_link, web_title, web_sub_title, download_link, host, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(download_link) DO UPDATE SET
       reason = excluded.reason,
       added_at = CURRENT_TIMESTAMP`,
    [
      input.volumeId ?? null,
      input.issueId ?? null,
      input.webLink ?? null,
      input.webTitle ?? null,
      input.webSubTitle ?? null,
      input.downloadLink,
      input.host ?? null,
      input.reason,
    ]
  );
}

export function comicBlocklistContains(downloadLink: string): boolean {
  const row = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM comic_blocklist WHERE download_link = ?',
    [downloadLink]
  );
  return (row?.count ?? 0) > 0;
}

export function getComicBlocklist(limit = 100): ComicBlocklistEntry[] {
  return query<ComicBlocklistRow>(
    'SELECT * FROM comic_blocklist ORDER BY added_at DESC, id DESC LIMIT ?',
    [limit]
  ).map(rowToBlocklistEntry);
}

export function removeFromComicBlocklist(id: number): boolean {
  return execute('DELETE FROM comic_blocklist WHERE id = ?', [id]).rowCount > 0;
}

export function clearComicBlocklist(): number {
  return execute('DELETE FROM comic_blocklist', []).rowCount;
}

/**
 * The volume and its issues in the shape the GetComics matcher wants.
 *
 * "Does this issue have a file?" comes from `comic_issue_files` for volumes
 * Shelvarr manages, and from the mirrored `comic_issues.files` JSON for ones
 * not yet migrated — the two never apply to the same volume.
 */
export function getComicVolumeForMatching(volumeId: number): {
  volume: {
    id: number;
    title: string;
    altTitle: string | null;
    year: number | null;
    volumeNumber: number | null;
    specialVersion: string | null;
    monitored: boolean;
    folder: string | null;
  };
  issues: Array<{
    id: number;
    calculatedIssueNumber: number;
    year: number | null;
    monitored: boolean;
    hasFile: boolean;
  }>;
} | null {
  const volumeRow = queryOne<{
    id: number;
    title: string;
    alt_title: string | null;
    year: number | null;
    volume_number: number | null;
    special_version: string | null;
    monitored: number;
    folder: string | null;
    managed: number;
  }>(
    `SELECT id, title, alt_title, year, volume_number, special_version,
            monitored, folder, managed
       FROM comics WHERE id = ? AND deleted_at IS NULL`,
    [volumeId]
  );
  if (!volumeRow) return null;

  const issueRows = query<{
    id: number;
    calculated_issue_number: number | null;
    date: string | null;
    monitored: number;
    files: string | null;
    linked_files: number;
  }>(
    `SELECT i.id, i.calculated_issue_number, i.date, i.monitored, i.files,
            (SELECT COUNT(*) FROM comic_issue_files f WHERE f.issue_id = i.id)
              AS linked_files
       FROM comic_issues i
      WHERE i.volume_id = ? AND i.deleted_at IS NULL
      ORDER BY i.calculated_issue_number ASC`,
    [volumeId]
  );

  const managed = volumeRow.managed === 1;

  return {
    volume: {
      id: volumeRow.id,
      title: volumeRow.title,
      altTitle: volumeRow.alt_title,
      year: volumeRow.year,
      volumeNumber: volumeRow.volume_number,
      specialVersion: volumeRow.special_version,
      monitored: volumeRow.monitored === 1,
      folder: volumeRow.folder,
    },
    issues: issueRows
      .filter((row) => row.calculated_issue_number !== null)
      .map((row) => {
        let hasFile = row.linked_files > 0;
        if (!managed && row.files) {
          try {
            hasFile = (JSON.parse(row.files) as unknown[]).length > 0;
          } catch {
            hasFile = false;
          }
        }
        const year = row.date ? parseInt(row.date.slice(0, 4), 10) : null;
        return {
          id: row.id,
          calculatedIssueNumber: row.calculated_issue_number as number,
          year: year !== null && Number.isFinite(year) ? year : null,
          monitored: row.monitored === 1,
          hasFile,
        };
      }),
  };
}

// ---------------------------------------------------------------------------
// Comic library ownership: root folders, managed volumes, files
// ---------------------------------------------------------------------------

export function getComicRootFolders(): ComicRootFolder[] {
  return query<{ id: number; path: string }>(
    'SELECT id, path FROM comic_root_folders ORDER BY path ASC'
  );
}

export function getComicRootFolder(id: number): ComicRootFolder | null {
  return queryOne<{ id: number; path: string }>(
    'SELECT id, path FROM comic_root_folders WHERE id = ?',
    [id]
  );
}

/** Add a root folder. Adding one that already exists returns the existing row. */
export function addComicRootFolder(path: string): ComicRootFolder {
  const normalised = path.replace(/\/+$/, '') || '/';
  const existing = queryOne<{ id: number; path: string }>(
    'SELECT id, path FROM comic_root_folders WHERE path = ?',
    [normalised]
  );
  if (existing) return existing;

  const row = insertReturning<{ id: number; path: string }>(
    'INSERT INTO comic_root_folders (path) VALUES (?) RETURNING id, path',
    [normalised]
  );
  if (!row) throw new Error(`Failed to add comic root folder ${normalised}`);
  return row;
}

export function deleteComicRootFolder(id: number): boolean {
  return execute('DELETE FROM comic_root_folders WHERE id = ?', [id]).rowCount > 0;
}

/** How many volumes still point at a root folder — checked before removing it. */
export function countVolumesInRootFolder(id: number): number {
  const row = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM comics WHERE root_folder_id = ? AND deleted_at IS NULL',
    [id]
  );
  return row?.count ?? 0;
}

interface ComicVolumeRow {
  id: number;
  comicvine_id: number | null;
  title: string;
  alt_title: string | null;
  year: number | null;
  volume_number: number | null;
  publisher: string | null;
  description: string | null;
  site_url: string | null;
  monitored: number;
  monitor_new_issues: number;
  root_folder_id: number | null;
  folder: string | null;
  custom_folder: number;
  special_version: string | null;
  special_version_locked: number;
  last_cv_fetch: number;
}

function rowToComicVolume(row: ComicVolumeRow): ComicVolume {
  return {
    id: row.id,
    comicvineId: row.comicvine_id ?? 0,
    title: row.title,
    altTitle: row.alt_title,
    year: row.year,
    volumeNumber: row.volume_number ?? 1,
    publisher: row.publisher,
    description: row.description ?? '',
    siteUrl: row.site_url,
    monitored: row.monitored === 1,
    monitorNewIssues: row.monitor_new_issues === 1,
    rootFolderId: row.root_folder_id,
    folder: row.folder,
    customFolder: row.custom_folder === 1,
    specialVersion: row.special_version as ComicVolume['specialVersion'],
    specialVersionLocked: row.special_version_locked === 1,
    lastCvFetch: row.last_cv_fetch,
  };
}

const VOLUME_COLUMNS = `
  id, comicvine_id, title, alt_title, year, volume_number, publisher,
  description, site_url, monitored, monitor_new_issues, root_folder_id,
  folder, custom_folder, special_version, special_version_locked, last_cv_fetch
`;

export function getComicVolume(id: number): ComicVolume | null {
  const row = queryOne<ComicVolumeRow>(
    `SELECT ${VOLUME_COLUMNS} FROM comics WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );
  return row ? rowToComicVolume(row) : null;
}

/** Volumes Shelvarr owns outright (as opposed to un-migrated mirrors). */
export function getManagedComicVolumes(): ComicVolume[] {
  return query<ComicVolumeRow>(
    `SELECT ${VOLUME_COLUMNS} FROM comics
      WHERE managed = 1 AND deleted_at IS NULL
      ORDER BY title ASC`
  ).map(rowToComicVolume);
}

export function isComicVolumeManaged(id: number): boolean {
  const row = queryOne<{ managed: number }>('SELECT managed FROM comics WHERE id = ?', [id]);
  return row?.managed === 1;
}

/** Look a volume up by ComicVine id — used to spot duplicates when adding. */
export function getComicVolumeByComicvineId(comicvineId: number): ComicVolume | null {
  const row = queryOne<ComicVolumeRow>(
    `SELECT ${VOLUME_COLUMNS} FROM comics
      WHERE comicvine_id = ? AND deleted_at IS NULL`,
    [comicvineId]
  );
  return row ? rowToComicVolume(row) : null;
}

export interface UpsertManagedVolumeInput {
  /** Omit to create a new volume; supply to refresh an existing one. */
  id?: number;
  metadata: ComicVolumeMetadata;
  rootFolderId: number | null;
  folder: string | null;
  monitored?: boolean;
  monitorNewIssues?: boolean;
  customFolder?: boolean;
  specialVersion?: string | null;
  cover?: Buffer | null;
}

/**
 * Create or refresh a volume Shelvarr owns, from ComicVine metadata.
 *
 * A refresh deliberately leaves `monitored`, `folder` and `special_version`
 * alone unless they're passed, so a metadata refresh can't undo the user's
 * choices.
 */
export function upsertManagedComicVolume(input: UpsertManagedVolumeInput): number {
  const { metadata, rootFolderId, folder } = input;
  const now = Math.floor(Date.now() / 1000);

  if (input.id === undefined) {
    const row = insertReturning<{ id: number }>(
      `INSERT INTO comics (
         comicvine_id, title, alt_title, year, publisher, volume_number,
         description, site_url, monitored, monitor_new_issues, managed,
         root_folder_id, folder, custom_folder, special_version,
         issue_count, last_cv_fetch, cover, cover_url, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       RETURNING id`,
      [
        metadata.comicvineId,
        metadata.title,
        metadata.aliases[0] ?? null,
        metadata.year,
        metadata.publisher,
        metadata.volumeNumber,
        metadata.description,
        metadata.siteUrl,
        input.monitored === false ? 0 : 1,
        input.monitorNewIssues === false ? 0 : 1,
        rootFolderId,
        folder,
        input.customFolder ? 1 : 0,
        input.specialVersion ?? null,
        metadata.issueCount,
        now,
        input.cover ?? null,
        metadata.coverLink,
      ]
    );
    if (!row) throw new Error('Failed to create comic volume');
    return row.id;
  }

  execute(
    `UPDATE comics SET
       comicvine_id = ?, title = ?, alt_title = ?, year = ?, publisher = ?,
       volume_number = ?, description = ?, site_url = ?, issue_count = ?,
       managed = 1, last_cv_fetch = ?, cover_url = ?,
       root_folder_id = COALESCE(?, root_folder_id),
       folder = COALESCE(?, folder),
       cover = COALESCE(?, cover),
       monitored = COALESCE(?, monitored),
       monitor_new_issues = COALESCE(?, monitor_new_issues),
       custom_folder = COALESCE(?, custom_folder),
       special_version = COALESCE(?, special_version),
       deleted_at = NULL,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      metadata.comicvineId,
      metadata.title,
      metadata.aliases[0] ?? null,
      metadata.year,
      metadata.publisher,
      metadata.volumeNumber,
      metadata.description,
      metadata.siteUrl,
      metadata.issueCount,
      now,
      metadata.coverLink,
      rootFolderId,
      folder,
      input.cover ?? null,
      input.monitored === undefined ? null : input.monitored ? 1 : 0,
      input.monitorNewIssues === undefined ? null : input.monitorNewIssues ? 1 : 0,
      input.customFolder === undefined ? null : input.customFolder ? 1 : 0,
      input.specialVersion ?? null,
      input.id,
    ]
  );
  return input.id;
}

/**
 * Replace a volume's issues with a fresh set from ComicVine.
 *
 * Issues are keyed by ComicVine id so local ids — which read progress and the
 * native app's cache both reference — survive a refresh. Issues that vanish
 * upstream are tombstoned rather than deleted, for the same reason.
 */
export function replaceComicIssuesFromMetadata(
  volumeId: number,
  issues: ComicIssueMetadata[],
  options: { monitorNewIssues?: boolean } = {}
): { inserted: number; updated: number; tombstoned: number } {
  const monitorNew = options.monitorNewIssues !== false;
  const database = getDb();
  const existing = query<{ id: number; comicvine_id: number | null }>(
    'SELECT id, comicvine_id FROM comic_issues WHERE volume_id = ?',
    [volumeId]
  );
  const byComicvineId = new Map(
    existing.filter((row) => row.comicvine_id !== null).map((row) => [row.comicvine_id!, row.id])
  );

  const insert = database.prepare(
    `INSERT INTO comic_issues (
       volume_id, comicvine_id, comicvine_volume_id, issue_number,
       calculated_issue_number, title, date, description, monitored, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  );
  const update = database.prepare(
    `UPDATE comic_issues SET
       comicvine_volume_id = ?, issue_number = ?, calculated_issue_number = ?,
       title = ?, date = ?, description = ?, deleted_at = NULL,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  );

  let inserted = 0;
  let updated = 0;
  const seen = new Set<number>();

  const run = database.transaction(() => {
    for (const issue of issues) {
      const localId = byComicvineId.get(issue.comicvineId);
      if (localId === undefined) {
        insert.run(
          volumeId,
          issue.comicvineId,
          issue.volumeComicvineId,
          issue.issueNumber,
          issue.calculatedIssueNumber,
          issue.title,
          issue.date,
          issue.description,
          monitorNew ? 1 : 0
        );
        inserted += 1;
      } else {
        update.run(
          issue.volumeComicvineId,
          issue.issueNumber,
          issue.calculatedIssueNumber,
          issue.title,
          issue.date,
          issue.description,
          localId
        );
        updated += 1;
        seen.add(localId);
      }
    }
  });
  run();

  const stale = existing.filter((row) => !seen.has(row.id) && byComicvineId.has(row.comicvine_id!));
  let tombstoned = 0;
  for (const row of stale) {
    if (issues.some((issue) => issue.comicvineId === row.comicvine_id)) continue;
    execute('UPDATE comic_issues SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);
    tombstoned += 1;
  }

  return { inserted, updated, tombstoned };
}

export function setComicVolumeMonitored(id: number, monitored: boolean): void {
  execute('UPDATE comics SET monitored = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
    monitored ? 1 : 0,
    id,
  ]);
}

export function setComicIssueMonitored(id: number, monitored: boolean): void {
  execute('UPDATE comic_issues SET monitored = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
    monitored ? 1 : 0,
    id,
  ]);
}

export function setComicVolumeFolder(id: number, folder: string, custom: boolean): void {
  execute(
    'UPDATE comics SET folder = ?, custom_folder = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [folder, custom ? 1 : 0, id]
  );
}

export function setComicVolumeCover(id: number, cover: Buffer | null): void {
  execute('UPDATE comics SET cover = ? WHERE id = ?', [cover, id]);
}

export function getComicVolumeCover(id: number): Buffer | null {
  const row = queryOne<{ cover: Buffer | null }>('SELECT cover FROM comics WHERE id = ?', [id]);
  return row?.cover ?? null;
}

/** Volumes whose ComicVine data is older than `maxAgeHours`, staleest first. */
export function getComicVolumesNeedingRefresh(maxAgeHours: number, limit = 25): number[] {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeHours * 3600;
  return query<{ id: number }>(
    `SELECT id FROM comics
      WHERE managed = 1 AND deleted_at IS NULL AND last_cv_fetch < ?
      ORDER BY last_cv_fetch ASC
      LIMIT ?`,
    [cutoff, limit]
  ).map((row) => row.id);
}

/** Monitored volumes that are still missing at least one monitored issue. */
export function getComicVolumesWithMissingIssues(limit = 100): number[] {
  return query<{ id: number }>(
    `SELECT DISTINCT c.id
       FROM comics c
       JOIN comic_issues i ON i.volume_id = c.id
      WHERE c.managed = 1
        AND c.monitored = 1
        AND c.deleted_at IS NULL
        AND i.monitored = 1
        AND i.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM comic_issue_files f WHERE f.issue_id = i.id)
      ORDER BY c.title ASC
      LIMIT ?`,
    [limit]
  ).map((row) => row.id);
}

// region Files
export function getComicFilesForVolume(volumeId: number): Array<ComicFile & { fileType: string }> {
  return query<{ id: number; filepath: string; size: number; file_type: string }>(
    'SELECT id, filepath, size, file_type FROM comic_files WHERE volume_id = ? ORDER BY filepath ASC',
    [volumeId]
  ).map((row) => ({
    id: row.id,
    filepath: row.filepath,
    size: row.size,
    fileType: row.file_type,
  }));
}

export function getComicFilesForIssue(issueId: number): ComicFile[] {
  return query<{ id: number; filepath: string; size: number }>(
    `SELECT f.id, f.filepath, f.size
       FROM comic_files f
       JOIN comic_issue_files l ON l.file_id = f.id
      WHERE l.issue_id = ?
      ORDER BY f.filepath ASC`,
    [issueId]
  );
}

export interface UpsertComicFileInput {
  volumeId: number;
  filepath: string;
  size: number;
  fileType?: 'issue' | 'cover' | 'metadata' | 'other';
}

/** Record a file, returning its id. Re-recording an existing path updates it. */
export function upsertComicFile(input: UpsertComicFileInput): number {
  const row = insertReturning<{ id: number }>(
    `INSERT INTO comic_files (volume_id, filepath, size, file_type)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(filepath) DO UPDATE SET
       volume_id = excluded.volume_id,
       size = excluded.size,
       file_type = excluded.file_type,
       updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [input.volumeId, input.filepath, input.size, input.fileType ?? 'issue']
  );
  if (!row) throw new Error(`Failed to record comic file ${input.filepath}`);
  return row.id;
}

/**
 * Point a file at the issues it satisfies, replacing any previous automatic
 * links. Links a human made (`forced`) are left in place.
 */
export function linkComicFileToIssues(fileId: number, issueIds: number[], forced = false): void {
  const database = getDb();
  const insert = database.prepare(
    `INSERT INTO comic_issue_files (file_id, issue_id, forced)
     VALUES (?, ?, ?)
     ON CONFLICT(file_id, issue_id) DO UPDATE SET forced = MAX(forced, excluded.forced)`
  );

  database.transaction(() => {
    if (!forced) {
      database
        .prepare('DELETE FROM comic_issue_files WHERE file_id = ? AND forced = 0')
        .run(fileId);
    }
    for (const issueId of issueIds) insert.run(fileId, issueId, forced ? 1 : 0);
  })();
}

export function deleteComicFile(id: number): boolean {
  return execute('DELETE FROM comic_files WHERE id = ?', [id]).rowCount > 0;
}

/**
 * Forget files that are no longer on disk. Called at the end of a scan with
 * the paths that were actually found.
 */
export function pruneComicFiles(volumeId: number, keepPaths: string[]): number {
  if (keepPaths.length === 0) {
    return execute('DELETE FROM comic_files WHERE volume_id = ?', [volumeId]).rowCount;
  }
  const placeholders = keepPaths.map(() => '?').join(',');
  return execute(
    `DELETE FROM comic_files WHERE volume_id = ? AND filepath NOT IN (${placeholders})`,
    [volumeId, ...keepPaths]
  ).rowCount;
}

/** Move a file's recorded path, e.g. after a rename. */
export function updateComicFilePath(id: number, filepath: string): void {
  execute(
    'UPDATE comic_files SET filepath = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [filepath, id]
  );
}

/** Per-volume file counts, for the library list. */
export function getComicVolumeFileStats(volumeId: number): {
  issueCount: number;
  monitoredCount: number;
  downloadedCount: number;
  monitoredDownloadedCount: number;
  totalSize: number;
} {
  const row = queryOne<{
    issue_count: number;
    monitored_count: number;
    downloaded_count: number;
    monitored_downloaded_count: number;
  }>(
    `SELECT
       COUNT(*) AS issue_count,
       COALESCE(SUM(monitored), 0) AS monitored_count,
       COALESCE(SUM(has_file), 0) AS downloaded_count,
       COALESCE(SUM(CASE WHEN monitored = 1 AND has_file = 1 THEN 1 ELSE 0 END), 0)
         AS monitored_downloaded_count
     FROM (
       SELECT i.monitored,
              EXISTS (SELECT 1 FROM comic_issue_files f WHERE f.issue_id = i.id) AS has_file
         FROM comic_issues i
        WHERE i.volume_id = ? AND i.deleted_at IS NULL
     )`,
    [volumeId]
  );

  const sizeRow = queryOne<{ total: number }>(
    'SELECT COALESCE(SUM(size), 0) AS total FROM comic_files WHERE volume_id = ?',
    [volumeId]
  );

  return {
    issueCount: row?.issue_count ?? 0,
    monitoredCount: row?.monitored_count ?? 0,
    downloadedCount: row?.downloaded_count ?? 0,
    monitoredDownloadedCount: row?.monitored_downloaded_count ?? 0,
    totalSize: sizeRow?.total ?? 0,
  };
}

/** Recompute the denormalised counts on `comics` after a scan or refresh. */
export function refreshComicVolumeStats(volumeId: number): void {
  const stats = getComicVolumeFileStats(volumeId);
  execute(
    `UPDATE comics SET
       issue_count = ?, issue_count_monitored = ?,
       issues_downloaded = ?, issues_downloaded_monitored = ?,
       total_size = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      stats.issueCount,
      stats.monitoredCount,
      stats.downloadedCount,
      stats.monitoredDownloadedCount,
      stats.totalSize,
      volumeId,
    ]
  );
}
// endregion

/**
 * A managed volume in the comic wire shape.
 *
 * Keeping the shape stable means the web UI, the native app and its cached
 * data keep working unchanged as volumes move from mirrored to
 * Shelvarr-managed.
 */
export function getManagedComicDetail(id: number): ComicVolumeDetail | null {
  const row = queryOne<{
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
    special_version_locked: number;
    site_url: string | null;
    root_folder_id: number | null;
  }>(
    `SELECT id, comicvine_id, title, year, publisher, volume_number, description,
            monitored, monitor_new_issues, folder, issue_count, issue_count_monitored,
            issues_downloaded, issues_downloaded_monitored, total_size,
            special_version, special_version_locked, site_url, root_folder_id
       FROM comics
      WHERE id = ? AND managed = 1 AND deleted_at IS NULL`,
    [id]
  );
  if (!row) return null;

  const issueRows = query<{
    id: number;
    comicvine_id: number | null;
    issue_number: string | null;
    calculated_issue_number: number | null;
    title: string | null;
    date: string | null;
    description: string | null;
    monitored: number;
  }>(
    `SELECT id, comicvine_id, issue_number, calculated_issue_number, title,
            date, description, monitored
       FROM comic_issues
      WHERE volume_id = ? AND deleted_at IS NULL
      ORDER BY calculated_issue_number ASC`,
    [id]
  );

  // One query for every file link, rather than one per issue.
  const fileRows = query<{
    issue_id: number;
    file_id: number;
    filepath: string;
    size: number;
  }>(
    `SELECT l.issue_id, f.id AS file_id, f.filepath, f.size
       FROM comic_issue_files l
       JOIN comic_files f ON f.id = l.file_id
      WHERE f.volume_id = ?`,
    [id]
  );
  const filesByIssue = new Map<number, ComicFileRef[]>();
  for (const file of fileRows) {
    const list = filesByIssue.get(file.issue_id) ?? [];
    list.push({ id: file.file_id, filepath: file.filepath, size: file.size });
    filesByIssue.set(file.issue_id, list);
  }

  const generalFiles = query<{ id: number; filepath: string; size: number; file_type: string }>(
    `SELECT id, filepath, size, file_type FROM comic_files
      WHERE volume_id = ? AND file_type != 'issue'`,
    [id]
  ).map((file) => ({
    id: file.id,
    filepath: file.filepath,
    size: file.size,
    file_type: file.file_type,
  }));

  return {
    id: row.id,
    comicvine_id: row.comicvine_id ?? 0,
    title: row.title,
    year: row.year,
    publisher: row.publisher,
    volume_number: row.volume_number ?? 1,
    description: row.description ?? '',
    monitored: row.monitored === 1,
    monitor_new_issues: row.monitor_new_issues === 1,
    folder: row.folder ?? '',
    issue_count: row.issue_count ?? issueRows.length,
    issue_count_monitored: row.issue_count_monitored ?? 0,
    issues_downloaded: row.issues_downloaded ?? 0,
    issues_downloaded_monitored: row.issues_downloaded_monitored ?? 0,
    total_size: row.total_size,
    special_version: row.special_version,
    special_version_locked: row.special_version_locked === 1,
    site_url: row.site_url ?? '',
    root_folder: row.root_folder_id ?? 0,
    volume_folder: row.folder ?? '',
    issues: issueRows.map((issue) => ({
      id: issue.id,
      volume_id: row.id,
      comicvine_id: issue.comicvine_id ?? 0,
      issue_number: issue.issue_number ?? '',
      calculated_issue_number: issue.calculated_issue_number ?? 0,
      title: issue.title,
      date: issue.date,
      description: issue.description ?? '',
      monitored: issue.monitored === 1,
      files: filesByIssue.get(issue.id) ?? [],
    })),
    general_files: generalFiles,
  };
}

/** Where an issue's file lives on disk, for a managed volume. */
export function getManagedIssueFile(issueId: number): ComicFileRef | null {
  const row = queryOne<{ id: number; filepath: string; size: number }>(
    `SELECT f.id, f.filepath, f.size
       FROM comic_issue_files l
       JOIN comic_files f ON f.id = l.file_id
       JOIN comics c ON c.id = f.volume_id
      WHERE l.issue_id = ? AND c.managed = 1
      ORDER BY f.size DESC
      LIMIT 1`,
    [issueId]
  );
  return row ?? null;
}

/**
 * An issue's file, whether the volume is managed or a not-yet-migrated
 * mirror.
 *
 * `needsRemap` says whether the path was recorded by a previous manager and
 * has to go through the migration path map before it can be opened.
 */
export function getComicIssueFileRef(
  issueId: number
): { filepath: string; size: number; needsRemap: boolean } | null {
  const managed = getManagedIssueFile(issueId);
  if (managed) return { filepath: managed.filepath, size: managed.size, needsRemap: false };

  const row = queryOne<{ files: string | null }>(
    'SELECT files FROM comic_issues WHERE id = ? AND deleted_at IS NULL',
    [issueId]
  );
  if (!row?.files) return null;

  try {
    const files = JSON.parse(row.files) as ComicFileRef[];
    const file = files.find((entry) => entry.filepath);
    if (!file) return null;
    return { filepath: file.filepath, size: file.size ?? 0, needsRemap: true };
  } catch {
    return null;
  }
}

/** One issue with its files, for the issue detail endpoint. */
export function getComicIssueDetail(issueId: number): ComicIssueSummary | null {
  const row = queryOne<{
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
    managed: number;
  }>(
    `SELECT i.id, i.volume_id, i.comicvine_id, i.issue_number,
            i.calculated_issue_number, i.title, i.date, i.description,
            i.monitored, i.files, c.managed
       FROM comic_issues i
       JOIN comics c ON c.id = i.volume_id
      WHERE i.id = ? AND i.deleted_at IS NULL`,
    [issueId]
  );
  if (!row) return null;

  let files: ComicFileRef[] = [];
  if (row.managed === 1) {
    files = getComicFilesForIssue(issueId);
  } else if (row.files) {
    try {
      files = JSON.parse(row.files) as ComicFileRef[];
    } catch {
      files = [];
    }
  }

  return {
    id: row.id,
    volume_id: row.volume_id,
    comicvine_id: row.comicvine_id ?? 0,
    issue_number: row.issue_number ?? '',
    calculated_issue_number: row.calculated_issue_number ?? 0,
    title: row.title,
    date: row.date,
    description: row.description ?? '',
    monitored: row.monitored === 1,
    files,
  };
}

// Aliases for compatibility
export const getPool = getDb;
export const initDatabaseAsync = initDatabase;
