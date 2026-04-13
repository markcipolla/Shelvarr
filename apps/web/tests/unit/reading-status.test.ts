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

  describe('komga_book_id migration', () => {
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

    it('should add komga_book_id column to books table', () => {
      const columns = query<{ name: string }>("PRAGMA table_info(books)");
      const hasColumn = columns.some(col => col.name === 'komga_book_id');
      assert.strictEqual(hasColumn, true, 'books table should have komga_book_id column');
    });

    it('should create index on komga_book_id', () => {
      const indexes = query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='books'"
      );
      const hasIndex = indexes.some(idx => idx.name === 'idx_books_komga_book_id');
      assert.strictEqual(hasIndex, true, 'Should have idx_books_komga_book_id index');
    });

    it('should allow storing and querying by komga_book_id', () => {
      const libId = insertLibrary('Test Library', '/tmp/test-lib-1');

      execute(
        "INSERT INTO books (library_id, file_path, title, komga_book_id, metadata_source, metadata_id) VALUES (?, ?, ?, ?, ?, ?)",
        [libId, '/tmp/test.epub', 'Test Book', 'komga-abc-123', 'hardcover', '42']
      );

      const book = queryOne<{
        id: number;
        title: string;
        komga_book_id: string;
        metadata_id: string;
        metadata_source: string;
      }>(
        'SELECT id, title, komga_book_id, metadata_id, metadata_source FROM books WHERE komga_book_id = ?',
        ['komga-abc-123']
      );

      assert.ok(book, 'Should find book by komga_book_id');
      assert.strictEqual(book.title, 'Test Book');
      assert.strictEqual(book.komga_book_id, 'komga-abc-123');
      assert.strictEqual(book.metadata_id, '42');
      assert.strictEqual(book.metadata_source, 'hardcover');
    });

    it('should allow null komga_book_id', () => {
      const libId = insertLibrary('Test Library', '/tmp/test-lib-2');

      execute(
        "INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)",
        [libId, '/tmp/test2.epub', 'No Komga Book']
      );

      const book = queryOne<{ komga_book_id: string | null }>(
        'SELECT komga_book_id FROM books WHERE title = ?',
        ['No Komga Book']
      );

      assert.ok(book);
      assert.strictEqual(book.komga_book_id, null);
    });

    it('should update komga_book_id on existing book', () => {
      const libId = insertLibrary('Test Library', '/tmp/test-lib-3');

      const insertResult = execute(
        "INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)",
        [libId, '/tmp/test3.epub', 'Update Test']
      );
      const bookId = insertResult.lastInsertRowid;

      const result = execute(
        'UPDATE books SET komga_book_id = ? WHERE id = ?',
        ['komga-xyz-789', bookId]
      );
      assert.strictEqual(result.rowCount, 1);

      const book = queryOne<{ komga_book_id: string }>(
        'SELECT komga_book_id FROM books WHERE id = ?',
        [bookId]
      );
      assert.ok(book);
      assert.strictEqual(book.komga_book_id, 'komga-xyz-789');
    });

    it('should find books without komga_book_id for backfill', () => {
      const libId = insertLibrary('Test Library', '/tmp/test-lib-4');

      execute(
        "INSERT INTO books (library_id, file_path, title, komga_book_id) VALUES (?, ?, ?, ?)",
        [libId, '/tmp/has-komga.epub', 'Has Komga', 'komga-1']
      );

      execute(
        "INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)",
        [libId, '/tmp/no-komga.epub', 'No Komga']
      );

      const needsBackfill = query<{ id: number; file_path: string }>(
        'SELECT id, file_path FROM books WHERE komga_book_id IS NULL AND file_path IS NOT NULL'
      );

      assert.strictEqual(needsBackfill.length, 1);
      assert.strictEqual(needsBackfill[0].file_path, '/tmp/no-komga.epub');
    });

    it('should look up book by komga_book_id and return hardcover metadata_id', () => {
      const libId = insertLibrary('Test Library', '/tmp/test-lib-5');

      execute(
        "INSERT INTO books (library_id, file_path, title, komga_book_id, metadata_source, metadata_id) VALUES (?, ?, ?, ?, ?, ?)",
        [libId, '/tmp/test.epub', 'My Book', 'komga-book-456', 'hardcover', '789']
      );

      const book = queryOne<{
        id: number;
        title: string;
        metadata_id: string | null;
        metadata_source: string | null;
        komga_book_id: string | null;
      }>(
        'SELECT id, title, metadata_id, metadata_source, komga_book_id FROM books WHERE komga_book_id = ?',
        ['komga-book-456']
      );

      assert.ok(book);
      assert.strictEqual(book.title, 'My Book');
      assert.strictEqual(book.metadata_id, '789');
      assert.strictEqual(book.metadata_source, 'hardcover');
    });

    it('should reject reading status for books without hardcover metadata', () => {
      const libId = insertLibrary('Test Library', '/tmp/test-lib-6');

      execute(
        "INSERT INTO books (library_id, file_path, title, komga_book_id) VALUES (?, ?, ?, ?)",
        [libId, '/tmp/test.epub', 'Unmatched Book', 'komga-no-hc']
      );

      const book = queryOne<{
        metadata_id: string | null;
        metadata_source: string | null;
      }>(
        'SELECT metadata_id, metadata_source FROM books WHERE komga_book_id = ?',
        ['komga-no-hc']
      );

      assert.ok(book);
      const hasHardcoverId = !!(book.metadata_id && book.metadata_source === 'hardcover');
      assert.strictEqual(hasHardcoverId, false, 'Should not have Hardcover ID');
    });
  });
}
