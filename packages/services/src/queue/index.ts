/**
 * Background Job Queue Service
 * Manages async tasks like library scans, metadata fetches, and file reorganization
 */

import { query, queryOne, execute, insertReturning } from '@shelvarr/db';
import { createLogger } from '../utils/logger';

const log = createLogger('queue');

export type TaskType = 'scan' | 'metadata' | 'book_metadata' | 'organize' | 'download' | 'author_sync' | 'comic_search' | 'comic_download' | 'comic_refresh' | 'comic_scan'
  | 'comic_rename' | 'comic_update_all' | 'comic_search_all'
  | 'comic_library_import' | 'comic_adopt' | 'comic_resume' | 'auth_prune';
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
interface RetryEntry {
  taskId: number;
  /** Epoch ms before which this task should not be retried. */
  notBefore: number;
}

const retryQueue: RetryEntry[] = [];
let retryProcessorRunning = false;
const RETRY_DELAY_MS = 10000; // 10 seconds between retries

/**
 * A rate limit the handler wants waited out for a specific length of time.
 *
 * Handlers that know what they hit — a host's download limit, say, which is
 * measured in minutes rather than seconds — throw this instead of a plain
 * error so the retry is spaced sensibly rather than hammering the host.
 */
export class RateLimitedError extends Error {
  constructor(message: string, readonly retryAfterMs: number = RETRY_DELAY_MS) {
    super(message);
    this.name = 'RateLimitedError';
  }
}

/**
 * Whether an error means "come back later" rather than "this failed".
 *
 * Matched by name rather than by type so the queue doesn't have to import the
 * download clients that raise them: `DownloadLimitReachedError` says only
 * "Download limit reached for <host>", with no status code to sniff for.
 */
function rateLimitDelay(error: unknown, message: string): number | null {
  if (error instanceof RateLimitedError) return error.retryAfterMs;
  if (error instanceof Error && error.name === 'DownloadLimitReachedError') {
    return RETRY_DELAY_MS;
  }
  return message.includes('429') ? RETRY_DELAY_MS : null;
}

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    // A retry that is minutes away shouldn't be the reason the process stays
    // alive; it still fires for as long as the server is running. Node hands
    // back a Timeout object here; the DOM typings say number, hence the cast.
    (timer as unknown as { unref?: () => void }).unref?.();
  });

async function processRetryQueue(): Promise<void> {
  if (retryProcessorRunning) return;
  retryProcessorRunning = true;

  while (retryQueue.length > 0) {
    // Take whichever task is due soonest, waiting for it if it isn't due yet.
    retryQueue.sort((a, b) => a.notBefore - b.notBefore);
    const entry = retryQueue.shift();
    if (!entry) continue;

    const wait = entry.notBefore - Date.now();
    if (wait > 0) {
      log.info('Waiting before retry', { taskId: entry.taskId, delayMs: wait });
      await sleep(wait);
    }

    // Check if task still exists and is pending
    const task = getTask(entry.taskId);
    if (!task || task.status !== 'pending') {
      log.info('Skipping retry - task no longer pending', {
        taskId: entry.taskId,
        status: task?.status,
      });
      continue;
    }

    log.info('Retrying rate-limited task', {
      taskId: entry.taskId,
      queueLength: retryQueue.length,
    });

    try {
      await runTask(entry.taskId);
    } catch (err) {
      log.error('Retry failed', { taskId: entry.taskId, error: err });
    }

    // Wait before processing next task (even if successful, to avoid rate limits)
    if (retryQueue.length > 0) {
      log.info('Waiting before next retry', { delayMs: RETRY_DELAY_MS, remaining: retryQueue.length });
      await sleep(RETRY_DELAY_MS);
    }
  }

  retryProcessorRunning = false;
}

function scheduleRetry(taskId: number, delayMs: number = RETRY_DELAY_MS): void {
  const existing = retryQueue.find(entry => entry.taskId === taskId);
  if (existing) {
    existing.notBefore = Date.now() + delayMs;
  } else {
    retryQueue.push({ taskId, notBefore: Date.now() + delayMs });
    log.info('Task added to retry queue', { taskId, delayMs, queueLength: retryQueue.length });
  }

  // Start processor if not running; it waits for the entry to come due itself.
  if (!retryProcessorRunning) {
    processRetryQueue().catch(err => {
      log.error('Retry processor error', { error: err });
      retryProcessorRunning = false;
    });
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
 * True while the built-in handlers are being installed.
 *
 * The bootstrap fills in handlers that nobody has provided; it must not
 * replace one a caller registered deliberately. Registration is lazy, so
 * without this a caller that registers its own handler after import — a test,
 * typically — would silently lose it the first time a task ran.
 */
let installingDefaults = false;

/**
 * Register a handler for a task type. A later call replaces an earlier one.
 */
export function registerTaskHandler(type: TaskType, handler: TaskHandler): void {
  if (installingDefaults && taskHandlers.has(type)) return;
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

  // Register the abort controller before anything is awaited. Handler loading
  // is asynchronous, and a cancel that arrives during it would otherwise find
  // nothing to cancel and be silently ignored.
  const abortController = new AbortController();
  runningTasks.set(taskId, {
    cancel: () => abortController.abort(),
  });

  await ensureHandlersRegistered();

  const handler = taskHandlers.get(task.type);
  if (!handler) {
    log.error('No handler for task type', { taskId, type: task.type });
    runningTasks.delete(taskId);
    failTask(taskId, `No handler registered for task type: ${task.type}`);
    return;
  }

  log.info('Starting task', { taskId, type: task.type });

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
      const retryAfterMs = rateLimitDelay(error, message);

      // Check if it's a rate limit error - add to retry queue
      if (retryAfterMs !== null) {
        log.info('Rate limited, adding to retry queue', { taskId, type: task.type, retryAfterMs });

        // Update task to pending with a note about queue position
        const queuePosition = retryQueue.length + 1;
        execute(
          "UPDATE tasks SET status = 'pending', error = ? WHERE id = ?",
          [`Rate limited - queued for retry (#${queuePosition})`, taskId]
        );
        runningTasks.delete(taskId);

        // Add to serial retry queue
        scheduleRetry(taskId, retryAfterMs);
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

// Handler registration
//
// `handlers.ts` imports this module, so it cannot be imported at the top
// level here. It is pulled in lazily instead, via a dynamic import that works
// under a bundler and under plain ESM alike — a `require()` here only worked
// inside Next's webpack build and threw everywhere else (CLI scripts, the
// migration tool).
let handlersRegistered = false;
let handlerRegistration: Promise<void> | null = null;

export function ensureHandlersRegistered(): Promise<void> {
  if (handlersRegistered) return Promise.resolve();

  handlerRegistration ??= import('./handlers')
    .then(({ registerAllHandlers }) => {
      installingDefaults = true;
      try {
        registerAllHandlers();
      } finally {
        installingDefaults = false;
      }
      handlersRegistered = true;
      log.info('Task handlers registered');
    })
    .catch((err) => {
      // Let the next call try again rather than wedging the queue.
      handlerRegistration = null;
      log.error('Failed to register task handlers', { error: err });
      throw err;
    });

  return handlerRegistration;
}

// Kick registration off at import time. Anything that actually runs a task
// awaits it, so this is a warm-up rather than a requirement.
void ensureHandlersRegistered().catch(() => {
  // Already logged; `runTask` surfaces it properly if a task is run.
});

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
