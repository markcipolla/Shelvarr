/**
 * The migration that makes read progress per-user.
 *
 * The three progress tables were keyed on the book, issue or device alone, and
 * those keys are backed by SQLite's automatic indexes — which cannot be
 * dropped — so the migration rebuilds each table. That is the sort of thing
 * worth testing against a database in the shape it is actually upgrading from,
 * rather than a freshly created one.
 *
 * Everything recorded before accounts existed belongs to nobody in particular,
 * so it lands on the shared shelf (user 0) and a single-user install carries on
 * unchanged.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let canRunTests = true;
const checkDir = mkdtempSync(join(tmpdir(), 'shelvarr-check-'));
try {
  const Database = (await import('better-sqlite3')).default;
  new Database(join(checkDir, 'check.db')).close();
} catch (err) {
  console.warn('⚠️  Skipping per-user progress migration tests: better-sqlite3 not available');
  console.warn('   Error:', err instanceof Error ? err.message : String(err));
  canRunTests = false;
} finally {
  rmSync(checkDir, { recursive: true, force: true });
}

if (canRunTests) {
  const Database = (await import('better-sqlite3')).default;

  let db: typeof import('../../lib/db/index.js');
  let root: string;
  let dbPath: string;
  let bookId: number;

  /** The three tables exactly as they stood before accounts. */
  const PRE_ACCOUNTS_SCHEMA = `
    DROP TABLE read_progress;
    CREATE TABLE read_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      page INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(book_id)
    );

    DROP TABLE comic_read_progress;
    CREATE TABLE comic_read_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER NOT NULL UNIQUE,
      page INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      total INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    DROP TABLE epub_progression;
    CREATE TABLE epub_progression (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      device_id TEXT NOT NULL DEFAULT 'default',
      locator TEXT NOT NULL,
      progression REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(book_id, device_id)
    );
  `;

  describe('Per-user progress migration', () => {
    before(async () => {
      root = mkdtempSync(join(tmpdir(), 'shelvarr-progress-migration-'));
      dbPath = join(root, 'test.db');
      process.env['DATA_DIR'] = root;
      process.env['DB_PATH'] = dbPath;

      db = await import('../../lib/db/index.js');

      // Build a library and a book with the current schema, then wind the
      // progress tables back to how they looked before accounts and fill them
      // as an older install would have.
      db.initDatabase();
      const libraryId = Number(
        db.execute('INSERT INTO libraries (name, path) VALUES (?, ?)', ['Lib', '/tmp/lib'])
          .lastInsertRowid
      );
      bookId = Number(
        db.execute('INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)', [
          libraryId,
          '/tmp/dune.epub',
          'Dune',
        ]).lastInsertRowid
      );
      db.closeDatabase();

      const raw = new Database(dbPath);
      raw.exec(PRE_ACCOUNTS_SCHEMA);
      raw
        .prepare('INSERT INTO read_progress (book_id, page, completed) VALUES (?, ?, ?)')
        .run(bookId, 42, 0);
      raw
        .prepare('INSERT INTO comic_read_progress (issue_id, page, completed, total) VALUES (?, ?, ?, ?)')
        .run(4242, 6, 0, 20);
      raw
        .prepare(
          'INSERT INTO epub_progression (book_id, device_id, locator, progression) VALUES (?, ?, ?, ?)'
        )
        .run(bookId, 'phone', '{"cfi":"a"}', 0.42);
      raw.close();

      // Reopening is what runs the migration.
      db.initDatabase();
    });

    after(() => {
      if (db) db.closeDatabase();
      rmSync(root, { recursive: true, force: true });
    });

    function columns(table: string): string[] {
      return (
        db.getDb().prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
      ).map((c) => c.name);
    }

    it('adds user_id to each progress table', () => {
      assert.ok(columns('read_progress').includes('user_id'));
      assert.ok(columns('comic_read_progress').includes('user_id'));
      assert.ok(columns('epub_progression').includes('user_id'));
    });

    it('keeps every row, on the shared shelf', () => {
      const progress = db.getReadProgress(db.SHARED_USER_ID, bookId);
      assert.strictEqual(progress?.page, 42);
      assert.strictEqual(progress?.user_id, db.SHARED_USER_ID);

      assert.strictEqual(db.getComicReadProgress(db.SHARED_USER_ID, 4242)?.page, 6);
      assert.strictEqual(
        db.getEpubProgression(db.SHARED_USER_ID, bookId, 'phone')?.progression,
        0.42
      );
    });

    it('replaces the old single-row keys so two readers can each have one', () => {
      db.upsertReadProgress(7, bookId, 10, false);
      db.upsertComicReadProgress(7, 4242, 3, false, 20);
      db.upsertEpubProgression(7, bookId, 'phone', '{"cfi":"b"}', 0.1);

      // The pre-accounts rows are untouched by the new reader's.
      assert.strictEqual(db.getReadProgress(db.SHARED_USER_ID, bookId)?.page, 42);
      assert.strictEqual(db.getReadProgress(7, bookId)?.page, 10);
      assert.strictEqual(db.getComicReadProgress(db.SHARED_USER_ID, 4242)?.page, 6);
      assert.strictEqual(db.getComicReadProgress(7, 4242)?.page, 3);
      assert.strictEqual(
        db.getEpubProgression(db.SHARED_USER_ID, bookId, 'phone')?.progression,
        0.42
      );
      assert.strictEqual(db.getEpubProgression(7, bookId, 'phone')?.progression, 0.1);
    });

    it('restores the indexes the rebuild dropped', () => {
      const indexes = (
        db
          .getDb()
          .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
          .all() as Array<{ name: string }>
      ).map((row) => row.name);

      for (const name of [
        'idx_read_progress_book',
        'idx_read_progress_user',
        'idx_comic_read_progress_issue',
        'idx_comic_read_progress_user',
        'idx_epub_progression_book',
        'idx_epub_progression_user',
      ]) {
        assert.ok(indexes.includes(name), `${name} should exist after the rebuild`);
      }
    });

    it('is a no-op the second time it runs', () => {
      db.closeDatabase();
      db.initDatabase();

      assert.strictEqual(db.getReadProgress(db.SHARED_USER_ID, bookId)?.page, 42);
      assert.strictEqual(db.getReadProgress(7, bookId)?.page, 10);
    });
  });
}
