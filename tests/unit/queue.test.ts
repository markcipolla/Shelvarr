import { describe, it, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, existsSync } from 'fs';
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
  console.warn('⚠️  Skipping Queue Service tests: better-sqlite3 native module not available in this environment');
  console.warn('   Error:', err instanceof Error ? err.message : String(err));
  canRunTests = false;
} finally {
  rmSync(checkDir, { recursive: true, force: true });
}

if (canRunTests) {
  // Set test database path before importing db module
  const testDir = mkdtempSync(join(tmpdir(), 'shelvarr-queue-test-'));
  process.env['DATA_DIR'] = testDir;
  process.env['DB_PATH'] = join(testDir, 'test.db');

  // Dynamic imports only when tests can run
  const { initDatabase, closeDatabase, execute } = await import('../../lib/db/index.js');
  const {
    createTask,
    getTask,
    getTasks,
    getRecentTasks,
    getRunningTasks,
    updateTaskProgress,
    startTask,
    completeTask,
    failTask,
    cancelTask,
    cleanupOldTasks,
    getTaskStats,
  } = await import('../../lib/services/queue/index.js');
  type TaskType = 'scan' | 'metadata' | 'organize' | 'download' | 'author_sync';

  describe('Queue Service', () => {
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

    describe('createTask', () => {
      it('should create a new task with pending status', () => {
        const task = createTask('scan');

        assert.ok(task.id > 0);
        assert.strictEqual(task.type, 'scan');
        assert.strictEqual(task.status, 'pending');
        assert.strictEqual(task.progress, 0);
        assert.ok(task.createdAt);
      });

      it('should create task with initial data', () => {
        const task = createTask('scan', { libraryId: 123 });

        assert.strictEqual(task.type, 'scan');
        assert.ok(task.data);
        assert.strictEqual((task.data as Record<string, number>).libraryId, 123);
      });

      it('should create tasks with different types', () => {
        const taskTypes: TaskType[] = ['scan', 'metadata', 'organize', 'download', 'author_sync'];

        for (const type of taskTypes) {
          const task = createTask(type);
          assert.strictEqual(task.type, type);
        }
      });
    });

    describe('getTask', () => {
      it('should retrieve a task by ID', () => {
        const created = createTask('scan');
        const retrieved = getTask(created.id);

        assert.ok(retrieved);
        assert.strictEqual(retrieved.id, created.id);
        assert.strictEqual(retrieved.type, 'scan');
      });

      it('should return null for non-existent task', () => {
        const task = getTask(99999);
        assert.strictEqual(task, null);
      });
    });

    describe('getTasks', () => {
      it('should return all tasks with pagination', () => {
        createTask('scan');
        createTask('metadata');
        createTask('organize');

        const result = getTasks({ limit: 10 });

        assert.strictEqual(result.tasks.length, 3);
        assert.strictEqual(result.total, 3);
      });

      it('should filter by type', () => {
        createTask('scan');
        createTask('metadata');
        createTask('scan');

        const result = getTasks({ type: 'scan' });

        assert.strictEqual(result.tasks.length, 2);
        assert.ok(result.tasks.every(t => t.type === 'scan'));
      });

      it('should filter by status', () => {
        const task1 = createTask('scan');
        createTask('metadata');

        startTask(task1.id);

        const result = getTasks({ status: 'running' });

        assert.strictEqual(result.tasks.length, 1);
        assert.strictEqual(result.tasks[0]?.status, 'running');
      });

      it('should paginate results', () => {
        for (let i = 0; i < 15; i++) {
          createTask('scan');
        }

        const page1 = getTasks({ limit: 10, offset: 0 });
        const page2 = getTasks({ limit: 10, offset: 10 });

        assert.strictEqual(page1.tasks.length, 10);
        assert.strictEqual(page2.tasks.length, 5);
        assert.strictEqual(page1.total, 15);
      });
    });

    describe('getRecentTasks', () => {
      it('should return most recent tasks', () => {
        createTask('scan');
        createTask('metadata');
        createTask('organize');

        const recent = getRecentTasks(2);

        assert.strictEqual(recent.length, 2);
      });
    });

    describe('getRunningTasks', () => {
      it('should return only running tasks', () => {
        const task1 = createTask('scan');
        const task2 = createTask('metadata');
        createTask('organize');

        startTask(task1.id);
        startTask(task2.id);

        const running = getRunningTasks();

        assert.strictEqual(running.length, 2);
        assert.ok(running.every(t => t.status === 'running'));
      });
    });

    describe('updateTaskProgress', () => {
      it('should update task progress', () => {
        const task = createTask('scan');

        updateTaskProgress(task.id, 50, 100);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.progress, 50);
        assert.strictEqual(updated.total, 100);
      });
    });

    describe('startTask', () => {
      it('should mark task as running', () => {
        const task = createTask('scan');

        startTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'running');
      });
    });

    describe('completeTask', () => {
      it('should mark task as completed with result', () => {
        const task = createTask('scan');

        completeTask(task.id, { added: 10, updated: 5 });

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
        assert.ok(updated.completedAt);
        assert.ok(updated.data);
        assert.strictEqual((updated.data as Record<string, number>).added, 10);
      });
    });

    describe('failTask', () => {
      it('should mark task as failed with error', () => {
        const task = createTask('scan');

        failTask(task.id, 'Something went wrong');

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'failed');
        assert.strictEqual(updated.error, 'Something went wrong');
        assert.ok(updated.completedAt);
      });
    });

    describe('cancelTask', () => {
      it('should cancel a pending task', () => {
        const task = createTask('scan');

        const result = cancelTask(task.id);

        assert.strictEqual(result, true);
        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'cancelled');
      });

      it('should cancel a running task', () => {
        const task = createTask('scan');
        startTask(task.id);

        cancelTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'cancelled');
      });
    });

    describe('cleanupOldTasks', () => {
      it('should delete completed tasks older than specified days', () => {
        const task = createTask('scan');
        completeTask(task.id, {});

        // Update created_at to 10 days ago
        execute(
          "UPDATE tasks SET created_at = datetime('now', '-10 days') WHERE id = ?",
          [task.id]
        );

        const deleted = cleanupOldTasks(7);

        assert.strictEqual(deleted, 1);
        assert.strictEqual(getTask(task.id), null);
      });

      it('should not delete recent tasks', () => {
        const task = createTask('scan');
        completeTask(task.id, {});

        const deleted = cleanupOldTasks(7);

        assert.strictEqual(deleted, 0);
        assert.ok(getTask(task.id));
      });

      it('should not delete pending or running tasks', () => {
        createTask('scan'); // pending task
        const running = createTask('metadata');
        startTask(running.id);

        // Set old dates
        execute(
          "UPDATE tasks SET created_at = datetime('now', '-10 days')",
          []
        );

        const deleted = cleanupOldTasks(7);

        assert.strictEqual(deleted, 0);
      });
    });

    describe('getTaskStats', () => {
      it('should return task statistics', () => {
        createTask('scan');
        const task2 = createTask('metadata');
        const task3 = createTask('organize');
        const task4 = createTask('download');

        startTask(task2.id);
        completeTask(task3.id, {});
        failTask(task4.id, 'error');

        const stats = getTaskStats();

        assert.strictEqual(stats.total, 4);
        assert.strictEqual(stats.pending, 1);
        assert.strictEqual(stats.running, 1);
        assert.strictEqual(stats.completed, 1);
        assert.strictEqual(stats.failed, 1);
      });

      it('should return zeros when no tasks exist', () => {
        const stats = getTaskStats();

        assert.strictEqual(stats.total, 0);
        assert.strictEqual(stats.pending, 0);
        assert.strictEqual(stats.running, 0);
        assert.strictEqual(stats.completed, 0);
        assert.strictEqual(stats.failed, 0);
      });
    });

    describe('getTasks with statuses array', () => {
      it('should filter by multiple statuses', () => {
        const task1 = createTask('scan');
        const task2 = createTask('metadata');
        const task3 = createTask('organize');
        const task4 = createTask('download');

        startTask(task2.id);
        completeTask(task3.id, {});
        failTask(task4.id, 'error');

        const result = getTasks({ statuses: ['running', 'completed'] });

        assert.strictEqual(result.tasks.length, 2);
        assert.ok(result.tasks.every(t => t.status === 'running' || t.status === 'completed'));
      });

      it('should handle empty statuses array', () => {
        createTask('scan');
        createTask('metadata');

        const result = getTasks({ statuses: [] });

        assert.strictEqual(result.tasks.length, 2);
      });
    });

    describe('rowToTask with invalid JSON', () => {
      it('should handle invalid JSON in result field', () => {
        const task = createTask('scan');
        // Update with invalid JSON
        execute('UPDATE tasks SET result = ? WHERE id = ?', ['invalid json{', task.id]);

        const retrieved = getTask(task.id);
        assert.ok(retrieved);
        assert.strictEqual(retrieved.result, 'invalid json{');
        assert.strictEqual(retrieved.data, undefined);
      });
    });

    describe('cancelTask with non-existent task', () => {
      it('should return true even for non-existent task', () => {
        const result = cancelTask(99999);
        assert.strictEqual(result, true);
      });
    });
  });
} else {
  // Placeholder test when native modules aren't available
  describe('Queue Service', () => {
    it('skipped - native modules not available', { skip: true }, () => {});
  });
}
