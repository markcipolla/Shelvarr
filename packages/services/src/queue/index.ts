/**
 * Background Job Queue Service
 * Manages async tasks like library scans, metadata fetches, and file reorganization
 */

import { query, queryOne, execute, insertReturning, sqlTimeToIso, isoToSqlTime } from '@shelvarr/db';
import { createLogger } from '../utils/logger';
import {
  SourceUnavailableError,
  clearExpiredSourceLimits,
  deferralDelay,
} from '../downloads/source-limits';
import { listenerCount, publish } from '../events/index';
import type { TaskEvent } from '../events/index';

const log = createLogger('queue');

export type TaskType = 'scan' | 'metadata' | 'book_metadata' | 'organize' | 'download' | 'author_sync'
  | 'book_scan_all' | 'book_organize_all' | 'book_resume' | 'book_search_all' | 'book_import'
  | 'comic_search' | 'comic_download' | 'comic_refresh' | 'comic_scan'
  | 'comic_rename' | 'comic_update_all' | 'comic_search_all'
  | 'comic_library_import' | 'comic_resume' | 'auth_prune' | 'source_health';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Task {
  id: number;
  type: TaskType;
  status: TaskStatus;
  progress: number;
  total: number | null;
  result: string | null;
  error: string | null;
  /** ISO-8601 instant, zone included — see `sqlTimeToIso`. */
  createdAt: string;
  /** ISO-8601 instant, zone included — see `sqlTimeToIso`. */
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
  not_before: string | null;
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
    createdAt: sqlTimeToIso(row.created_at),
    completedAt: sqlTimeToIso(row.completed_at),
    data,
  };
}

// In-memory queue for running tasks. The type is carried alongside the
// canceller so the live-event helpers can name the task without going back to
// the database on every progress tick.
const runningTasks = new Map<number, { cancel: () => void; type: TaskType }>();

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
 * Longest the processor sleeps in one go while waiting for the next entry to
 * come due. Waiting is sliced rather than slept through so that a task
 * deferred for hours — a spent daily quota, say — doesn't hold up a task
 * deferred for seconds that arrives behind it.
 */
const RETRY_POLL_SLICE_MS = 15_000;

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
 * Whether an error means "come back later" rather than "this failed", and if
 * so, how long "later" is.
 *
 * Three shapes, in descending order of how much the thrower knew:
 * `RateLimitedError` and the source-scoped errors behind `deferralDelay`
 * carry their own wait; `DownloadLimitReachedError` is matched by name rather
 * than by type, so the queue doesn't have to import the download clients that
 * raise it, and says only "Download limit reached for <host>" with no status
 * code to sniff for; anything else is a last-resort look for a 429 in the
 * message.
 */
function rateLimitDelay(error: unknown, message: string): number | null {
  if (error instanceof RateLimitedError) return error.retryAfterMs;
  // A whole source is spent, or is already busy with one download (E1-6).
  // Carries its own deadline, which can be hours rather than seconds.
  const sourceDelay = deferralDelay(error);
  if (sourceDelay !== null) return sourceDelay;
  if (error instanceof Error && error.name === 'DownloadLimitReachedError') {
    return RETRY_DELAY_MS;
  }
  return message.includes('429') ? RETRY_DELAY_MS : null;
}

/** Epoch ms -> the naked-UTC timestamp shape every other timestamp column uses. */
function msToSqlTime(ms: number): string | null {
  return isoToSqlTime(new Date(ms).toISOString());
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

  /** Which task the processor last said it was waiting on, so it says it once. */
  let waitingFor: number | null = null;

  while (retryQueue.length > 0) {
    // Whichever task is due soonest, without taking it off the queue yet.
    retryQueue.sort((a, b) => a.notBefore - b.notBefore);
    const soonest = retryQueue[0];
    if (!soonest) continue;

    // Wait in slices rather than sleeping the whole way to the deadline: a
    // source-level deferral (E1-6) can be hours out, and sleeping through it
    // with the entry already shifted off the queue would mean a task
    // deferred ten seconds from now sat behind it. Re-sorting each slice
    // lets a sooner arrival overtake a long wait.
    const wait = soonest.notBefore - Date.now();
    if (wait > 0) {
      if (waitingFor !== soonest.taskId) {
        waitingFor = soonest.taskId;
        log.info('Waiting before retry', { taskId: soonest.taskId, delayMs: wait });
      }
      await sleep(Math.min(wait, RETRY_POLL_SLICE_MS));
      continue;
    }

    waitingFor = null;
    const entry = retryQueue.shift();
    if (!entry) continue;

    // Check if task still exists and is pending
    const task = getTask(entry.taskId);
    if (!task || task.status !== 'pending') {
      log.info('Skipping retry - task no longer pending', {
        taskId: entry.taskId,
        status: task?.status,
      });
      // Given up on this entry: whatever moved the task off `pending` should
      // already have cleared `not_before` itself, but a manual status change
      // (a test, or a hand edit) wouldn't have — clear it here too so a later
      // `rebuildRetryQueueFromDatabase()` doesn't resurrect it.
      clearNotBefore(entry.taskId);
      continue;
    }

    log.info('Retrying rate-limited task', {
      taskId: entry.taskId,
      queueLength: retryQueue.length,
    });

    // The entry is about to be handed to `runTask`, which starts it running
    // (or calls `scheduleRetry` again if it hits another rate limit). Either
    // way this stale `not_before` must go now, so a restart in between
    // doesn't rebuild an entry that's already been picked up.
    clearNotBefore(entry.taskId);

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

/**
 * Clear the persisted retry marker on a task's row.
 *
 * Called everywhere the in-memory `retryQueue` drops an entry, so a task that
 * is no longer actually pending-for-retry can't be picked back up by a later
 * `rebuildRetryQueueFromDatabase()` call after a second restart.
 */
function clearNotBefore(taskId: number): void {
  execute('UPDATE tasks SET not_before = NULL WHERE id = ?', [taskId]);
}

/**
 * Forget a task's place in the retry queue.
 *
 * Used when something else takes the task over — a cancellation, or the user
 * asking for it to run now — so the processor doesn't come back to it later.
 */
function dropFromRetryQueue(taskId: number): void {
  const index = retryQueue.findIndex(entry => entry.taskId === taskId);
  if (index !== -1) {
    retryQueue.splice(index, 1);
  }
  clearNotBefore(taskId);
}

function scheduleRetry(taskId: number, delayMs: number = RETRY_DELAY_MS): void {
  const notBefore = Date.now() + delayMs;

  const existing = retryQueue.find(entry => entry.taskId === taskId);
  if (existing) {
    existing.notBefore = notBefore;
  } else {
    retryQueue.push({ taskId, notBefore });
    log.info('Task added to retry queue', { taskId, delayMs, queueLength: retryQueue.length });
  }

  // Persisted alongside the in-memory entry so a server restart can rebuild
  // the queue from the database instead of losing the task at `pending`
  // forever — see `rebuildRetryQueueFromDatabase`.
  execute('UPDATE tasks SET not_before = ? WHERE id = ?', [msToSqlTime(notBefore), taskId]);

  // Start processor if not running; it waits for the entry to come due itself.
  if (!retryProcessorRunning) {
    processRetryQueue().catch(err => {
      log.error('Retry processor error', { error: err });
      retryProcessorRunning = false;
    });
  }
}

/**
 * Rebuild the in-memory retry queue from what was persisted before a restart.
 *
 * `scheduleRetry` writes `not_before` onto a task's row as well as into the
 * in-memory `retryQueue`; the array doesn't survive a restart, but the column
 * does. Called once at boot (see `failOrphanedRunningTasks`, wired in the same
 * place), this reads every `pending` task that still carries a `not_before`
 * and re-queues it, so a rate-limited task left mid-backoff gets picked up
 * again instead of sitting at `pending` until a human notices.
 *
 * A `not_before` already in the past is clamped to "now" rather than skipped,
 * so an old backoff fires promptly instead of vanishing silently.
 *
 * Returns how many tasks were re-queued, for a log line.
 */
export function rebuildRetryQueueFromDatabase(): number {
  const rows = query<TaskRow>(
    "SELECT * FROM tasks WHERE status = 'pending' AND not_before IS NOT NULL",
    []
  );

  const now = Date.now();
  for (const row of rows) {
    const persisted = Date.parse(sqlTimeToIso(row.not_before!));
    const notBefore = Number.isNaN(persisted) ? now : Math.max(persisted, now);

    if (!retryQueue.some(entry => entry.taskId === row.id)) {
      retryQueue.push({ taskId: row.id, notBefore });
    }
  }

  if (rows.length > 0) {
    log.info('Rebuilt retry queue from database', { count: rows.length });
  }

  // Per-source deadlines (E1-6) survive a restart in their own table and are
  // read at the point of use, so there is nothing to rebuild — only spent
  // rows to tidy away, which is cheapest to do here, once, at boot.
  const expired = clearExpiredSourceLimits();
  if (expired > 0) log.info('Cleared expired source limits', { count: expired });

  if (retryQueue.length > 0 && !retryProcessorRunning) {
    processRetryQueue().catch(err => {
      log.error('Retry processor error', { error: err });
      retryProcessorRunning = false;
    });
  }

  return rows.length;
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

  const task = rowToTask(row);
  emitTaskChange('created', task.id);
  return task;
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
 * Tell anything watching the live stream that a task changed.
 *
 * The row is read back after the update rather than assembled from the
 * arguments, so a page is told the status the database actually holds — which
 * matters for the updates that are conditional, like cancelling a task that
 * finished a moment earlier. These fire on status changes only, so the extra
 * read is a handful per task rather than one per tick.
 */
function emitTaskChange(event: Exclude<TaskEvent['event'], 'progress'>, id: number): void {
  if (listenerCount() === 0) return;

  const task = getTask(id);
  if (!task) return;

  publish({
    kind: 'task',
    event,
    id,
    taskType: task.type,
    status: task.status,
    progress: task.progress,
    total: task.total,
    error: task.error,
  });
}

/**
 * The same, for progress, which is the one that fires in a hot loop.
 *
 * The counts are already in hand and the type comes from `runningTasks`, so a
 * tick costs nothing but a map lookup. A task progressing outside a tracked
 * run has no type to report and is skipped: the bus coalesces these anyway,
 * and the status change that follows carries the final numbers.
 */
function emitTaskProgress(id: number, progress: number, total: number): void {
  if (listenerCount() === 0) return;

  const type = runningTasks.get(id)?.type;
  if (!type) return;

  publish({
    kind: 'task',
    event: 'progress',
    id,
    taskType: type,
    status: 'running',
    progress,
    total,
  });
}

/**
 * Update task progress
 */
export function updateTaskProgress(id: number, progress: number, total: number): void {
  execute(
    'UPDATE tasks SET progress = ?, total = ? WHERE id = ?',
    [progress, total, id]
  );
  emitTaskProgress(id, progress, total);
}

/**
 * Mark task as running
 */
export function startTask(id: number): void {
  execute(
    "UPDATE tasks SET status = 'running' WHERE id = ?",
    [id]
  );
  emitTaskChange('started', id);
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
  emitTaskChange('completed', id);
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
  emitTaskChange('failed', id);
}

/**
 * Fail every task still marked `running`.
 *
 * Nothing reconciles a `running` row when the process dies mid-task — the
 * in-memory `runningTasks` map that would otherwise know to clean it up dies
 * with it. Left alone, the task sits at `running` forever: `isRetriable`
 * refuses to retry a running task, so it can never be picked up from the UI
 * either. Called once at boot, before the scheduler starts, so a task this
 * marks failed cannot race a freshly scheduled run of the same kind.
 *
 * Returns how many tasks were failed, for a log line.
 */
export function failOrphanedRunningTasks(): number {
  const orphaned = query<TaskRow>("SELECT * FROM tasks WHERE status = 'running'", []);
  for (const row of orphaned) {
    failTask(row.id, 'Interrupted by a server restart');
  }
  return orphaned.length;
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

  dropFromRetryQueue(id);

  execute(
    "UPDATE tasks SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('pending', 'running')",
    [id]
  );

  emitTaskChange('cancelled', id);

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

  // A task can be started from more than one place at once — the retry
  // processor and a person pressing "Retry now", say. Starting it twice would
  // run the handler twice, which for a download means fetching the file twice.
  if (runningTasks.has(taskId)) {
    log.info('Task already running, ignoring duplicate start', { taskId });
    return;
  }

  // Register the abort controller before anything is awaited. Handler loading
  // is asynchronous, and a cancel that arrives during it would otherwise find
  // nothing to cancel and be silently ignored.
  const abortController = new AbortController();
  runningTasks.set(taskId, {
    cancel: () => abortController.abort(),
    type: task.type,
  });

  try {
    await ensureHandlersRegistered();
  } catch (err) {
    // Leaving the task registered as running would make it permanently
    // unstartable, since a start is now refused while one is in flight.
    runningTasks.delete(taskId);
    throw err;
  }

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
      runningTasks.delete(taskId);
      emitTaskChange('cancelled', taskId);
    } else {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const retryAfterMs = rateLimitDelay(error, message);

      // Check if it's a rate limit error - add to retry queue
      if (retryAfterMs !== null) {
        log.info('Rate limited, adding to retry queue', { taskId, type: task.type, retryAfterMs });

        // Update task to pending with a note about queue position. A
        // source-scoped deferral says which source and for how long, which is
        // the difference between "stuck" and "waiting" to someone reading the
        // tasks page; the "queued for retry (#n)" part stays in the string
        // either way, because that is what the page parses a position out of.
        const queuePosition = retryQueue.length + 1;
        const reason = error instanceof SourceUnavailableError ? `: ${error.message}` : '';
        execute(
          "UPDATE tasks SET status = 'pending', error = ? WHERE id = ?",
          [`Rate limited - queued for retry (#${queuePosition})${reason}`, taskId]
        );
        runningTasks.delete(taskId);
        emitTaskChange('deferred', taskId);

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
 * Whether a task can be started again by hand.
 *
 * Failed and cancelled tasks obviously can. So can a pending task that
 * carries an error: it has already run once and been put back to pending by
 * the rate-limit retry queue. That queue lives in memory, so a restart loses
 * it and leaves the task pending forever with nothing due to pick it up —
 * being able to kick it off again is the only way out.
 *
 * A pending task with no error has never run: it is either about to, or is
 * sitting in the retry queue's initial state, and starting it by hand would
 * only race whatever is already going to start it.
 */
export function isRetriable(task: Task): boolean {
  if (task.status === 'failed' || task.status === 'cancelled') return true;
  return task.status === 'pending' && task.error !== null;
}

/**
 * Run a task again.
 *
 * A failed or cancelled task is re-run as a fresh task, leaving the original
 * as a record of what happened. A pending task is still the one the user is
 * waiting on, so it is re-run where it stands — duplicating it would leave
 * two of the same download in the queue.
 */
export function retryTask(taskId: number): Task | null {
  const originalTask = getTask(taskId);
  if (!originalTask) {
    throw new Error(`Task ${taskId} not found`);
  }

  if (!isRetriable(originalTask)) {
    throw new Error(`Task ${taskId} cannot be retried (status: ${originalTask.status})`);
  }

  if (originalTask.status === 'pending') {
    // Take it off the retry queue first so the processor doesn't also run it.
    dropFromRetryQueue(taskId);
    execute('UPDATE tasks SET error = NULL WHERE id = ?', [taskId]);
    emitTaskChange('created', taskId);

    runTask(taskId).catch(err => {
      log.error('Manual retry failed', { taskId, error: err });
    });

    return getTask(taskId);
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
  failOrphanedRunningTasks,
  rebuildRetryQueueFromDatabase,
  cancelTask,
  cleanupOldTasks,
  runTask,
  enqueueTask,
  getTaskStats,
  ensureHandlersRegistered,
};
