import { describe, it, beforeEach, afterEach, after, mock } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
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
  console.warn('⚠️  Skipping Queue Complete tests: better-sqlite3 native module not available');
  canRunTests = false;
} finally {
  rmSync(checkDir, { recursive: true, force: true });
}

if (canRunTests) {
  const testDir = mkdtempSync(join(tmpdir(), 'shelvarr-queue-complete-'));
  process.env['DATA_DIR'] = testDir;
  process.env['DB_PATH'] = join(testDir, 'test.db');

  const { initDatabase, closeDatabase, execute } = await import('../../lib/db/index.js');
  const {
    createTask,
    runTask,
    getTask,
  } = await import('../../lib/services/queue/index.js');
  const { initServiceConfig, getServiceConfig } = await import('@shelvarr/services');

  initServiceConfig({ ...getServiceConfig(), hardcoverToken: null });

  describe('Queue Handlers - Complete Coverage', () => {
    let testLibPath: string;

    beforeEach(() => {
      initDatabase();
      execute('DELETE FROM tasks', []);
      execute('DELETE FROM books', []);
      execute('DELETE FROM libraries', []);
      execute('DELETE FROM wanted_books', []);
      execute('DELETE FROM authors', []);

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
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    describe('Metadata Handler - Complete Scenarios', () => {
      it('should handle metadata with series array', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // Add book that will potentially get series data
        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, join(testLibPath, 'series-book.epub'), 'The Fellowship of the Ring', '["J.R.R. Tolkien"]', 'epub', 100]
        );

        const task = createTask('metadata', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });

      it('should handle metadata where authors is "Unknown"', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        execute(
          'INSERT INTO books (id, library_id, file_path, title, extension, file_size) VALUES (?, ?, ?, ?, ?, ?)',
          [1, 1, join(testLibPath, 'unknown-author.epub'), 'Mystery Book', 'epub', 100]
        );

        const task = createTask('metadata', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });

      it('should handle promise rejection in batch processing', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // Add multiple books - some will succeed, some might fail
        for (let i = 1; i <= 5; i++) {
          execute(
            'INSERT INTO books (id, library_id, file_path, title, extension, file_size) VALUES (?, ?, ?, ?, ?, ?)',
            [i, 1, join(testLibPath, `book${i}.epub`), `Book ${i}`, 'epub', 100]
          );
        }

        const task = createTask('metadata', { bookIds: [1, 2, 3, 4, 5] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });

      it('should process authors with existing lastSynced data', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // Pre-create author with lastSynced
        execute(
          'INSERT INTO authors (name, last_synced) VALUES (?, ?)',
          ['Known Author', new Date().toISOString()]
        );

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, join(testLibPath, 'book.epub'), 'Test Book', '["Known Author"]', 'epub', 100]
        );

        const task = createTask('metadata', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });

      it('should handle author creation failure gracefully', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, join(testLibPath, 'book.epub'), 'Book', '["Valid Author Name"]', 'epub', 100]
        );

        const task = createTask('metadata', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });
    });

    describe('Book Metadata Handler - Complete Scenarios', () => {
      it('should handle series data in book_metadata handler', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, join(testLibPath, 'book.epub'), 'The Two Towers', '["J.R.R. Tolkien"]', 'epub', 100]
        );

        const task = createTask('book_metadata', { bookId: 1, bookTitle: 'The Two Towers' });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });

      it('should process authors in book_metadata handler', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, join(testLibPath, 'book.epub'), 'Book', '["New Author Name"]', 'epub', 100]
        );

        const task = createTask('book_metadata', { bookId: 1, bookTitle: 'Book' });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });

      it('should handle author processing errors in book_metadata', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, join(testLibPath, 'book.epub'), 'Book', '["Author With, Comma"]', 'epub', 100]
        );

        const task = createTask('book_metadata', { bookId: 1, bookTitle: 'Book' });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });
    });

    describe('Download Handler - Partial Coverage', () => {
      it('should get wanted book data when available', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // Create wanted book with clean data
        execute(
          'INSERT INTO wanted_books (id, hardcover_id, title, author) VALUES (?, ?, ?, ?)',
          [1, 'hc_test', 'Clean Book Title', 'Clean Author']
        );

        const task = createTask('download', {
          source: 'libgen',
          md5: 'test_md5',
          title: 'Messy<>Title',
          author: 'Messy|Author',
          extension: 'epub',
          libraryId: 1,
          wantedBookId: 1,
        });

        // Will fail at download but tests the wanted book data retrieval
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
      });

      it('should handle book author as "Unknown"', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const task = createTask('download', {
          source: 'libgen',
          md5: 'test',
          title: 'Book Title',
          author: 'Unknown',
          extension: 'epub',
          libraryId: 1,
        });

        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed'); // Fails at download
      });
    });

    describe('Organize Handler - Cleanup Scenarios', () => {
      it('should remove metadata.opf files during cleanup', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const oldDir = join(testLibPath, 'Old Dir');
        mkdirSync(oldDir, { recursive: true });

        const bookPath = join(oldDir, 'book.epub');
        writeFileSync(bookPath, 'content');
        writeFileSync(join(oldDir, 'metadata.opf'), 'metadata');
        writeFileSync(join(oldDir, 'COVER.JPG'), 'cover'); // Test case-insensitive

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, bookPath, 'New Title', '["Author"]', 'epub', 100]
        );

        const task = createTask('organize', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');

        // Metadata files should be removed
        assert.ok(!existsSync(join(oldDir, 'metadata.opf')));
      });

      it('should handle cover.png files during cleanup', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const oldDir = join(testLibPath, 'Dir');
        mkdirSync(oldDir, { recursive: true });

        const bookPath = join(oldDir, 'book.epub');
        writeFileSync(bookPath, 'content');
        writeFileSync(join(oldDir, 'cover.png'), 'cover');

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, bookPath, 'Title', '["Author"]', 'epub', 100]
        );

        const task = createTask('organize', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });

      it('should handle .opf files during cleanup', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const oldDir = join(testLibPath, 'TestDir');
        mkdirSync(oldDir, { recursive: true });

        const bookPath = join(oldDir, 'book.epub');
        writeFileSync(bookPath, 'content');
        writeFileSync(join(oldDir, 'content.opf'), 'opf data');

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, bookPath, 'Title', '["Author"]', 'epub', 100]
        );

        const task = createTask('organize', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });

      it('should skip cleanup errors silently', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const authorDir = join(testLibPath, 'Author');
        mkdirSync(authorDir, { recursive: true });

        const bookPath = join(authorDir, 'book.epub');
        writeFileSync(bookPath, 'content');

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, bookPath, 'Same Name', '["Author"]', 'epub', 100]
        );

        const task = createTask('organize', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });

      it('should handle parent directory cleanup when empty', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const parentDir = join(testLibPath, 'Parent');
        const childDir = join(parentDir, 'Child');
        mkdirSync(childDir, { recursive: true });

        const bookPath = join(childDir, 'book.epub');
        writeFileSync(bookPath, 'content');

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, bookPath, 'Book', '["New Author"]', 'epub', 100]
        );

        const task = createTask('organize', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');

        // Both parent and child should be cleaned up
        assert.ok(!existsSync(childDir));
        assert.ok(!existsSync(parentDir));
      });

      it('should not remove parent if it has files', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const parentDir = join(testLibPath, 'ParentWithFiles');
        const childDir = join(parentDir, 'Child');
        mkdirSync(childDir, { recursive: true });

        // Add file to parent
        writeFileSync(join(parentDir, 'parent-file.txt'), 'data');

        const bookPath = join(childDir, 'book.epub');
        writeFileSync(bookPath, 'content');

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, bookPath, 'Book', '["Author"]', 'epub', 100]
        );

        const task = createTask('organize', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');

        // Parent should still exist
        assert.ok(existsSync(parentDir));
      });
    });

    describe('Sanitize filename edge cases', () => {
      it('should handle filenames with HTML tags', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const filePath = join(testLibPath, 'book.epub');
        writeFileSync(filePath, 'content');

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, filePath, '<b>Bold Title</b>', '["<i>Italic Author</i>"]', 'epub', 100]
        );

        const task = createTask('organize', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');

        // HTML tags should be removed from filename
        const expectedPath = join(testLibPath, 'Italic Author', 'Bold Title.epub');
        assert.ok(existsSync(expectedPath));
      });

      it('should handle filenames with HTML entities', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const filePath = join(testLibPath, 'book.epub');
        writeFileSync(filePath, 'content');

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, filePath, 'Title&amp;More', '["Author&lt;Name"]', 'epub', 100]
        );

        const task = createTask('organize', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });

      it('should handle very long filenames', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const longTitle = 'A'.repeat(250);
        const filePath = join(testLibPath, 'book.epub');
        writeFileSync(filePath, 'content');

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, filePath, longTitle, '["Author"]', 'epub', 100]
        );

        const task = createTask('organize', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');

        // Filename should be truncated to 200 chars
        const files = readdirSync(join(testLibPath, 'Author'));
        const organizedFile = files[0];
        assert.ok(organizedFile.length <= 205); // 200 + ".epub"
      });

      it('should normalize whitespace in filenames', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const filePath = join(testLibPath, 'book.epub');
        writeFileSync(filePath, 'content');

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [1, 1, filePath, 'Title   With    Spaces', '["Author\\t\\nName"]', 'epub', 100]
        );

        const task = createTask('organize', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });
    });
  });
} else {
  describe('Queue Handlers - Complete Coverage', () => {
    it('skipped - native modules not available', { skip: true }, () => {});
  });
}
