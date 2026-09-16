/**
 * The queue announcing itself on the live event bus.
 *
 * The bus is tested on its own elsewhere; what matters here is that the task
 * lifecycle actually reaches it, because a missed publish is invisible — the
 * database is still correct and only an open page is left stale.
 */

import { describe, it, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let canRunTests = true;
const checkDir = mkdtempSync(join(tmpdir(), 'shelvarr-live-check-'));
try {
  const Database = (await import('better-sqlite3')).default;
  new Database(join(checkDir, 'check.db')).close();
} catch (err) {
  console.warn('⚠️  Skipping live queue event tests: better-sqlite3 not available');
  console.warn('   Error:', err instanceof Error ? err.message : String(err));
  canRunTests = false;
} finally {
  rmSync(checkDir, { recursive: true, force: true });
}

if (canRunTests) {
  const testDir = mkdtempSync(join(tmpdir(), 'shelvarr-live-events-test-'));
  process.env['DATA_DIR'] = testDir;
  process.env['DB_PATH'] = join(testDir, 'test.db');

  const { initDatabase, closeDatabase, execute } = await import('../../lib/db/index.js');
  const { createTask, startTask, completeTask, failTask, cancelTask } = await import(
    '../../lib/services/queue/index.js'
  );
  const { subscribe } = await import('@shelvarr/services/events/index');
  type LiveEvent = import('@shelvarr/services/events/index').LiveEvent;

  describe('queue live events', () => {
    let received: LiveEvent[];
    let unsubscribe: () => void;

    beforeEach(() => {
      initDatabase();
      execute('DELETE FROM tasks', []);
      received = [];
      unsubscribe = subscribe((event) => received.push(event));
    });

    afterEach(() => {
      unsubscribe();
      closeDatabase();
    });

    after(() => {
      if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    });

    const events = () => received.map((e) => e.event);

    it('announces a task being created', () => {
      const task = createTask('scan', { libraryName: 'Books' });

      assert.deepEqual(events(), ['created']);
      assert.equal(received[0]?.id, task.id);
      assert.equal(received[0]?.kind, 'task');
    });

    it('announces a task starting, with the status the database holds', () => {
      const task = createTask('scan');
      received.length = 0;

      startTask(task.id);

      assert.deepEqual(events(), ['started']);
      assert.equal((received[0] as { status: string }).status, 'running');
      assert.equal((received[0] as { taskType: string }).taskType, 'scan');
    });

    it('announces a task completing', () => {
      const task = createTask('organize');
      startTask(task.id);
      received.length = 0;

      completeTask(task.id, { organized: 3 });

      assert.deepEqual(events(), ['completed']);
      assert.equal((received[0] as { status: string }).status, 'completed');
    });

    it('carries the message when a task fails', () => {
      const task = createTask('metadata');
      startTask(task.id);
      received.length = 0;

      failTask(task.id, 'the api said no');

      assert.deepEqual(events(), ['failed']);
      assert.equal((received[0] as { error: string | null }).error, 'the api said no');
    });

    it('announces a cancellation', () => {
      const task = createTask('download');
      received.length = 0;

      cancelTask(task.id);

      assert.deepEqual(events(), ['cancelled']);
      assert.equal((received[0] as { status: string }).status, 'cancelled');
    });

    it('reports the status the database settled on, not the one asked for', () => {
      // Cancelling only applies to a pending or running task. A task that has
      // already finished keeps its status, and the page must be told that
      // rather than being shown a row that says cancelled.
      const task = createTask('scan');
      startTask(task.id);
      completeTask(task.id, {});
      received.length = 0;

      cancelTask(task.id);

      assert.equal((received[0] as { status: string }).status, 'completed');
    });
  });
}
