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
  console.warn('⚠️  Skipping Queue Advanced tests: better-sqlite3 native module not available');
  canRunTests = false;
} finally {
  rmSync(checkDir, { recursive: true, force: true });
}

if (canRunTests) {
  const testDir = mkdtempSync(join(tmpdir(), 'shelvarr-queue-advanced-'));
  process.env['DATA_DIR'] = testDir;
  process.env['DB_PATH'] = join(testDir, 'test.db');

  const { initDatabase, closeDatabase, execute } = await import('../../lib/db/index.js');
  const {
    registerTaskHandler,
    createTask,
    runTask,
    getTask,
    enqueueTask,
  } = await import('../../lib/services/queue/index.js');

  describe('Queue Service - Retry Queue and Rate Limiting', () => {
    beforeEach(() => {
      initDatabase();
      execute('DELETE FROM tasks', []);
    });

    afterEach(() => {
      closeDatabase();
    });

    after(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    describe('Rate limit retry queue', () => {
      it('should queue task for retry on 429 error', async () => {
        let callCount = 0;

        registerTaskHandler('metadata', async () => {
          callCount++;
          if (callCount === 1) {
            // First call returns 429
            throw new Error('HTTP 429 - Rate limit exceeded');
          }
          // Second call succeeds
          return { success: true, retry: true };
        });

        const task = createTask('metadata', { test: true });
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'pending');
        assert.ok(updated.error?.includes('Rate limited'));
      });

      it('should not queue non-429 errors for retry', async () => {
        registerTaskHandler('scan', async () => {
          throw new Error('HTTP 500 - Server error');
        });

        const task = createTask('scan');
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
        assert.strictEqual(updated.error, 'HTTP 500 - Server error');
      });

      it('should handle multiple tasks with rate limit errors', async () => {
        let task1Calls = 0;
        let task2Calls = 0;

        registerTaskHandler('book_metadata', async (taskId) => {
          if (taskId % 2 === 0) {
            task1Calls++;
            if (task1Calls === 1) {
              throw new Error('Rate limited: 429');
            }
            return { success: true, taskId };
          } else {
            task2Calls++;
            if (task2Calls === 1) {
              throw new Error('Error with 429 in message');
            }
            return { success: true, taskId };
          }
        });

        const task1 = createTask('book_metadata');
        const task2 = createTask('book_metadata');

        await runTask(task1.id);
        await runTask(task2.id);

        const updated1 = getTask(task1.id);
        const updated2 = getTask(task2.id);

        // Both should be pending (queued for retry)
        assert.ok(updated1);
        assert.strictEqual(updated1.status, 'pending');
        assert.ok(updated2);
        assert.strictEqual(updated2.status, 'pending');
      });
    });

    describe('Task cancellation during execution', () => {
      it('should abort task when signal is triggered', async () => {
        let abortDetected = false;

        registerTaskHandler('organize', async (_taskId, _onProgress, signal) => {
          // Simulate long-running task
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, 1000);

            signal.addEventListener('abort', () => {
              clearTimeout(timeout);
              abortDetected = true;
              reject(new Error('Task cancelled'));
            });
          });

          return { success: true };
        });

        const task = createTask('organize');
        const runPromise = runTask(task.id);

        // Cancel after a short delay
        setTimeout(async () => {
          const { cancelTask } = await import('../../lib/services/queue/index.js');
          cancelTask(task.id);
        }, 50);

        await runPromise;

        assert.strictEqual(abortDetected, true);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'cancelled');
      });

      it('should handle abort signal check in handler', async () => {
        registerTaskHandler('download', async (_taskId, _onProgress, signal) => {
          // Handler checks signal periodically
          for (let i = 0; i < 10; i++) {
            if (signal.aborted) {
              throw new Error('Aborted by user');
            }
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          return { success: true };
        });

        const task = createTask('download');
        const runPromise = runTask(task.id);

        // Cancel immediately
        setTimeout(async () => {
          const { cancelTask } = await import('../../lib/services/queue/index.js');
          cancelTask(task.id);
        }, 5);

        await runPromise;

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'cancelled');
      });
    });

    describe('Task progress tracking', () => {
      it('should update progress during task execution', async () => {
        registerTaskHandler('komga_sync', async (taskId, onProgress) => {
          for (let i = 1; i <= 5; i++) {
            onProgress(i, 5);
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          return { success: true };
        });

        const task = createTask('komga_sync');
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.progress, 5);
        assert.strictEqual(updated.total, 5);
        assert.strictEqual(updated.status, 'completed');
      });

      it('should track progress for batch operations', async () => {
        const items = Array.from({ length: 20 }, (_, i) => i);

        registerTaskHandler('author_sync', async (taskId, onProgress) => {
          for (let i = 0; i < items.length; i++) {
            onProgress(i + 1, items.length);
            await new Promise(resolve => setTimeout(resolve, 5));
          }
          return { processed: items.length };
        });

        const task = createTask('author_sync');
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.progress, 20);
        assert.strictEqual(updated.total, 20);
      });
    });

    describe('Task error handling', () => {
      it('should handle synchronous errors in handler', async () => {
        registerTaskHandler('scan', () => {
          throw new Error('Synchronous error');
        });

        const task = createTask('scan');
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
        assert.strictEqual(updated.error, 'Synchronous error');
      });

      it('should handle async errors in handler', async () => {
        registerTaskHandler('metadata', async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          throw new Error('Async error');
        });

        const task = createTask('metadata');
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
        assert.strictEqual(updated.error, 'Async error');
      });

      it('should handle non-Error thrown values', async () => {
        registerTaskHandler('organize', async () => {
          throw 'String error';
        });

        const task = createTask('organize');
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
        assert.strictEqual(updated.error, 'Unknown error');
      });

      it('should handle null/undefined errors', async () => {
        registerTaskHandler('download', async () => {
          throw null;
        });

        const task = createTask('download');
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
        assert.strictEqual(updated.error, 'Unknown error');
      });
    });

    describe('Task completion scenarios', () => {
      it('should store complex result data', async () => {
        const complexResult = {
          items: [1, 2, 3],
          metadata: {
            source: 'test',
            timestamp: Date.now(),
          },
          stats: {
            processed: 100,
            failed: 5,
            skipped: 10,
          },
        };

        registerTaskHandler('book_metadata', async () => {
          return complexResult;
        });

        const task = createTask('book_metadata');
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
        assert.ok(updated.data);
        assert.deepStrictEqual(updated.data, complexResult);
      });

      it('should handle empty result data', async () => {
        registerTaskHandler('komga_sync', async () => {
          return {};
        });

        const task = createTask('komga_sync');
        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
        assert.deepStrictEqual(updated.data, {});
      });
    });

    describe('Multiple concurrent tasks', () => {
      it('should handle multiple tasks running concurrently', async () => {
        const completedTasks = new Set<number>();

        registerTaskHandler('author_sync', async (taskId) => {
          await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
          completedTasks.add(taskId);
          return { taskId };
        });

        const tasks = [
          createTask('author_sync'),
          createTask('author_sync'),
          createTask('author_sync'),
        ];

        await Promise.all(tasks.map(t => runTask(t.id)));

        assert.strictEqual(completedTasks.size, 3);

        for (const task of tasks) {
          const updated = getTask(task.id);
          assert.ok(updated);
          assert.strictEqual(updated.status, 'completed');
        }
      });
    });

    describe('Task data persistence', () => {
      it('should preserve initial data through task lifecycle', async () => {
        const initialData = {
          libraryId: 123,
          bookIds: [1, 2, 3],
          options: {
            force: true,
            dryRun: false,
          },
        };

        registerTaskHandler('scan', async () => {
          return { success: true };
        });

        const task = createTask('scan', initialData);

        // Verify initial data is stored
        assert.ok(task.data);
        assert.deepStrictEqual(task.data, initialData);

        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        // Result data should replace initial data
        assert.deepStrictEqual(updated.data, { success: true });
      });
    });

    describe('enqueueTask error handling', () => {
      it('should handle handler failure in enqueued task', async () => {
        registerTaskHandler('metadata', async () => {
          throw new Error('Enqueued task failed');
        });

        const task = enqueueTask('metadata', { test: true });

        // Wait for task to complete
        await new Promise(resolve => setTimeout(resolve, 100));

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
        assert.strictEqual(updated.error, 'Enqueued task failed');
      });

      it('should handle handler not registered for enqueued task', async () => {
        // Enqueue task without registering handler
        const task = enqueueTask('organize' as any, {});

        // Wait for task to process
        await new Promise(resolve => setTimeout(resolve, 100));

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
        assert.ok(updated.error?.includes('No handler registered'));
      });
    });
  });
} else {
  describe('Queue Service - Retry Queue and Rate Limiting', () => {
    it('skipped - native modules not available', { skip: true }, () => {});
  });
}
