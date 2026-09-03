import { describe, it, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Check if we can use native modules
let canRunTests = true;
const checkDir = mkdtempSync(join(tmpdir(), 'shelvarr-check-'));
try {
  const Database = (await import('better-sqlite3')).default;
  const checkDb = new Database(join(checkDir, 'check.db'));
  checkDb.close();
} catch (err) {
  console.warn('⚠️  Skipping reading-status tests: better-sqlite3 not available');
  console.warn('   Error:', err instanceof Error ? err.message : String(err));
  canRunTests = false;
} finally {
  rmSync(checkDir, { recursive: true, force: true });
}

if (canRunTests) {
  const testDir = mkdtempSync(join(tmpdir(), 'shelvarr-status-test-'));
  process.env['DATA_DIR'] = testDir;
  process.env['DB_PATH'] = join(testDir, 'test.db');

  const { initDatabase, closeDatabase, execute, query, queryOne } = await import('../../lib/db/index.js');

  // POST /api/reading-status/by-book resolves the Hardcover id a status update
  // needs by looking the book up on its own primary key — the same id the
  // native app is handed by the library API.
  describe('reading status lookup by book id', () => {
    beforeEach(() => {
      initDatabase();
      // Clean tables between tests (books first due to FK)
      execute('DELETE FROM books', []);
      execute('DELETE FROM libraries', []);
    });

    // Helper to insert a library and return its id
    function insertLibrary(name: string, path: string): number {
      const result = execute(
        "INSERT INTO libraries (name, path) VALUES (?, ?)",
        [name, path]
      );
      return result.lastInsertRowid;
    }

    afterEach(() => {
      closeDatabase();
    });

    after(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should no longer carry the komga_book_id column', () => {
      const columns = query<{ name: string }>("PRAGMA table_info(books)");
      assert.strictEqual(
        columns.some(col => col.name === 'komga_book_id'),
        false,
        'books table should not have a komga_book_id column'
      );
    });

    it('should no longer carry the komga_book_id index', () => {
      const indexes = query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='books'"
      );
      assert.strictEqual(
        indexes.some(idx => idx.name === 'idx_books_komga_book_id'),
        false,
        'idx_books_komga_book_id should be gone'
      );
    });

    it('should look up a book by id and return hardcover metadata_id', () => {
      const libId = insertLibrary('Test Library', '/tmp/test-lib-1');

      const insertResult = execute(
        "INSERT INTO books (library_id, file_path, title, metadata_source, metadata_id) VALUES (?, ?, ?, ?, ?)",
        [libId, '/tmp/test.epub', 'My Book', 'hardcover', '789']
      );
      const bookId = insertResult.lastInsertRowid;

      const book = queryOne<{
        id: number;
        title: string;
        metadata_id: string | null;
        metadata_source: string | null;
      }>(
        'SELECT id, title, metadata_id, metadata_source FROM books WHERE id = ?',
        [bookId]
      );

      assert.ok(book);
      assert.strictEqual(book.title, 'My Book');
      assert.strictEqual(book.metadata_id, '789');
      assert.strictEqual(book.metadata_source, 'hardcover');
    });

    it('should find nothing for an unknown book id', () => {
      const book = queryOne<{ id: number }>('SELECT id FROM books WHERE id = ?', [999999]);
      assert.strictEqual(book, null);
    });

    it('should reject reading status for books without hardcover metadata', () => {
      const libId = insertLibrary('Test Library', '/tmp/test-lib-2');

      const insertResult = execute(
        "INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)",
        [libId, '/tmp/test.epub', 'Unmatched Book']
      );
      const bookId = insertResult.lastInsertRowid;

      const book = queryOne<{
        metadata_id: string | null;
        metadata_source: string | null;
      }>(
        'SELECT metadata_id, metadata_source FROM books WHERE id = ?',
        [bookId]
      );

      assert.ok(book);
      const hasHardcoverId = !!(book.metadata_id && book.metadata_source === 'hardcover');
      assert.strictEqual(hasHardcoverId, false, 'Should not have Hardcover ID');
    });
  });
}
