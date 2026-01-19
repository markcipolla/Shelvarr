/**
 * Background Job Queue Service
 * Manages async tasks like library scans, metadata fetches, and file reorganization
 */

import { query, queryOne, execute, insertReturning } from '@/lib/db';
import { createLogger } from '@/lib/utils/logger';

const log = createLogger('queue');

export type TaskType = 'scan' | 'metadata' | 'book_metadata' | 'organize' | 'download' | 'author_sync';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Task {
  id: number;
  type: TaskType;
  status: TaskStatus;
  progress: number;
  total: number | null;
  result: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  // Parsed data
  data?: Record<string, unknown>;
}

interface TaskRow {
  id: number;
  type: string;
  status: string;
  progress: number;
  total: number | null;
  result: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

function rowToTask(row: TaskRow): Task {
  let data: Record<string, unknown> | undefined;
  if (row.result) {
    try {
      data = JSON.parse(row.result);
    } catch {
      // Not JSON, leave as string
    }
  }

  return {
    id: row.id,
    type: row.type as TaskType,
    status: row.status as TaskStatus,
    progress: row.progress,
    total: row.total,
    result: row.result,
    error: row.error,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    data,
  };
}

// In-memory queue for running tasks
const runningTasks = new Map<number, { cancel: () => void }>();

// Rate limit retry queue - processes one task at a time with delays
const retryQueue: number[] = [];
let retryProcessorRunning = false;
const RETRY_DELAY_MS = 60000; // 1 minute between retries

async function processRetryQueue(): Promise<void> {
  if (retryProcessorRunning) return;
  retryProcessorRunning = true;

  while (retryQueue.length > 0) {
    const taskId = retryQueue.shift();
    if (!taskId) continue;

    // Check if task still exists and is pending
    const task = getTask(taskId);
    if (!task || task.status !== 'pending') {
      log.info('Skipping retry - task no longer pending', { taskId, status: task?.status });
      continue;
    }

    log.info('Retrying rate-limited task', { taskId, queueLength: retryQueue.length });

    try {
      await runTask(taskId);
    } catch (err) {
      log.error('Retry failed', { taskId, error: err });
    }

    // Wait before processing next task (even if successful, to avoid rate limits)
    if (retryQueue.length > 0) {
      log.info('Waiting before next retry', { delayMs: RETRY_DELAY_MS, remaining: retryQueue.length });
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  retryProcessorRunning = false;
}

function scheduleRetry(taskId: number): void {
  if (!retryQueue.includes(taskId)) {
    retryQueue.push(taskId);
    log.info('Task added to retry queue', { taskId, queueLength: retryQueue.length });
  }

  // Start processor after initial delay if not running
  if (!retryProcessorRunning) {
    setTimeout(() => {
      processRetryQueue().catch(err => {
        log.error('Retry processor error', { error: err });
        retryProcessorRunning = false;
      });
    }, RETRY_DELAY_MS);
  }
}

export interface TaskHandler {
  (
    taskId: number,
    onProgress: (current: number, total: number) => void,
    signal: AbortSignal
  ): Promise<Record<string, unknown>>;
}

const taskHandlers = new Map<TaskType, TaskHandler>();

/**
 * Register a handler for a task type
 */
export function registerTaskHandler(type: TaskType, handler: TaskHandler): void {
  taskHandlers.set(type, handler);
}

/**
 * Create a new task
 */
export function createTask(type: TaskType, initialData?: Record<string, unknown>): Task {
  const result = initialData ? JSON.stringify(initialData) : null;

  const row = insertReturning<TaskRow>(
    'INSERT INTO tasks (type, status, progress, result) VALUES (?, ?, ?, ?) RETURNING *',
    [type, 'pending', 0, result]
  );

  if (!row) {
    throw new Error('Failed to create task');
  }

  return rowToTask(row);
}

/**
 * Get a task by ID
 */
export function getTask(id: number): Task | null {
  const row = queryOne<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]);
  return row ? rowToTask(row) : null;
}

/**
 * Get all tasks with optional filtering
 */
export function getTasks(options: {
  type?: TaskType;
  status?: TaskStatus;
  statuses?: TaskStatus[];
  limit?: number;
  offset?: number;
} = {}): { tasks: Task[]; total: number } {
  let whereClause = 'WHERE 1=1';
  const params: unknown[] = [];

  if (options.type) {
    whereClause += ' AND type = ?';
    params.push(options.type);
  }

  if (options.statuses && options.statuses.length > 0) {
    const placeholders = options.statuses.map(() => '?').join(',');
    whereClause += ` AND status IN (${placeholders})`;
    params.push(...options.statuses);
  } else if (options.status) {
    whereClause += ' AND status = ?';
    params.push(options.status);
  }

  const countRow = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM tasks ${whereClause}`,
    params
  );
  const total = countRow?.count || 0;

  const limit = options.limit || 50;
  const offset = options.offset || 0;

  const rows = query<TaskRow>(
    `SELECT * FROM tasks ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    tasks: rows.map(rowToTask),
    total,
  };
}

/**
 * Get recent tasks (for dashboard)
 */
export function getRecentTasks(limit: number = 10): Task[] {
  const rows = query<TaskRow>(
    'SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?',
    [limit]
  );
  return rows.map(rowToTask);
}

/**
 * Get running tasks
 */
export function getRunningTasks(): Task[] {
  const rows = query<TaskRow>(
    "SELECT * FROM tasks WHERE status = 'running' ORDER BY created_at DESC",
    []
  );
  return rows.map(rowToTask);
}

/**
 * Update task progress
 */
export function updateTaskProgress(id: number, progress: number, total: number): void {
  execute(
    'UPDATE tasks SET progress = ?, total = ? WHERE id = ?',
    [progress, total, id]
  );
}

/**
 * Mark task as running
 */
export function startTask(id: number): void {
  execute(
    "UPDATE tasks SET status = 'running' WHERE id = ?",
    [id]
  );
}

/**
 * Mark task as completed
 */
export function completeTask(id: number, result: Record<string, unknown>): void {
  execute(
    "UPDATE tasks SET status = 'completed', result = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
    [JSON.stringify(result), id]
  );
  runningTasks.delete(id);
}

/**
 * Mark task as failed
 */
export function failTask(id: number, error: string): void {
  execute(
    "UPDATE tasks SET status = 'failed', error = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
    [error, id]
  );
  runningTasks.delete(id);
}

/**
 * Cancel a task
 */
export function cancelTask(id: number): boolean {
  const running = runningTasks.get(id);
  if (running) {
    running.cancel();
    runningTasks.delete(id);
  }

  execute(
    "UPDATE tasks SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('pending', 'running')",
    [id]
  );

  return true;
}

/**
 * Delete old completed/failed tasks
 */
export function cleanupOldTasks(olderThanDays: number = 7): number {
  const result = execute(
    "DELETE FROM tasks WHERE status IN ('completed', 'failed', 'cancelled') AND created_at < datetime('now', ?)",
    [`-${olderThanDays} days`]
  );
  return result.rowCount;
}

/**
 * Run a task in the background
 */
export async function runTask(taskId: number): Promise<void> {
  const task = getTask(taskId);
  if (!task) {
    log.error('Task not found', { taskId });
    throw new Error(`Task ${taskId} not found`);
  }

  const handler = taskHandlers.get(task.type);
  if (!handler) {
    log.error('No handler for task type', { taskId, type: task.type });
    failTask(taskId, `No handler registered for task type: ${task.type}`);
    return;
  }

  log.info('Starting task', { taskId, type: task.type });

  // Create abort controller for cancellation
  const abortController = new AbortController();
  runningTasks.set(taskId, {
    cancel: () => abortController.abort(),
  });

  startTask(taskId);

  try {
    const result = await handler(
      taskId,
      (current, total) => updateTaskProgress(taskId, current, total),
      abortController.signal
    );
    log.info('Task completed', { taskId, type: task.type });
    completeTask(taskId, result);
  } catch (error) {
    if (abortController.signal.aborted) {
      log.info('Task cancelled', { taskId });
      execute(
        "UPDATE tasks SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [taskId]
      );
    } else {
      const message = error instanceof Error ? error.message : 'Unknown error';

      // Check if it's a rate limit error - add to retry queue
      if (message.includes('429')) {
        log.info('Rate limited, adding to retry queue', { taskId, type: task.type });

        // Update task to pending with a note about queue position
        const queuePosition = retryQueue.length + 1;
        execute(
          "UPDATE tasks SET status = 'pending', error = ? WHERE id = ?",
          [`Rate limited - queued for retry (#${queuePosition})`, taskId]
        );
        runningTasks.delete(taskId);

        // Add to serial retry queue
        scheduleRetry(taskId);
      } else {
        log.error('Task failed', { taskId, type: task.type, error: message });
        failTask(taskId, message);
      }
    }
  }
}

/**
 * Create and immediately run a task
 */
export function enqueueTask(type: TaskType, initialData?: Record<string, unknown>): Task {
  const task = createTask(type, initialData);

  // Run in background (don't await)
  runTask(task.id).catch(err => {
    console.error(`Task ${task.id} failed:`, err);
  });

  return task;
}

/**
 * Retry a failed task - creates a new task with the same type and data
 */
export function retryTask(taskId: number): Task | null {
  const originalTask = getTask(taskId);
  if (!originalTask) {
    throw new Error(`Task ${taskId} not found`);
  }

  if (originalTask.status !== 'failed' && originalTask.status !== 'cancelled') {
    throw new Error(`Task ${taskId} is not failed or cancelled (status: ${originalTask.status})`);
  }

  // Get the original task data
  const taskData = originalTask.data || {};

  // Create and run a new task with the same type and data
  return enqueueTask(originalTask.type, taskData);
}

/**
 * Get task statistics
 */
export function getTaskStats(): {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
} {
  const stats = queryOne<{
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
  }>(`
    SELECT
      COUNT(*) as total,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending,
      COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0) as running,
      COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed,
      COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed
    FROM tasks
  `, []);

  return stats || { total: 0, pending: 0, running: 0, completed: 0, failed: 0 };
}

// Ensure handlers are registered on module load
let handlersRegistered = false;

export function ensureHandlersRegistered(): void {
  if (handlersRegistered) return;
  handlersRegistered = true;

  // Import and register handlers synchronously
  // Using require to avoid async import issues
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { registerAllHandlers } = require('./handlers');
    registerAllHandlers();
    log.info('Task handlers registered');
  } catch (err) {
    log.error('Failed to register task handlers', { error: err });
  }
}

// Auto-register handlers when module is imported
ensureHandlersRegistered();

export default {
  registerTaskHandler,
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
  runTask,
  enqueueTask,
  getTaskStats,
  ensureHandlersRegistered,
};
