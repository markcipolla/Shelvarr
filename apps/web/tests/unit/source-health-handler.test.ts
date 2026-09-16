/**
 * The `source_health` task handler.
 *
 * `refreshSourceStatuses` probes every download source over the network
 * (blocked in tests by `no-network.mjs`), so it is mocked here rather than
 * exercised for real. The mock is registered against
 * `@shelvarr/services/downloads/source-status` — the same file
 * `packages/services/src/queue/handlers.ts` reaches via its relative
 * `../downloads/source-status` import, per the package's `"./*"` export map
 * — so it intercepts the handler's own import, not just this test file's.
 */

import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const refreshSourceStatusesMock = mock.fn<() => Promise<void>>(async () => {});
const getSourceStatusesMock = mock.fn<() => Promise<Array<{ name: string }>>>(async () => [
  { name: 'zlibrary' },
  { name: 'annas' },
  { name: 'libgen' },
]);

mock.module('@shelvarr/services/downloads/source-status', {
  namedExports: {
    refreshSourceStatuses: () => refreshSourceStatusesMock(),
    getSourceStatuses: () => getSourceStatusesMock(),
  },
});

let canRunTests = true;
const checkDir = mkdtempSync(join(tmpdir(), 'shelvarr-check-'));
try {
  const Database = (await import('better-sqlite3')).default;
  const checkDb = new Database(join(checkDir, 'check.db'));
  checkDb.close();
} catch (err) {
  console.warn('⚠️  Skipping source_health handler tests: better-sqlite3 native module not available');
  console.warn('   Error:', err instanceof Error ? err.message : String(err));
  canRunTests = false;
} finally {
  rmSync(checkDir, { recursive: true, force: true });
}

if (canRunTests) {
  const testDir = mkdtempSync(join(tmpdir(), 'shelvarr-source-health-test-'));
  process.env['DATA_DIR'] = testDir;
  process.env['DB_PATH'] = join(testDir, 'test.db');

  const { initDatabase, closeDatabase, execute } = await import('../../lib/db/index.js');
  const { createTask, runTask, getTask } = await import('../../lib/services/queue/index.js');
  const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');

  describe('source_health task handler', () => {
    before(() => {
      initDatabase();
      registerAllHandlers();
    });

    beforeEach(() => {
      execute('DELETE FROM tasks', []);
      refreshSourceStatusesMock.mock.resetCalls();
      getSourceStatusesMock.mock.resetCalls();
    });

    after(() => {
      closeDatabase();
      rmSync(testDir, { recursive: true, force: true });
    });

    it('refreshes source statuses and reports how many were probed', async () => {
      const task = createTask('source_health', {});
      await runTask(task.id);

      const updated = getTask(task.id);
      assert.ok(updated);
      assert.strictEqual(updated.status, 'completed');
      assert.strictEqual(refreshSourceStatusesMock.mock.callCount(), 1);
      assert.strictEqual(getSourceStatusesMock.mock.callCount(), 1);

      const data = updated.data as { sourcesProbed: number };
      assert.strictEqual(data.sourcesProbed, 3);
    });

    it('fails the task rather than swallowing an error when the probe throws', async () => {
      refreshSourceStatusesMock.mock.mockImplementationOnce(async () => {
        throw new Error('network is down');
      });

      const task = createTask('source_health', {});
      await runTask(task.id);

      const updated = getTask(task.id);
      assert.ok(updated);
      assert.strictEqual(updated.status, 'failed');
      assert.ok(updated.error?.includes('network is down'));
    });
  });
} else {
  describe('source_health task handler', () => {
    it('skipped - native modules not available', { skip: true }, () => {});
  });
}
