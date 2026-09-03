/**
 * Unit tests for the book "Next Up" query in @shelvarr/db:
 * getNextUpBooks / countNextUpBooks — the next unread book in each series a
 * person is partway through (a later-numbered unread book exists, at least one
 * book is finished, and nothing in the series is mid-read).
 *
 * The row is per-reader: it is built from that reader's own progress, so two
 * people sharing a server are never told to read each other's next book.
 */

import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let canRunTests = true;
const checkDir = mkdtempSync(join(tmpdir(), 'shelvarr-check-'));
try {
  const Database = (await import('better-sqlite3')).default;
  const checkDb = new Database(join(checkDir, 'check.db'));
  checkDb.close();
} catch (err) {
  console.warn('⚠️  Skipping books-next-up tests: better-sqlite3 not available');
  console.warn('   Error:', err instanceof Error ? err.message : String(err));
  canRunTests = false;
} finally {
  rmSync(checkDir, { recursive: true, force: true });
}

if (canRunTests) {
  const testDir = mkdtempSync(join(tmpdir(), 'shelvarr-nextup-test-'));
  process.env['DATA_DIR'] = testDir;
  process.env['DB_PATH'] = join(testDir, 'test.db');

  const db = await import('../../lib/db/index.js');
  db.initDatabase();
  const libId = db.execute('INSERT INTO libraries (name, path) VALUES (?, ?)', [
    'Lib',
    '/tmp/lib',
  ]).lastInsertRowid;

  /** Insert a book and return its id. */
  function addBook(series: string | null, number: number | null, title: string): number {
    return db.execute(
      'INSERT INTO books (library_id, file_path, title, series_name, series_number) VALUES (?, ?, ?, ?, ?)',
      [libId, `/tmp/${title}.epub`, title, series, number]
    ).lastInsertRowid;
  }

  // A signed-in reader. Everything below is their shelf unless stated.
  const READER = 7;
  const OTHER_READER = 8;

  function finish(bookId: number, userId = READER) {
    db.upsertReadProgress(userId, bookId, 100, true);
  }

  function inProgress(bookId: number, page: number, userId = READER) {
    db.upsertReadProgress(userId, bookId, page, false);
  }

  function setProgressTime(bookId: number, iso: string, userId = READER) {
    db.getDb()
      .prepare('UPDATE read_progress SET updated_at = ? WHERE book_id = ? AND user_id = ?')
      .run(iso, bookId, userId);
  }

  interface Row {
    id: number;
    title: string;
    series_name: string | null;
    series_number: number | null;
  }

  describe('getNextUpBooks (@shelvarr/db)', () => {
    beforeEach(() => {
      db.getDb().exec('DELETE FROM read_progress; DELETE FROM books;');
    });

    after(() => {
      db.closeDatabase();
      if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    });

    it('returns empty when no book in the series is finished', () => {
      addBook('Dune', 1, 'Dune');
      addBook('Dune', 2, 'Messiah');
      assert.deepStrictEqual(db.getNextUpBooks(READER, 10, 0), []);
      assert.strictEqual(db.countNextUpBooks(READER), 0);
    });

    it('surfaces the next unread book after a finished one', () => {
      const b1 = addBook('Dune', 1, 'Dune');
      addBook('Dune', 2, 'Messiah');
      finish(b1);

      const rows = db.getNextUpBooks<Row>(READER, 10, 0);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].title, 'Messiah');
      assert.strictEqual(db.countNextUpBooks(READER), 1);
    });

    it('picks the lowest-numbered unread book above the last finished', () => {
      const b1 = addBook('Dune', 1, 'Dune');
      const b2 = addBook('Dune', 2, 'Messiah');
      addBook('Dune', 3, 'Children');
      finish(b1);
      finish(b2);

      const rows = db.getNextUpBooks<Row>(READER, 10, 0);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].title, 'Children');
    });

    it('excludes a series with a book in progress', () => {
      const b1 = addBook('Dune', 1, 'Dune');
      const b2 = addBook('Dune', 2, 'Messiah');
      finish(b1);
      inProgress(b2, 40); // mid-read -> series belongs in In Progress
      assert.deepStrictEqual(db.getNextUpBooks(READER, 10, 0), []);
    });

    it('returns nothing once the series is fully read', () => {
      const b1 = addBook('Dune', 1, 'Dune');
      const b2 = addBook('Dune', 2, 'Messiah');
      finish(b1);
      finish(b2);
      assert.deepStrictEqual(db.getNextUpBooks(READER, 10, 0), []);
    });

    it('ignores standalone books with no series', () => {
      const b1 = addBook(null, null, 'Standalone');
      finish(b1);
      assert.deepStrictEqual(db.getNextUpBooks(READER, 10, 0), []);
    });

    it('orders by most-recently-finished and paginates', () => {
      const d1 = addBook('Dune', 1, 'Dune');
      addBook('Dune', 2, 'Messiah');
      const f1 = addBook('Foundation', 1, 'Foundation');
      addBook('Foundation', 2, 'Empire');
      finish(d1);
      finish(f1);
      setProgressTime(d1, '2024-01-01 10:00:00');
      setProgressTime(f1, '2024-01-05 10:00:00'); // Foundation finished more recently

      const titles = db.getNextUpBooks<Row>(READER, 10, 0).map((r) => r.title);
      assert.deepStrictEqual(titles, ['Empire', 'Messiah']);
      assert.strictEqual(db.countNextUpBooks(READER), 2);

      const firstPage = db.getNextUpBooks<Row>(READER, 1, 0).map((r) => r.title);
      assert.deepStrictEqual(firstPage, ['Empire']);
      const secondPage = db.getNextUpBooks<Row>(READER, 1, 1).map((r) => r.title);
      assert.deepStrictEqual(secondPage, ['Messiah']);
    });

    it('builds each reader a row from their own progress alone', () => {
      const b1 = addBook('Dune', 1, 'Dune');
      const b2 = addBook('Dune', 2, 'Messiah');
      addBook('Dune', 3, 'Children');

      finish(b1); // READER has read book one...
      finish(b1, OTHER_READER); // ...and so has the other reader,
      finish(b2, OTHER_READER); // who is a book further along.

      assert.deepStrictEqual(
        db.getNextUpBooks<Row>(READER, 10, 0).map((r) => r.title),
        ['Messiah']
      );
      assert.deepStrictEqual(
        db.getNextUpBooks<Row>(OTHER_READER, 10, 0).map((r) => r.title),
        ['Children']
      );
      assert.strictEqual(db.countNextUpBooks(READER), 1);
      assert.strictEqual(db.countNextUpBooks(OTHER_READER), 1);
    });

    it("leaves a reader who has read nothing with an empty row", () => {
      const b1 = addBook('Dune', 1, 'Dune');
      addBook('Dune', 2, 'Messiah');
      finish(b1);

      assert.deepStrictEqual(db.getNextUpBooks(OTHER_READER, 10, 0), []);
      assert.strictEqual(db.countNextUpBooks(OTHER_READER), 0);
    });

    it('keeps the shared shelf separate from a signed-in reader', () => {
      const b1 = addBook('Dune', 1, 'Dune');
      addBook('Dune', 2, 'Messiah');
      finish(b1, db.SHARED_USER_ID);

      // A server without accounts reads and writes SHARED_USER_ID...
      assert.deepStrictEqual(
        db.getNextUpBooks<Row>(db.SHARED_USER_ID, 10, 0).map((r) => r.title),
        ['Messiah']
      );
      // ...and that progress is not attributed to anybody in particular.
      assert.deepStrictEqual(db.getNextUpBooks(READER, 10, 0), []);
    });
  });
}
