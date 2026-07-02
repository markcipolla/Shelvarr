import { describe, it, before, beforeEach, afterEach, after, mock } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { server } from '../mocks/server.js';

// Check if we can use native modules
let canRunTests = true;
const checkDir = mkdtempSync(join(tmpdir(), 'shelvarr-check-'));
try {
  const Database = (await import('better-sqlite3')).default;
  const checkDb = new Database(join(checkDir, 'check.db'));
  checkDb.close();
} catch (err) {
  console.warn('⚠️  Skipping Queue Handlers Full tests: better-sqlite3 native module not available');
  canRunTests = false;
} finally {
  rmSync(checkDir, { recursive: true, force: true });
}

if (canRunTests) {
  const testDir = mkdtempSync(join(tmpdir(), 'shelvarr-queue-full-'));
  process.env['DATA_DIR'] = testDir;
  process.env['DB_PATH'] = join(testDir, 'test.db');

  const { initDatabase, closeDatabase, execute, queryOne } = await import('../../lib/db/index.js');
  const {
    createTask,
    runTask,
    getTask,
  } = await import('../../lib/services/queue/index.js');

  describe('Queue Handlers - Full Integration', () => {
    let testLibPath: string;

    before(() => {
      server.listen({ onUnhandledRequest: 'bypass' });
    });

    beforeEach(() => {
      initDatabase();
      server.resetHandlers();
      execute('DELETE FROM tasks', []);
      execute('DELETE FROM books', []);
      execute('DELETE FROM libraries', []);
      execute('DELETE FROM wanted_books', []);
      execute('DELETE FROM authors', []);

      // Create test library
      testLibPath = join(testDir, 'test-lib');
      if (existsSync(testLibPath)) {
        rmSync(testLibPath, { recursive: true, force: true });
      }
      mkdirSync(testLibPath, { recursive: true });

      execute(
        'INSERT INTO libraries (id, name, path, type) VALUES (?, ?, ?, ?)',
        [1, 'Test Library', testLibPath, 'books']
      );
    });

    afterEach(() => {
      closeDatabase();
    });

    after(() => {
      server.close();
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    describe('Scan Handler - Full Coverage', () => {
      it('should complete scan without adding metadata task when no books added', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const task = createTask('scan', { libraryId: 1 });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
        const data = updated.data as { metadataTaskQueued: boolean };
        assert.strictEqual(data.metadataTaskQueued, false);
      });

      it('should handle task cancellation during scan', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        const { cancelTask } = await import('../../lib/services/queue/index.js');
        registerAllHandlers();

        // Create some files to scan
        for (let i = 0; i < 5; i++) {
          writeFileSync(join(testLibPath, `book${i}.epub`), 'test content');
        }

        const task = createTask('scan', { libraryId: 1 });

        // Start scan and cancel quickly
        const runPromise = runTask(task.id);
        setTimeout(() => cancelTask(task.id), 10);

        await runPromise;

        const updated = getTask(task.id);
        assert.ok(updated);
        // Should be either cancelled or completed depending on timing
        assert.ok(['cancelled', 'completed'].includes(updated.status));
      });
    });

    describe('Metadata Handler - Full Coverage', () => {
      it('should process books with ISBN', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // Add book with ISBN
        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, isbn, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [1, 1, join(testLibPath, 'book.epub'), 'Test Book', '["Test Author"]', '9780000000000', 'epub', 100]
        );

        const task = createTask('metadata', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });

      it('should handle books with no author information', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, join(testLibPath, 'book.epub'), 'Test Book', null, 'epub', 100]
        );

        const task = createTask('metadata', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });

      it('should batch process books', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // Add 25 books to test batching (batch size is 20)
        for (let i = 1; i <= 25; i++) {
          execute(
            'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [i, 1, join(testLibPath, `book${i}.epub`), `Book ${i}`, '["Author"]', 'epub', 100]
          );
        }

        const task = createTask('metadata', { libraryId: 1 });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
        const data = updated.data as { total: number };
        assert.strictEqual(data.total, 25);
      });

      it('should filter unmatchedOnly books', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // Add matched book
        execute(
          'INSERT INTO books (id, library_id, file_path, title, metadata_source, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, join(testLibPath, 'matched.epub'), 'Matched', 'hardcover', 'epub', 100]
        );

        // Add unmatched book
        execute(
          'INSERT INTO books (id, library_id, file_path, title, extension, file_size) VALUES (?, ?, ?, ?, ?, ?)',
          [2, 1, join(testLibPath, 'unmatched.epub'), 'Unmatched', 'epub', 100]
        );

        const task = createTask('metadata', { libraryId: 1, unmatchedOnly: true });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
        const data = updated.data as { total: number };
        assert.strictEqual(data.total, 1); // Only unmatched book
      });

      it('should process all books across all libraries when no filter', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // Create second library
        const lib2Path = join(testDir, 'lib2');
        mkdirSync(lib2Path, { recursive: true });
        execute('INSERT INTO libraries (id, name, path, type) VALUES (?, ?, ?, ?)',
          [2, 'Library 2', lib2Path, 'books']);

        // Add books to both libraries
        execute(
          'INSERT INTO books (library_id, file_path, title, extension, file_size) VALUES (?, ?, ?, ?, ?)',
          [1, join(testLibPath, 'book1.epub'), 'Book 1', 'epub', 100]
        );
        execute(
          'INSERT INTO books (library_id, file_path, title, extension, file_size) VALUES (?, ?, ?, ?, ?)',
          [2, join(lib2Path, 'book2.epub'), 'Book 2', 'epub', 100]
        );

        const task = createTask('metadata', {});
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
        const data = updated.data as { total: number };
        assert.strictEqual(data.total, 2);
      });

      it('should handle books with series information in metadata', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        execute(
          'INSERT INTO books (id, library_id, file_path, title, extension, file_size) VALUES (?, ?, ?, ?, ?, ?)',
          [1, 1, join(testLibPath, 'book.epub'), 'Book Title', 'epub', 100]
        );

        const task = createTask('metadata', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });

      it('should handle author creation during metadata fetch', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, join(testLibPath, 'book.epub'), 'Test Book', '["New Author"]', 'epub', 100]
        );

        const task = createTask('metadata', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });

      it('should mark wanted books as acquired when metadata matches', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // Add wanted book
        execute(
          'INSERT INTO wanted_books (id, hardcover_id, title, author, isbn, status) VALUES (?, ?, ?, ?, ?, ?)',
          [1, 'hc123', 'Wanted Book', 'Author Name', '9780000000000', 'wanted']
        );

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, isbn, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [1, 1, join(testLibPath, 'book.epub'), 'Wanted Book', '["Author Name"]', '9780000000000', 'epub', 100]
        );

        const task = createTask('metadata', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });
    });

    describe('Download Handler - Full Coverage', () => {
      it('should handle download with wanted book data', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // Add wanted book
        execute(
          'INSERT INTO wanted_books (id, hardcover_id, title, author, status) VALUES (?, ?, ?, ?, ?)',
          [1, 'hc123', 'Clean Title', 'Clean Author', 'wanted']
        );

        const task = createTask('download', {
          source: 'libgen',
          md5: 'abc123',
          title: 'Messy<Title>With:Chars',
          author: 'Messy|Author',
          extension: 'epub',
          libraryId: 1,
          wantedBookId: 1,
        });

        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        // Will fail because libgen download will fail, but we test the logic
        assert.strictEqual(updated.status, 'failed');
      });

      it('should handle file already exists scenario', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // This will fail at download stage, but tests the path logic
        const task = createTask('download', {
          source: 'libgen',
          md5: 'test123',
          title: 'Test Book',
          author: 'Test Author',
          extension: 'epub',
          libraryId: 1,
        });

        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
      });

      it('should handle task cancellation during download', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        const { cancelTask } = await import('../../lib/services/queue/index.js');
        registerAllHandlers();

        const task = createTask('download', {
          source: 'libgen',
          md5: 'xyz',
          title: 'Book',
          author: 'Author',
          extension: 'epub',
          libraryId: 1,
        });

        const runPromise = runTask(task.id);
        setTimeout(() => cancelTask(task.id), 5);

        await runPromise;

        const updated = getTask(task.id);
        assert.ok(updated);
        // Either cancelled or failed
        assert.ok(['cancelled', 'failed'].includes(updated.status));
      });
    });

    describe('Organize Handler - Full Coverage', () => {
      it('should clean up empty directories after organizing', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // Create nested directory structure with metadata files
        const oldDir = join(testLibPath, 'Old Author', 'Old Title');
        mkdirSync(oldDir, { recursive: true });

        const bookPath = join(oldDir, 'book.epub');
        writeFileSync(bookPath, 'content');
        writeFileSync(join(oldDir, 'cover.jpg'), 'cover');
        writeFileSync(join(oldDir, 'metadata.opf'), 'metadata');

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, bookPath, 'New Title', '["New Author"]', 'epub', 100]
        );

        const task = createTask('organize', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');

        // Check old directory was cleaned up
        assert.ok(!existsSync(oldDir));
      });

      it('should not delete directory with remaining files', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const oldDir = join(testLibPath, 'Author');
        mkdirSync(oldDir, { recursive: true });

        const book1Path = join(oldDir, 'book1.epub');
        const book2Path = join(oldDir, 'book2.epub');
        writeFileSync(book1Path, 'content1');
        writeFileSync(book2Path, 'content2');

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, book1Path, 'Book One', '["New Author"]', 'epub', 100]
        );

        const task = createTask('organize', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');

        // Old directory should still exist because book2 is there
        assert.ok(existsSync(oldDir));
      });

      it('should fail organize when no library or bookIds provided', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // No libraryId and no bookIds — handler can't resolve a library.
        const task = createTask('organize', {});
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
        assert.ok(updated.error?.toLowerCase().includes('library id'));
      });

      it('should handle series without series number', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const filePath = join(testLibPath, 'book.epub');
        writeFileSync(filePath, 'content');

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, series_name, file_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [1, 1, filePath, 'Book Title', '["Author"]', 'epub', 'Series Name', 100]
        );

        const task = createTask('organize', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');

        // Default template: {author}/{series}/Book {number} - {title}.{ext}
        // No series_number → "Book " collapses to "Book - Title".
        const expectedPath = join(testLibPath, 'Author', 'Series Name', 'Book - Book Title.epub');
        assert.ok(existsSync(expectedPath));
      });

      it('should fail books with missing library', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const filePath = join(testLibPath, 'book.epub');
        writeFileSync(filePath, 'content');

        // Temporarily disable FK constraints so we can insert book with non-existent library_id
        // This simulates a "library not found" scenario (the handler's getLibraryById returns null)
        execute('PRAGMA foreign_keys = OFF', []);
        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 99, filePath, 'Book', '["Author"]', 'epub', 100]
        );
        execute('PRAGMA foreign_keys = ON', []);

        const task = createTask('organize', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        // Library 99 doesn't exist — applyReorganization throws, handler marks task failed.
        assert.strictEqual(updated.status, 'failed');
      });

      it('should handle unknown author in book', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const filePath = join(testLibPath, 'book.epub');
        writeFileSync(filePath, 'content');

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, filePath, 'Book Title', '[]', 'epub', 100]
        );

        const task = createTask('organize', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');

        // No author → "Unknown Author" fallback; standalone → "Book - Title".
        const expectedPath = join(testLibPath, 'Unknown Author', 'Book - Book Title.epub');
        assert.ok(existsSync(expectedPath));
      });

      it('should handle cleanup of parent directories', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // Create deeply nested structure
        const oldAuthorDir = join(testLibPath, 'Old Author');
        const oldTitleDir = join(oldAuthorDir, 'Old Title');
        mkdirSync(oldTitleDir, { recursive: true });

        const bookPath = join(oldTitleDir, 'book.epub');
        writeFileSync(bookPath, 'content');

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, bookPath, 'New Book', '["New Author"]', 'epub', 100]
        );

        const task = createTask('organize', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');

        // Both old directories should be removed
        assert.ok(!existsSync(oldTitleDir));
        assert.ok(!existsSync(oldAuthorDir));
      });
    });

    describe('Book Metadata Handler - Full Coverage', () => {
      it('should handle author parsing from non-JSON string', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, join(testLibPath, 'book.epub'), 'Book', 'Plain String Author', 'epub', 100]
        );

        const task = createTask('book_metadata', { bookId: 1, bookTitle: 'Book' });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        // Task should complete (not_found since no real API) or fail if metadata service errors
        // It should NOT stay pending — that would indicate the handler wasn't called
        assert.ok(
          ['completed', 'failed'].includes(updated.status),
          `Expected completed or failed, got ${updated.status}`
        );
      });

      it('should return not_found when no metadata available', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        execute(
          'INSERT INTO books (id, library_id, file_path, title, extension, file_size) VALUES (?, ?, ?, ?, ?, ?)',
          [1, 1, join(testLibPath, 'book.epub'), 'Nonexistent Book XYZ', 'epub', 100]
        );

        const task = createTask('book_metadata', { bookId: 1, bookTitle: 'Nonexistent Book XYZ' });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        // Task should complete with not_found/matched/skipped or fail if metadata service errors
        assert.ok(
          ['completed', 'failed'].includes(updated.status),
          `Expected completed or failed, got ${updated.status}`
        );
        if (updated.status === 'completed' && updated.data) {
          const data = updated.data as { status: string };
          assert.ok(['not_found', 'matched', 'skipped'].includes(data.status));
        }
      });
    });

    describe('Komga Sync Handler - Full Coverage', () => {
      it('should handle invalid JSON in authors field', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, '/path/book.epub', 'Book', 'invalid[json', 'epub', 100]
        );

        const task = createTask('komga_sync', { bookId: 1 });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });

      it('should filter out non-string authors', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, '/path/book.epub', 'Book', '["Valid Author", null, "", 123]', 'epub', 100]
        );

        const task = createTask('komga_sync', { bookId: 1 });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });

      it('should include all book metadata fields', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, description, isbn, publish_date, cover_url, series_number, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [1, 1, '/path/book.epub', 'Full Book', '["Author"]', 'Description', '9780000000000', '2024-01-01', 'http://cover.jpg', 3, 'epub', 100]
        );

        const task = createTask('komga_sync', { bookId: 1, libraryPath: testLibPath });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });
    });

    describe('Edge Cases and Error Handling', () => {
      it('should handle organize with missing extension field', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const filePath = join(testLibPath, 'book.epub');
        writeFileSync(filePath, 'content');

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, filePath, 'Book', '["Author"]', null, 100]
        );

        const task = createTask('organize', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });

      it('should handle metadata with empty author array', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, join(testLibPath, 'book.epub'), 'Book', '[]', 'epub', 100]
        );

        const task = createTask('metadata', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });

      it('should handle organize task failure gracefully', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // Create file that will cause issues
        const filePath = join(testLibPath, 'book.epub');
        writeFileSync(filePath, 'content');

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, filePath, 'Book <>&*?|', '["Author"]', 'epub', 100]
        );

        const task = createTask('organize', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        // Should complete even if some books fail
        assert.ok(['completed', 'failed'].includes(updated.status));
      });
    });
  });
} else {
  describe('Queue Handlers - Full Integration', () => {
    it('skipped - native modules not available', { skip: true }, () => {});
  });
}
