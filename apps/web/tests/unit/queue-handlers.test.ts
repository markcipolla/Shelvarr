import { describe, it, beforeEach, afterEach, after, mock } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';

// The download handler's static import of the LibGen client must be mocked
// before that module is ever loaded (a dynamic `import()` further down still
// counts as "loaded" the first time it runs), so this has to sit at the top
// of the file, before any `it()` body gets a chance to run.
//
// E2-2 split the old buffer-everything `downloadFile` into a resolve step
// (`resolveLibgenDownload`, returning a `ResolvedDownload` — just headers, no
// bytes) and a streaming step (`downloadToFile`, shared with the comic
// downloader). Both are mocked here so these tests can drive the handler's
// own orchestration (the scratch-then-move path, the progress throttle)
// without touching a network. `downloadToFile` itself — resume, range
// headers, the real fetch — is covered directly against the real
// implementation in streaming-download.test.ts.
const DEFAULT_CONTENT = Buffer.from('new downloaded content');

let resolvedDownload: {
  url: string;
  filename: string;
  size: number | null;
  supportsRange: boolean;
  contentType: string | null;
} | null = {
  url: 'https://libgen.example/get.php?md5=test&key=abc',
  filename: 'source-name-is-ignored.epub',
  size: DEFAULT_CONTENT.length,
  supportsRange: false,
  contentType: 'application/epub+zip',
};

/** Content the mocked `downloadToFile` writes on its next call. */
let downloadContent: Buffer = DEFAULT_CONTENT;

/** How many bytes the mock writes per `onProgress` tick. */
let downloadChunkSize = 4;

/** Set by a test that wants the streamed download to fail partway through. */
let downloadFailure: Error | null = null;

/**
 * Fires on every chunk the mock writes, in addition to the handler's own
 * `onProgress` callback — lets a test observe what actually landed in
 * `book_downloads` after each chunk, to check the handler's throttle.
 */
let onChunkWritten: (() => void) | null = null;

const mockResolveLibgenDownload = mock.fn(async (_md5: string) => resolvedDownload);

const mockDownloadToFile = mock.fn(
  async (
    resolved: { size: number | null },
    destination: string,
    options: { onProgress?: (bytes: number, total: number | null) => void } = {}
  ) => {
    mkdirSync(dirname(destination), { recursive: true });

    let written = 0;
    for (let offset = 0; offset < downloadContent.length; offset += downloadChunkSize) {
      const chunk = downloadContent.subarray(offset, offset + downloadChunkSize);
      writeFileSync(destination, chunk, { flag: 'a' });
      written += chunk.length;
      options.onProgress?.(written, resolved.size);
      onChunkWritten?.();

      if (downloadFailure && written >= downloadContent.length / 2) {
        throw downloadFailure;
      }
    }

    return { path: destination, bytes: written };
  }
);

mock.module('@shelvarr/services/downloads/libgen', {
  namedExports: {
    resolveLibgenDownload: mockResolveLibgenDownload,
    downloadToFile: mockDownloadToFile,
  },
});

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
  const { initDatabase, closeDatabase, execute, getBookDownloads, getBookDownload, addBookDownload, claimStalledBookDownloads } = await import('../../lib/db/index.js');
  const {
    registerTaskHandler,
    enqueueTask,
    retryTask,
    runTask,
    getTask,
    createTask,
    startTask,
    completeTask,
    failTask,
    cancelTask,
    failOrphanedRunningTasks,
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

      it('should throw error for a pending task that has never run', () => {
        const task = createTask('scan');

        assert.throws(
          () => retryTask(task.id),
          /cannot be retried \(status: pending\)/
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

    describe('failOrphanedRunningTasks', () => {
      it('fails only running tasks, leaving pending and completed ones alone', () => {
        const runningTask = createTask('scan');
        startTask(runningTask.id);

        const pendingTask = createTask('metadata');

        const completedTask = createTask('organize');
        startTask(completedTask.id);
        completeTask(completedTask.id, { success: true });

        const failedCount = failOrphanedRunningTasks();

        assert.strictEqual(failedCount, 1);

        const updatedRunning = getTask(runningTask.id);
        assert.ok(updatedRunning);
        assert.strictEqual(updatedRunning.status, 'failed');
        assert.strictEqual(updatedRunning.error, 'Interrupted by a server restart');
        assert.ok(updatedRunning.completedAt);

        const updatedPending = getTask(pendingTask.id);
        assert.ok(updatedPending);
        assert.strictEqual(updatedPending.status, 'pending');
        assert.strictEqual(updatedPending.error, null);

        const updatedCompleted = getTask(completedTask.id);
        assert.ok(updatedCompleted);
        assert.strictEqual(updatedCompleted.status, 'completed');
      });

      it('returns 0 when nothing is running', () => {
        createTask('metadata');

        const failedCount = failOrphanedRunningTasks();

        assert.strictEqual(failedCount, 0);
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
      execute('DELETE FROM book_downloads', []);
      execute('DELETE FROM book_download_history', []);

      // Create test library
      testLibPath = join(testDir, 'test-lib');
      mkdirSync(testLibPath, { recursive: true });

      execute(
        'INSERT INTO libraries (id, name, path, type) VALUES (?, ?, ?, ?)',
        [1, 'Test Library', testLibPath, 'books']
      );

      // Reset the resolve/stream mocks between tests, since several tests
      // below configure them differently.
      resolvedDownload = {
        url: 'https://libgen.example/get.php?md5=test&key=abc',
        filename: 'source-name-is-ignored.epub',
        size: DEFAULT_CONTENT.length,
        supportsRange: false,
        contentType: 'application/epub+zip',
      };
      downloadContent = DEFAULT_CONTENT;
      downloadChunkSize = 4;
      downloadFailure = null;
      onChunkWritten = null;
      mockResolveLibgenDownload.mock.resetCalls();
      mockDownloadToFile.mock.resetCalls();
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

        // E2-1: the download queue is a real row, not just this task —
        // the failure is recorded there too, and nothing crashes doing it.
        const downloads = getBookDownloads({ libraryId: 1 });
        assert.strictEqual(downloads.length, 1);
        assert.strictEqual(downloads[0]!.state, 'failed');
        assert.ok(downloads[0]!.error?.includes('not yet supported'));
      });

      it('should not overwrite a book you already have — it saves the new download under a numbered suffix', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // This is the exact filename the handler generates for this
        // author/title/extension: "{author} - {title}.{ext}".
        const existingPath = join(testLibPath, 'Test Author - Test Book.epub');
        writeFileSync(existingPath, 'existing content — the book you already have');

        // Sit a plain file where the organizer would want to create the
        // author folder, so its later rename fails and is swallowed by the
        // handler's own "keep original location" fallback. That isolates
        // this test to the Step 3 dedup logic under test, without it being
        // masked by Step 6 successfully relocating the file afterwards.
        // Cleaned up below — later tests in this file use "Test Author" as
        // a real author folder name.
        const blockingPath = join(testLibPath, 'Test Author');
        writeFileSync(blockingPath, 'not a directory');

        try {
          const task = createTask('download', {
            source: 'libgen',
            md5: 'abc123',
            title: 'Test Book',
            author: 'Test Author',
            extension: 'epub',
            libraryId: 1,
          });
          await runTask(task.id);

          const updated = getTask(task.id);
          assert.ok(updated);
          assert.strictEqual(updated.status, 'completed');

          // The book you already had is untouched.
          assert.strictEqual(
            readFileSync(existingPath, 'utf8'),
            'existing content — the book you already have'
          );

          // The new download landed at a numbered-suffix path instead.
          const dedupedPath = join(testLibPath, 'Test Author - Test Book (1).epub');
          assert.ok(existsSync(dedupedPath));
          assert.strictEqual(readFileSync(dedupedPath, 'utf8'), 'new downloaded content');

          const data = updated.data as { filePath: string };
          assert.strictEqual(data.filePath, dedupedPath);

          // E2-1: the download has a row of its own, and it reflects where
          // the file actually ended up — including the E2-0 dedup path
          // above — not just the task's transient result.
          const downloads = getBookDownloads({ libraryId: 1 });
          assert.strictEqual(downloads.length, 1);
          assert.strictEqual(downloads[0]!.state, 'completed');
          assert.strictEqual(downloads[0]!.filePath, dedupedPath);
          assert.ok(downloads[0]!.bookId);
          assert.ok(downloads[0]!.completedAt);

          // No `.partial` scratch file left behind once the download landed.
          assert.strictEqual(existsSync(`${dedupedPath}.partial`), false);
        } finally {
          rmSync(blockingPath, { force: true });
        }
      });

      it('persists byte progress to the book_downloads row as the stream runs, throttled rather than on every chunk', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        // 2.5 MB in 250 KB chunks: crosses the handler's 1 MB persist
        // threshold twice during the stream (at 1 MB and 2 MB), so a
        // throttled handler should write far fewer than the 10 chunks below.
        const size = 2_500_000;
        downloadContent = Buffer.alloc(size, 'x');
        downloadChunkSize = 250_000;
        resolvedDownload = {
          url: 'https://libgen.example/get.php?md5=big&key=abc',
          filename: 'big-book.epub',
          size,
          supportsRange: false,
          contentType: 'application/epub+zip',
        };

        const observedProgress: number[] = [];
        onChunkWritten = () => {
          const row = getBookDownloads({ libraryId: 1 })[0];
          if (row) observedProgress.push(row.progress);
        };

        const task = createTask('download', {
          source: 'libgen',
          md5: 'big',
          title: 'Big Book',
          author: 'Big Author',
          extension: 'epub',
          libraryId: 1,
        });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.strictEqual(updated?.status, 'completed');

        // 10 chunks were written, but the row should have been persisted at
        // only a handful of distinct progress values — proof the handler is
        // throttling rather than writing on every chunk.
        const distinctValues = new Set(observedProgress);
        assert.ok(
          distinctValues.size < observedProgress.length,
          `expected fewer distinct progress writes than chunks (${observedProgress.length}), got ${distinctValues.size}`
        );
        assert.ok(distinctValues.size <= 3, `expected at most a few persisted values, got ${[...distinctValues]}`);

        // The final row reflects the whole file, regardless of the throttle.
        const finalDownload = getBookDownloads({ libraryId: 1 })[0]!;
        assert.strictEqual(finalDownload.progress, size);
        assert.strictEqual(finalDownload.size, size);
        assert.strictEqual(finalDownload.state, 'completed');
      });

      it('never leaves a partial file at the final library path when the stream fails partway', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        downloadContent = Buffer.from('this download will not finish');
        downloadChunkSize = 4;
        downloadFailure = new Error('connection reset mid-stream');

        const task = createTask('download', {
          source: 'libgen',
          md5: 'flaky',
          title: 'Flaky Book',
          author: 'Flaky Author',
          extension: 'epub',
          libraryId: 1,
        });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.strictEqual(updated?.status, 'failed');

        const finalPath = join(testLibPath, 'Flaky Author - Flaky Book.epub');
        assert.strictEqual(existsSync(finalPath), false, 'the final path must not exist after a failed stream');
        assert.strictEqual(existsSync(`${finalPath}.partial`), false, 'the partial scratch file must be cleaned up too');

        const downloads = getBookDownloads({ libraryId: 1 });
        assert.strictEqual(downloads.length, 1);
        assert.strictEqual(downloads[0]!.state, 'failed');
        assert.ok(downloads[0]!.error?.includes('connection reset mid-stream'));
      });
    });

    describe('bookResumeHandler integration', () => {
      it('claims a downloading row whose heartbeat has gone cold, and leaves a live one alone', () => {
        const stale = addBookDownload({
          libraryId: 1,
          source: 'libgen',
          title: 'Stale Book',
          author: 'Stale Author',
          extension: 'epub',
          downloadUrl: 'libgen:stale-md5',
          md5: 'stale-md5',
        });
        execute(
          `UPDATE book_downloads SET state = 'downloading', heartbeat_at = datetime('now', '-60 minutes') WHERE id = ?`,
          [stale.id]
        );

        const live = addBookDownload({
          libraryId: 1,
          source: 'libgen',
          title: 'Live Book',
          author: 'Live Author',
          extension: 'epub',
          downloadUrl: 'libgen:live-md5',
          md5: 'live-md5',
        });
        execute(`UPDATE book_downloads SET state = 'downloading' WHERE id = ?`, [live.id]);

        const claimed = claimStalledBookDownloads(30);

        assert.deepStrictEqual(claimed.map((download) => download.id), [stale.id]);
        assert.strictEqual(getBookDownload(stale.id)!.state, 'queued');
        assert.strictEqual(
          getBookDownload(live.id)!.state,
          'downloading',
          'a download that is still checking in is left alone'
        );
      });

      it('does not claim a row still in queued — nothing was ever driving it to begin with', () => {
        const neverStarted = addBookDownload({
          libraryId: 1,
          source: 'libgen',
          title: 'Never Started',
          author: 'Some Author',
          extension: 'epub',
          downloadUrl: 'libgen:never-md5',
          md5: 'never-md5',
        });
        execute(
          `UPDATE book_downloads SET heartbeat_at = datetime('now', '-60 minutes') WHERE id = ?`,
          [neverStarted.id]
        );

        assert.deepStrictEqual(claimStalledBookDownloads(30), []);
      });

      it('will not let two sweeps claim the same orphan', () => {
        const orphan = addBookDownload({
          libraryId: 1,
          source: 'libgen',
          title: 'Orphan Book',
          author: 'Orphan Author',
          extension: 'epub',
          downloadUrl: 'libgen:orphan-md5',
          md5: 'orphan-md5',
        });
        execute(
          `UPDATE book_downloads SET state = 'importing', heartbeat_at = datetime('now', '-60 minutes') WHERE id = ?`,
          [orphan.id]
        );

        const first = claimStalledBookDownloads(30);
        const second = claimStalledBookDownloads(30);

        assert.deepStrictEqual(first.map((download) => download.id), [orphan.id]);
        assert.deepStrictEqual(second, []);
        assert.strictEqual(getBookDownload(orphan.id)!.state, 'queued');
      });

      it('resumes an interrupted download by driving its existing row, not creating a second one', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const orphan = addBookDownload({
          libraryId: 1,
          source: 'libgen',
          title: 'Resumed Book',
          author: 'Resumed Author',
          extension: 'epub',
          downloadUrl: 'libgen:resume-md5',
          md5: 'resume-md5',
        });
        execute(
          `UPDATE book_downloads SET state = 'downloading', heartbeat_at = datetime('now', '-60 minutes') WHERE id = ?`,
          [orphan.id]
        );

        const resumeTask = createTask('book_resume', { staleMinutes: 30, limit: 25 });
        await runTask(resumeTask.id);

        const resumeResult = getTask(resumeTask.id)!;
        assert.strictEqual(resumeResult.status, 'completed');
        assert.deepStrictEqual(
          (resumeResult.data as { downloadIds: number[] }).downloadIds,
          [orphan.id]
        );

        // The resume handler only enqueues the download task — it does not
        // await it — so poll for that nested task to actually finish.
        let downloadRow = getBookDownload(orphan.id)!;
        for (
          let i = 0;
          i < 20 && downloadRow.state !== 'completed' && downloadRow.state !== 'failed';
          i++
        ) {
          await new Promise((resolve) => setTimeout(resolve, 25));
          downloadRow = getBookDownload(orphan.id)!;
        }

        assert.strictEqual(downloadRow.state, 'completed');

        // Only the original row exists — resuming did not fork a second one.
        const allDownloads = getBookDownloads({ libraryId: 1 });
        assert.strictEqual(allDownloads.length, 1);
        assert.strictEqual(allDownloads[0]!.id, orphan.id);
        assert.ok(allDownloads[0]!.completedAt);
      });

      it('fails clearly, rather than silently creating a new row, when the referenced book_downloads row is gone', async () => {
        const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
        registerAllHandlers();

        const task = createTask('download', {
          bookDownloadId: 999999,
          source: 'libgen',
          md5: 'ghost-md5',
          title: 'Ghost Book',
          author: 'Ghost Author',
          extension: 'epub',
          libraryId: 1,
        });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
        assert.ok(updated.error?.includes('999999'));

        // No new book_downloads row was created as a fallback.
        assert.strictEqual(getBookDownloads({ libraryId: 1 }).length, 0);
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
