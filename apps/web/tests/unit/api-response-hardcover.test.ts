/**
 * Unit tests for Hardcover status resolution in toApiBook (@shelvarr/services).
 * Every native-facing book endpoint maps rows through toApiBook, so this is
 * what surfaces the user's Hardcover status (read / reading / want-to-read) on
 * the native cards.
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
  console.warn('⚠️  Skipping api-response hardcover tests: better-sqlite3 not available');
  console.warn('   Error:', err instanceof Error ? err.message : String(err));
  canRunTests = false;
} finally {
  rmSync(checkDir, { recursive: true, force: true });
}

if (canRunTests) {
  const testDir = mkdtempSync(join(tmpdir(), 'shelvarr-api-hc-test-'));
  process.env['DATA_DIR'] = testDir;
  process.env['DB_PATH'] = join(testDir, 'test.db');

  const db = await import('../../lib/db/index.js');
  db.initDatabase();
  const { toApiBook } = await import('@shelvarr/services/api-response');

  const libId = db.execute('INSERT INTO libraries (name, path) VALUES (?, ?)', [
    'Lib',
    '/tmp/lib',
  ]).lastInsertRowid;

  /** Insert a book (optionally Hardcover-matched) and return its full row. */
  function addBook(title: string, hardcoverId: string | null): Record<string, unknown> {
    const id = db.execute(
      `INSERT INTO books (library_id, file_path, title, metadata_source, metadata_id)
       VALUES (?, ?, ?, ?, ?)`,
      [libId, `/tmp/${title}.epub`, title, hardcoverId ? 'hardcover' : null, hardcoverId]
    ).lastInsertRowid;
    return db.queryOne('SELECT * FROM books WHERE id = ?', [id]) as Record<string, unknown>;
  }

  describe('toApiBook Hardcover status', () => {
    beforeEach(() => {
      db.getDb().exec('DELETE FROM hardcover_reading_status; DELETE FROM books;');
    });

    after(() => {
      db.closeDatabase();
      if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    });

    it('maps a cached status id to a label', () => {
      const row = addBook('Wanted', '500');
      db.replaceHardcoverStatuses([{ hardcoverId: '500', statusId: 1 }]);
      assert.strictEqual(toApiBook(row).hardcoverStatus, 'want-to-read');
    });

    it('is null when the book is not tracked on Hardcover', () => {
      const row = addBook('Untracked', '501');
      assert.strictEqual(toApiBook(row).hardcoverStatus, null);
    });

    it('is null for a book with no Hardcover match', () => {
      const row = addBook('Unmatched', null);
      db.replaceHardcoverStatuses([{ hardcoverId: '999', statusId: 3 }]);
      assert.strictEqual(toApiBook(row).hardcoverStatus, null);
    });

    it('prefers a status id already joined onto the row', () => {
      const row = addBook('Joined', '502');
      db.replaceHardcoverStatuses([{ hardcoverId: '502', statusId: 1 }]);
      // A query that joined hs.status_id AS hc_status wins over a fresh lookup.
      assert.strictEqual(toApiBook({ ...row, hc_status: 3 }).hardcoverStatus, 'read');
    });
  });
}
