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
  console.warn('⚠️  Skipping Queue Retry Persistence tests: better-sqlite3 native module not available');
  canRunTests = false;
} finally {
  rmSync(checkDir, { recursive: true, force: true });
}

if (canRunTests) {
  const testDir = mkdtempSync(join(tmpdir(), 'shelvarr-queue-retry-persist-'));
  process.env['DATA_DIR'] = testDir;
  process.env['DB_PATH'] = join(testDir, 'test.db');

  const { initDatabase, closeDatabase, execute, queryOne } = await import('../../lib/db/index.js');
  const {
    registerTaskHandler,
    createTask,
    runTask,
    getTask,
    retryTask,
    cancelTask,
    rebuildRetryQueueFromDatabase,
    RateLimitedError,
  } = await import('../../lib/services/queue/index.js');

  /** Poll until `check` passes, so tests don't guess at a fixed delay. */
  async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!check()) {
      if (Date.now() > deadline) throw new Error('Timed out waiting for condition');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /** Read the raw `not_before` column, bypassing the `Task` shape that doesn't expose it. */
  function getNotBefore(taskId: number): string | null {
    const row = queryOne<{ not_before: string | null }>(
      'SELECT not_before FROM tasks WHERE id = ?',
      [taskId]
    );
    return row?.not_before ?? null;
  }

  // This file is kept separate from queue-retry.test.ts on purpose: those
  // tests deliberately schedule many ~10s-delayed retries against the same
  // in-memory queue and never wait for them to drain, so a test appended to
  // that file would inherit a busy background processor and need very
  // generous timeouts to avoid flaking. Node's test runner gives each test
  // file its own process, so this file starts with a clean module and can
  // use tight timeouts throughout.
  describe('Queue Service - persisting the retry queue across a restart', () => {
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

    it('scheduleRetry writes not_before onto the task row', async () => {
      let attempts = 0;
      registerTaskHandler('comic_refresh', async () => {
        attempts++;
        // A short, explicit delay (rather than the generic-429 default of
        // 10 seconds) keeps this test fast and lets the processor finish
        // rather than lingering for the rest of the suite.
        if (attempts === 1) throw new RateLimitedError('rate limited', 20);
        return { success: true };
      });

      const task = createTask('comic_refresh');
      await runTask(task.id);

      const deferred = getTask(task.id);
      assert.strictEqual(deferred?.status, 'pending');
      assert.ok(getNotBefore(task.id), 'not_before should be set once the task is queued for retry');

      await waitFor(() => getTask(task.id)?.status === 'completed');
      assert.strictEqual(getNotBefore(task.id), null, 'not_before is cleared once the retry runs');
    });

    it('rebuildRetryQueueFromDatabase picks up a past-due pending task promptly', async () => {
      let attempts = 0;
      registerTaskHandler('comic_search', async () => {
        attempts++;
        return { success: true, attempts };
      });

      // Simulate a task left over from before a restart: pending, with a
      // not_before that is already well in the past.
      const task = createTask('comic_search');
      execute(
        "UPDATE tasks SET status = 'pending', error = 'Rate limited - queued for retry (#1)', not_before = '2000-01-01 00:00:00' WHERE id = ?",
        [task.id]
      );

      const requeued = rebuildRetryQueueFromDatabase();
      assert.strictEqual(requeued, 1);

      // A stale backoff should fire promptly, not be skipped or waited out.
      await waitFor(() => getTask(task.id)?.status === 'completed');

      assert.strictEqual(attempts, 1);
      assert.strictEqual(getNotBefore(task.id), null, 'not_before is cleared once the task starts');
    });

    it('rebuildRetryQueueFromDatabase ignores a pending task with no not_before', () => {
      // A task that has never run — never scheduled for retry — must not be
      // swept up by the rebuild; only `isRetriable`'s manual-retry path
      // applies to it.
      createTask('comic_search');

      const requeued = rebuildRetryQueueFromDatabase();
      assert.strictEqual(requeued, 0);
    });

    it('does not leave a stale not_before once a task is dropped from the retry queue', async () => {
      registerTaskHandler('comic_update_all', async () => {
        throw new RateLimitedError('rate limited', 60_000);
      });

      const task = createTask('comic_update_all');
      await runTask(task.id);

      assert.ok(getNotBefore(task.id), 'not_before is set while queued for retry');

      // Cancelling drops the task from the in-memory retry queue.
      cancelTask(task.id);

      assert.strictEqual(getTask(task.id)?.status, 'cancelled');
      assert.strictEqual(
        getNotBefore(task.id),
        null,
        'a cancelled task must not carry a stale not_before that a later rebuild could pick up'
      );

      // A rebuild afterward must not resurrect it: it's no longer pending.
      const requeued = rebuildRetryQueueFromDatabase();
      assert.strictEqual(requeued, 0);
    });

    it('does not leave a stale not_before once a retried task completes', async () => {
      let attempts = 0;
      registerTaskHandler('comic_rename', async () => {
        attempts++;
        if (attempts === 1) throw new RateLimitedError('rate limited', 60_000);
        return { success: true };
      });

      const task = createTask('comic_rename');
      await runTask(task.id);

      assert.ok(getNotBefore(task.id), 'not_before is set while queued for retry');

      // Manual retry (the pending-task path) drops the task from the retry
      // queue and re-runs it in place immediately, rather than waiting out
      // the backoff — this is the "human clicks retry" fallback the card
      // says must stay working alongside the new automatic rebuild.
      const retried = retryTask(task.id);
      assert.ok(retried);

      await waitFor(() => getTask(task.id)?.status === 'completed');

      assert.strictEqual(
        getNotBefore(task.id),
        null,
        'a completed task must not carry a stale not_before'
      );

      // And a rebuild afterward must not resurrect it.
      const requeued = rebuildRetryQueueFromDatabase();
      assert.strictEqual(requeued, 0);
    });
  });
} else {
  describe('Queue Service - persisting the retry queue across a restart', () => {
    it('skipped - native modules not available', { skip: true }, () => {});
  });
}
