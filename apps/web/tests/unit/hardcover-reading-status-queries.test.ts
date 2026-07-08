/**
 * Unit tests for the cached Hardcover reading-status queries in @shelvarr/db:
 * replaceHardcoverStatuses / getWantToReadBooks / getHardcoverReadingBooks and
 * their counts. These mirror the user's Hardcover statuses (want to read /
 * reading / read) onto matched library books.
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
  console.warn('⚠️  Skipping hardcover-reading-status tests: better-sqlite3 not available');
  console.warn('   Error:', err instanceof Error ? err.message : String(err));
  canRunTests = false;
} finally {
  rmSync(checkDir, { recursive: true, force: true });
}

if (canRunTests) {
  const testDir = mkdtempSync(join(tmpdir(), 'shelvarr-hcstatus-test-'));
  process.env['DATA_DIR'] = testDir;
  process.env['DB_PATH'] = join(testDir, 'test.db');

  const db = await import('../../lib/db/index.js');
  db.initDatabase();
  const libId = db.execute('INSERT INTO libraries (name, path) VALUES (?, ?)', [
    'Lib',
    '/tmp/lib',
  ]).lastInsertRowid;

  /** Insert a Hardcover-matched book (metadata_id = its Hardcover id). Returns book id. */
  function addBook(title: string, hardcoverId: string | null): number {
    return db.execute(
      `INSERT INTO books (library_id, file_path, title, metadata_source, metadata_id)
       VALUES (?, ?, ?, ?, ?)`,
      [libId, `/tmp/${title}.epub`, title, hardcoverId ? 'hardcover' : null, hardcoverId]
    ).lastInsertRowid;
  }

  interface Row {
    id: number;
    title: string;
  }

  describe('hardcover reading-status queries (@shelvarr/db)', () => {
    beforeEach(() => {
      db.getDb().exec(
        'DELETE FROM hardcover_reading_status; DELETE FROM read_progress; DELETE FROM books;'
      );
    });

    after(() => {
      db.closeDatabase();
      if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    });

    it('maps status ids to labels', () => {
      assert.strictEqual(db.hardcoverStatusLabel(1), 'want-to-read');
      assert.strictEqual(db.hardcoverStatusLabel(2), 'reading');
      assert.strictEqual(db.hardcoverStatusLabel(3), 'read');
      assert.strictEqual(db.hardcoverStatusLabel(5), 'dnf');
      assert.strictEqual(db.hardcoverStatusLabel(99), null);
      assert.strictEqual(db.hardcoverStatusLabel(null), null);
    });

    it('stores only entries with known status ids', () => {
      const stored = db.replaceHardcoverStatuses([
        { hardcoverId: '100', statusId: 1 },
        { hardcoverId: '101', statusId: 2 },
        { hardcoverId: '102', statusId: 42 }, // unknown -> dropped
      ]);
      assert.strictEqual(stored, 2);
    });

    it('replaces the previous snapshot on each sync', () => {
      addBook('Want', '100');
      db.replaceHardcoverStatuses([{ hardcoverId: '100', statusId: 1 }]);
      assert.strictEqual(db.countWantToReadBooks(), 1);

      // A later sync where the book is now "read" clears the want-to-read entry.
      db.replaceHardcoverStatuses([{ hardcoverId: '100', statusId: 3 }]);
      assert.strictEqual(db.countWantToReadBooks(), 0);
    });

    it('returns want-to-read books matched to a Hardcover id', () => {
      addBook('Wanted', '200');
      addBook('Reading', '201');
      addBook('Unmatched', null);
      db.replaceHardcoverStatuses([
        { hardcoverId: '200', statusId: 1 },
        { hardcoverId: '201', statusId: 2 },
      ]);

      const rows = db.getWantToReadBooks<Row>(10, 0);
      assert.deepStrictEqual(rows.map((r) => r.title), ['Wanted']);
      assert.strictEqual(db.countWantToReadBooks(), 1);
    });

    it('returns Hardcover "currently reading" books with no local progress', () => {
      addBook('ReadingNow', '300');
      db.replaceHardcoverStatuses([{ hardcoverId: '300', statusId: 2 }]);

      const rows = db.getHardcoverReadingBooks<Row>(10, 0);
      assert.deepStrictEqual(rows.map((r) => r.title), ['ReadingNow']);
      assert.strictEqual(db.countHardcoverReadingBooks(), 1);
    });

    it('excludes books already started or finished locally', () => {
      const want = addBook('WantButStarted', '400');
      const reading = addBook('ReadingButDone', '401');
      db.replaceHardcoverStatuses([
        { hardcoverId: '400', statusId: 1 },
        { hardcoverId: '401', statusId: 2 },
      ]);

      db.upsertReadProgress(want, 20, false); // started locally
      db.upsertReadProgress(reading, 100, true); // finished locally

      assert.strictEqual(db.countWantToReadBooks(), 0);
      assert.strictEqual(db.countHardcoverReadingBooks(), 0);
    });
  });
}
