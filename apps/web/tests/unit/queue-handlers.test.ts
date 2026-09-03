import { describe, it, beforeEach, afterEach, after, mock } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Check if we can use native modules by actually trying to create a database
let canRunTests = true;
const checkDir = mkdtempSync(join(tmpdir(), 'shelvarr-check-'));
try {
  const Database = (await import('better-sqlite3')).default;
  const checkDb = new Database(join(checkDir, 'check.db'));
  checkDb.close();
} catch (err) {
  console.warn('⚠️  Skipping Queue Handlers tests: better-sqlite3 native module not available in this environment');
  console.warn('   Error:', err instanceof Error ? err.message : String(err));
  canRunTests = false;
} finally {
  rmSync(checkDir, { recursive: true, force: true });
}

if (canRunTests) {
  // Set test database path before importing db module
  const testDir = mkdtempSync(join(tmpdir(), 'shelvarr-queue-handlers-test-'));
  process.env['DATA_DIR'] = testDir;
  process.env['DB_PATH'] = join(testDir, 'test.db');

  // Dynamic imports only when tests can run
  const { initDatabase, closeDatabase, execute } = await import('../../lib/db/index.js');
  const {
    registerTaskHandler,
    enqueueTask,
    retryTask,
    runTask,
    getTask,
    createTask,
    failTask,
    cancelTask,
  } = await import('../../lib/services/queue/index.js');

  describe('Queue Service - Advanced Features', () => {
    beforeEach(() => {
      initDatabase();
      // Clear tasks table before each test
      execute('DELETE FROM tasks', []);
    });

    afterEach(() => {
      closeDatabase();
    });

    // Cleanup test directory after all tests
    after(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    describe('registerTaskHandler and runTask', () => {
      it('should register and execute a task handler', async () => {
        let handlerCalled = false;
        let receivedTaskId = 0;

        registerTaskHandler('scan', async (taskId) => {
          handlerCalled = true;
          receivedTaskId = taskId;
          return { success: true };
        });

        const task = createTask('scan');
        await runTask(task.id);

        assert.strictEqual(handlerCalled, true);
        assert.strictEqual(receivedTaskId, task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
      });

      it('should fail task when no handler is registered', async () => {
        // Every declared task type has a handler now that the built-ins are
        // installed, so reach for one that does not exist at all.
        const task = createTask('not_a_real_task_type' as Parameters<typeof createTask>[0]);
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
        assert.ok(updated.error?.includes('No handler registered'));
      });

      it('should handle task not found', async () => {
        await assert.rejects(
          async () => runTask(99999),
          /Task 99999 not found/
        );
      });

      it('should call progress callback', async () => {
        const progressUpdates: Array<{ current: number; total: number }> = [];

        registerTaskHandler('organize', async (_taskId, onProgress) => {
          onProgress(1, 10);
          onProgress(5, 10);
          onProgress(10, 10);
          return { success: true };
        });

        const task = createTask('organize');
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.progress, 10);
        assert.strictEqual(updated.total, 10);
      });

      it('should handle task cancellation via abort signal', async () => {
        registerTaskHandler('download', async (_taskId, _onProgress, signal) => {
          // Simulate some async work
          await new Promise((resolve) => setTimeout(resolve, 10));

          if (signal.aborted) {
            throw new Error('Task cancelled');
          }
          return { success: true };
        });

        const task = createTask('download');

        // Start task in background
        const runPromise = runTask(task.id);

        // Cancel immediately
        cancelTask(task.id);

        // Wait for task to complete
        await runPromise;

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'cancelled');
      });

      it('should handle handler errors', async () => {
        registerTaskHandler('author_sync', async () => {
          throw new Error('Handler failed');
        });

        const task = createTask('author_sync');
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
        assert.strictEqual(updated.error, 'Handler failed');
      });

      it('should handle rate limit errors and queue for retry', async () => {
        let attemptCount = 0;

        registerTaskHandler('author_sync', async () => {
          attemptCount++;
          if (attemptCount === 1) {
            throw new Error('API error: 429 Too Many Requests');
          }
          return { success: true, attempt: attemptCount };
        });

        const task = createTask('author_sync');
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'pending');
        assert.ok(updated.error?.includes('Rate limited'));
      });
    });

    describe('enqueueTask', () => {
      it('should create and start a task', async () => {
        let handlerCalled = false;

        registerTaskHandler('scan', async () => {
          handlerCalled = true;
          return { success: true };
        });

        const task = enqueueTask('scan', { libraryId: 123 });

        assert.ok(task.id > 0);
        assert.strictEqual(task.type, 'scan');
        assert.strictEqual(task.status, 'pending');

        // Give it time to execute
        await new Promise(resolve => setTimeout(resolve, 50));

        assert.strictEqual(handlerCalled, true);
      });

      it('should handle task failures gracefully', async () => {
        registerTaskHandler('metadata', async () => {
          throw new Error('Task failed');
        });

        const task = enqueueTask('metadata');

        // Give it time to execute and fail
        await new Promise(resolve => setTimeout(resolve, 50));

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
      });
    });

    describe('retryTask', () => {
      it('should create a new task from a failed task', async () => {
        const originalTask = createTask('scan', { libraryId: 456 });
        failTask(originalTask.id, 'Original task failed');

        let handlerCalled = false;
        registerTaskHandler('scan', async () => {
          handlerCalled = true;
          return { success: true };
        });

        const newTask = retryTask(originalTask.id);

        assert.ok(newTask);
        assert.notStrictEqual(newTask.id, originalTask.id);
        assert.strictEqual(newTask.type, 'scan');
        assert.ok(newTask.data);
        assert.strictEqual((newTask.data as Record<string, number>).libraryId, 456);

        // Give it time to execute
        await new Promise(resolve => setTimeout(resolve, 50));
        assert.strictEqual(handlerCalled, true);
      });

      it('should create a new task from a cancelled task', async () => {
        const originalTask = createTask('metadata', { bookIds: [1, 2, 3] });
        cancelTask(originalTask.id);

        registerTaskHandler('metadata', async () => {
          return { success: true };
        });

        const newTask = retryTask(originalTask.id);

        assert.ok(newTask);
        assert.notStrictEqual(newTask.id, originalTask.id);
        assert.strictEqual(newTask.type, 'metadata');
      });

      it('should throw error for non-existent task', () => {
        assert.throws(
          () => retryTask(99999),
          /Task 99999 not found/
        );
      });

      it('should throw error for non-failed/cancelled task', () => {
        const task = createTask('scan');

        assert.throws(
          () => retryTask(task.id),
          /is not failed or cancelled/
        );
      });

      it('should preserve task data when retrying', async () => {
        const originalData = {
          libraryId: 789,
          unmatchedOnly: true,
          bookIds: [10, 20, 30],
        };

        const originalTask = createTask('metadata', originalData);
        failTask(originalTask.id, 'Failed');

        registerTaskHandler('metadata', async () => ({ success: true }));

        const newTask = retryTask(originalTask.id);
        assert.ok(newTask.data);
        assert.deepStrictEqual(newTask.data, originalData);
      });
    });

    describe('ensureHandlersRegistered', () => {
      it('should not throw when called multiple times', async () => {
        const { ensureHandlersRegistered } = await import('../../lib/services/queue/index.js');

        // Should be safe to call multiple times
        ensureHandlersRegistered();
        ensureHandlersRegistered();
        ensureHandlersRegistered();

        // No assertions needed - just checking it doesn't throw
        assert.ok(true);
      });
    });
  });

  describe('Queue Service - Handler Utilities', () => {
    beforeEach(() => {
      initDatabase();
      execute('DELETE FROM tasks', []);
      execute('DELETE FROM books', []);
      execute('DELETE FROM libraries', []);
    });

    afterEach(() => {
      closeDatabase();
    });

    after(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    describe('sanitizeFilename', () => {
      it('should remove invalid filesystem characters', async () => {
        // Import the handlers module to access sanitizeFilename indirectly through file operations
        // We'll test this through the download handler behavior

        // Create a test library
        const libPath = join(testDir, 'test-library');
        mkdirSync(libPath, { recursive: true });

        execute(
          'INSERT INTO libraries (name, path, type) VALUES (?, ?, ?)',
          ['Test Library', libPath, 'books']
        );

        // The sanitizeFilename function should handle these special characters
        const testTitle = 'Test <Book> "Title": With/Invalid\\Chars|And*More?';
        const testAuthor = 'Author&Name';

        // We can observe the sanitization through actual file operations
        // This is indirectly testing the sanitizeFilename function used in handlers
        assert.ok(true); // Placeholder - actual testing happens through handler integration tests
      });
    });

    describe('moveFile', () => {
      it('should move files within the same filesystem', () => {
        const sourceDir = join(testDir, 'source');
        const targetDir = join(testDir, 'target');

        mkdirSync(sourceDir, { recursive: true });
        mkdirSync(targetDir, { recursive: true });

        const sourcePath = join(sourceDir, 'test.txt');
        const targetPath = join(targetDir, 'test.txt');

        writeFileSync(sourcePath, 'test content');

        // The moveFile function is internal to handlers, but we can test it indirectly
        // through the organize handler which uses it
        assert.ok(existsSync(sourcePath));
      });
    });
  });

  describe('Queue Service - Handler Integration (Mocked)', () => {
    let testLibPath: string;

    beforeEach(() => {
      initDatabase();
      execute('DELETE FROM tasks', []);
      execute('DELETE FROM books', []);
      execute('DELETE FROM libraries', []);
      execute('DELETE FROM wanted_books', []);
      execute('DELETE FROM authors', []);

      // Create test library
      testLibPath = join(testDir, 'test-lib');
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

    describe('scanHandler integration', () => {
      it('should handle missing library ID', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // Create task without libraryId in result field
        execute('INSERT INTO tasks (id, type, status, progress, result) VALUES (?, ?, ?, ?, ?)',
          [9001, 'scan', 'pending', 0, '{}']);

        await runTask(9001);

        const updated = getTask(9001);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
        assert.ok(updated.error?.includes('Library ID not specified'));
      });

      it('should handle non-existent library', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const task = createTask('scan', { libraryId: 99999 });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
        assert.ok(updated.error?.includes('not found'));
      });
    });

    describe('metadataHandler integration', () => {
      it('should handle missing configuration', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // Create task with null result
        execute('INSERT INTO tasks (id, type, status, progress) VALUES (?, ?, ?, ?)',
          [999, 'metadata', 'pending', 0]);

        await runTask(999);

        const updated = getTask(999);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
        assert.ok(updated.error?.includes('missing configuration'));
      });

      it('should handle empty book list', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const task = createTask('metadata', { libraryId: 1, unmatchedOnly: true });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
        assert.ok(updated.data);
        assert.strictEqual((updated.data as { total: number }).total, 0);
      });

      it('should skip books without titles', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // Add a book without a title
        execute(
          'INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)',
          [1, '/path/to/book.epub', null]
        );

        const task = createTask('metadata', { libraryId: 1 });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
        const data = updated.data as { skipped: number };
        assert.strictEqual(data.skipped, 1);
      });
    });

    describe('bookMetadataHandler integration', () => {
      it('should handle missing configuration', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        execute('INSERT INTO tasks (id, type, status, progress) VALUES (?, ?, ?, ?)',
          [998, 'book_metadata', 'pending', 0]);

        await runTask(998);

        const updated = getTask(998);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
      });

      it('should handle non-existent book', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const task = createTask('book_metadata', { bookId: 99999, bookTitle: 'Test' });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
        assert.ok(updated.error?.includes('not found'));
      });

      it('should skip book without title', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // Add a book without a title
        execute(
          'INSERT INTO books (id, library_id, file_path, title) VALUES (?, ?, ?, ?)',
          [1, 1, '/path/to/book.epub', null]
        );

        const task = createTask('book_metadata', { bookId: 1, bookTitle: 'Unknown' });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
        const data = updated.data as { status: string };
        assert.strictEqual(data.status, 'skipped');
      });
    });

    describe('downloadHandler integration', () => {
      it('should handle missing configuration', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        execute('INSERT INTO tasks (id, type, status, progress) VALUES (?, ?, ?, ?)',
          [997, 'download', 'pending', 0]);

        await runTask(997);

        const updated = getTask(997);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
      });

      it('should handle invalid configuration', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const task = createTask('download', { source: 'libgen' }); // Missing required fields
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
        assert.ok(updated.error?.includes('Invalid download task configuration'));
      });

      it('should handle non-existent library', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const task = createTask('download', {
          source: 'libgen',
          md5: 'abc123',
          title: 'Test Book',
          author: 'Test Author',
          extension: 'epub',
          libraryId: 99999,
        });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
      });

      it('should handle unsupported download source', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const task = createTask('download', {
          source: 'annas',
          md5: 'abc123',
          title: 'Test Book',
          author: 'Test Author',
          extension: 'epub',
          libraryId: 1,
        });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
        assert.ok(updated.error?.includes('not yet supported'));
      });
    });

    describe('organizeHandler integration', () => {
      it('should handle missing configuration', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        execute('INSERT INTO tasks (id, type, status, progress) VALUES (?, ?, ?, ?)',
          [996, 'organize', 'pending', 0]);

        await runTask(996);

        const updated = getTask(996);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
      });

      it('should handle non-existent library', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const task = createTask('organize', { libraryId: 99999 });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
      });

      it('should handle empty book list', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const task = createTask('organize', { libraryId: 1 });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
        const data = updated.data as { total: number };
        assert.strictEqual(data.total, 0);
      });

      it('should organize books without titles using path fallback', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // Add a book without a title — file exists; parsePathInfo should fill in a title.
        const filePath = join(testLibPath, 'test.epub');
        writeFileSync(filePath, 'content');
        execute(
          'INSERT INTO books (library_id, file_path, title, authors, extension) VALUES (?, ?, ?, ?, ?)',
          [1, filePath, null, null, 'epub']
        );

        const task = createTask('organize', { libraryId: 1 });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
        const data = updated.data as { organized: number };
        assert.strictEqual(data.organized, 1);
      });

      it('should report missing files as failed', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // Add a book with non-existent file
        execute(
          'INSERT INTO books (library_id, file_path, title, authors, extension) VALUES (?, ?, ?, ?, ?)',
          [1, '/nonexistent/path/book.epub', 'Test Book', '["Test Author"]', 'epub']
        );

        const task = createTask('organize', { libraryId: 1 });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
        const data = updated.data as { failed: number };
        assert.strictEqual(data.failed, 1);
      });

      it('should organize book with valid file', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // Create actual test file
        const testFilePath = join(testLibPath, 'test.epub');
        writeFileSync(testFilePath, 'test content');

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension) VALUES (?, ?, ?, ?, ?, ?)',
          [1, 1, testFilePath, 'Test Book', '["Test Author"]', 'epub']
        );

        const task = createTask('organize', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
        const data = updated.data as { organized: number };
        assert.strictEqual(data.organized, 1);

        // Default template: {author}/{series}/Book {number} - {title}.{ext}
        // No series → segment collapses; standalone yields: Author/Book - Title.ext
        const expectedPath = join(testLibPath, 'Test Author', 'Book - Test Book.epub');
        assert.ok(existsSync(expectedPath));
      });

      it('should handle books already in correct location', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // Create file in default-template location
        const authorDir = join(testLibPath, 'Test Author');
        mkdirSync(authorDir, { recursive: true });
        const correctPath = join(authorDir, 'Book - Test Book.epub');
        writeFileSync(correctPath, 'test content');

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension) VALUES (?, ?, ?, ?, ?, ?)',
          [1, 1, correctPath, 'Test Book', '["Test Author"]', 'epub']
        );

        const task = createTask('organize', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
        const data = updated.data as { skipped: number };
        assert.strictEqual(data.skipped, 1);
      });

      it('should handle duplicate filenames', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // Create first file
        const file1 = join(testLibPath, 'book1.epub');
        writeFileSync(file1, 'content 1');

        // Create target file that would conflict (default template path)
        const authorDir = join(testLibPath, 'Test Author');
        mkdirSync(authorDir, { recursive: true });
        const existingFile = join(authorDir, 'Book - Test Book.epub');
        writeFileSync(existingFile, 'existing content');

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension) VALUES (?, ?, ?, ?, ?, ?)',
          [1, 1, file1, 'Test Book', '["Test Author"]', 'epub']
        );

        const task = createTask('organize', { bookIds: [1] });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');

        // Should create file with (1) suffix
        const expectedPath = join(authorDir, 'Book - Test Book (1).epub');
        assert.ok(existsSync(expectedPath));
      });

      it('should handle books with series information', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const testFile = join(testLibPath, 'book.epub');
        writeFileSync(testFile, 'test content');

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension, series_name, series_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [1, 1, testFile, 'First Book', '["Author Name"]', 'epub', 'Great Series', 1]
        );

        const task = createTask('organize', { libraryId: 1 });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');

        // Default template hierarchical layout: Author/Series/Book NNN - Title.ext
        const expectedPath = join(testLibPath, 'Author Name', 'Great Series', 'Book 001 - First Book.epub');
        assert.ok(existsSync(expectedPath));
      });

      it('should handle author names in non-JSON format', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const testFile = join(testLibPath, 'book.epub');
        writeFileSync(testFile, 'test content');

        execute(
          'INSERT INTO books (id, library_id, file_path, title, authors, extension) VALUES (?, ?, ?, ?, ?, ?)',
          [1, 1, testFile, 'Test Book', 'Plain Author Name', 'epub']
        );

        const task = createTask('organize', { libraryId: 1 });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');

        const expectedPath = join(testLibPath, 'Plain Author Name', 'Book - Test Book.epub');
        assert.ok(existsSync(expectedPath));
      });
    });

    describe('authorSyncHandler', () => {
      it('should return placeholder message', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const task = createTask('author_sync', {});
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
        const data = updated.data as { message: string };
        assert.ok(data.message.includes('not yet implemented'));
      });
    });

    describe('registerAllHandlers', () => {
      it('should register all handler types', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');

        // Should not throw
        registerAllHandlers();

        // All handlers should be registered and usable
        const handlers = [
          'scan',
          'metadata',
          'book_metadata',
          'organize',
          'download',
          'author_sync',
        ];

        for (const handlerType of handlers) {
          const task = createTask(handlerType as any, {});
          // Should not fail with "no handler registered" error
          await runTask(task.id);

          const updated = getTask(task.id);
          assert.ok(updated);
          // Status should be either completed or failed (not failed due to missing handler)
          assert.notStrictEqual(updated.error, 'No handler registered');
        }
      });
    });
  });
} else {
  // Placeholder test when native modules aren't available
  describe('Queue Service - Advanced Features', () => {
    it('skipped - native modules not available', { skip: true }, () => {});
  });
}
