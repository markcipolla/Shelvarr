/**
 * Unit tests for the book "Next Up" query in @shelvarr/db:
 * getNextUpBooks / countNextUpBooks — the next unread book in each series the
 * user is partway through (a later-numbered unread book exists, at least one
 * book is finished, and nothing in the series is mid-read).
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

  function finish(bookId: number) {
    db.upsertReadProgress(bookId, 100, true);
  }

  function inProgress(bookId: number, page: number) {
    db.upsertReadProgress(bookId, page, false);
  }

  function setProgressTime(bookId: number, iso: string) {
    db.getDb().prepare('UPDATE read_progress SET updated_at = ? WHERE book_id = ?').run(iso, bookId);
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
      assert.deepStrictEqual(db.getNextUpBooks(10, 0), []);
      assert.strictEqual(db.countNextUpBooks(), 0);
    });

    it('surfaces the next unread book after a finished one', () => {
      const b1 = addBook('Dune', 1, 'Dune');
      addBook('Dune', 2, 'Messiah');
      finish(b1);

      const rows = db.getNextUpBooks<Row>(10, 0);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].title, 'Messiah');
      assert.strictEqual(db.countNextUpBooks(), 1);
    });

    it('picks the lowest-numbered unread book above the last finished', () => {
      const b1 = addBook('Dune', 1, 'Dune');
      const b2 = addBook('Dune', 2, 'Messiah');
      addBook('Dune', 3, 'Children');
      finish(b1);
      finish(b2);

      const rows = db.getNextUpBooks<Row>(10, 0);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].title, 'Children');
    });

    it('excludes a series with a book in progress', () => {
      const b1 = addBook('Dune', 1, 'Dune');
      const b2 = addBook('Dune', 2, 'Messiah');
      finish(b1);
      inProgress(b2, 40); // mid-read -> series belongs in In Progress
      assert.deepStrictEqual(db.getNextUpBooks(10, 0), []);
    });

    it('returns nothing once the series is fully read', () => {
      const b1 = addBook('Dune', 1, 'Dune');
      const b2 = addBook('Dune', 2, 'Messiah');
      finish(b1);
      finish(b2);
      assert.deepStrictEqual(db.getNextUpBooks(10, 0), []);
    });

    it('ignores standalone books with no series', () => {
      const b1 = addBook(null, null, 'Standalone');
      finish(b1);
      assert.deepStrictEqual(db.getNextUpBooks(10, 0), []);
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

      const titles = db.getNextUpBooks<Row>(10, 0).map((r) => r.title);
      assert.deepStrictEqual(titles, ['Empire', 'Messiah']);
      assert.strictEqual(db.countNextUpBooks(), 2);

      const firstPage = db.getNextUpBooks<Row>(1, 0).map((r) => r.title);
      assert.deepStrictEqual(firstPage, ['Empire']);
      const secondPage = db.getNextUpBooks<Row>(1, 1).map((r) => r.title);
      assert.deepStrictEqual(secondPage, ['Messiah']);
    });
  });
}
