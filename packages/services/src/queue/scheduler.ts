/**
 * Recurring jobs.
 *
 * Modelled on Kapowarr's `task_intervals` (GPL-3.0,
 * `backend/features/tasks.py`) — see NOTICE.md — but the claim is done in the
 * database rather than in a process-local singleton. Next.js can run several
 * server processes against one SQLite file, and an in-memory guard would let
 * each of them fire the same sweep.
 */

import { execute, getDb, query, queryOne } from '@shelvarr/db';

import { createLogger } from '../utils/logger';
import { enqueueTask, type TaskType } from './index';

const log = createLogger('scheduler');

const HOUR = 3600;

export interface ScheduleDefinition {
  name: string;
  taskType: TaskType;
  intervalSeconds: number;
  /** Shown in the settings UI. */
  description: string;
  payload?: Record<string, unknown>;
  /** Whether it runs unless switched off. */
  enabledByDefault: boolean;
}

/**
 * The jobs Shelvarr knows how to run on a timer.
 *
 * Metadata refresh is on by default because it's cheap and keeps issue lists
 * current. The GetComics sweep is off by default: it downloads things, and
 * that should be a decision, not a surprise.
 */
export const DEFAULT_SCHEDULES: ScheduleDefinition[] = [
  {
    name: 'comic_update_all',
    taskType: 'comic_update_all',
    intervalSeconds: 24 * HOUR,
    description: 'Refresh comic metadata from ComicVine',
    payload: { maxAgeHours: 24, limit: 25 },
    enabledByDefault: true,
  },
  {
    name: 'comic_resume',
    taskType: 'comic_resume',
    intervalSeconds: 15 * 60,
    description: 'Pick up comic downloads interrupted by a restart',
    // Longer than the longest rate-limit backoff, so a download waiting out a
    // host is not taken from the process already retrying it.
    payload: { staleMinutes: 30, limit: 25 },
    enabledByDefault: true,
  },
  {
    name: 'comic_search_all',
    taskType: 'comic_search_all',
    intervalSeconds: 24 * HOUR,
    description: 'Search GetComics for missing issues and download them',
    payload: { limit: 100 },
    enabledByDefault: false,
  },
  {
    name: 'auth_prune',
    taskType: 'auth_prune',
    intervalSeconds: 24 * HOUR,
    description: 'Remove expired sessions and sign-in links',
    enabledByDefault: true,
  },
];

export interface Schedule {
  name: string;
  taskType: TaskType;
  intervalSeconds: number;
  /** Unix seconds. */
  nextRun: number;
  lastRun: number | null;
  enabled: boolean;
  payload: Record<string, unknown> | null;
  /** From `DEFAULT_SCHEDULES`; empty for anything added by hand. */
  description: string;
}

interface ScheduleRow {
  name: string;
  task_type: string;
  interval_seconds: number;
  next_run: number;
  last_run: number | null;
  enabled: number;
  payload: string | null;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function rowToSchedule(row: ScheduleRow): Schedule {
  let payload: Record<string, unknown> | null = null;
  if (row.payload) {
    try {
      payload = JSON.parse(row.payload) as Record<string, unknown>;
    } catch {
      payload = null;
    }
  }

  return {
    name: row.name,
    taskType: row.task_type as TaskType,
    intervalSeconds: row.interval_seconds,
    nextRun: row.next_run,
    lastRun: row.last_run,
    enabled: row.enabled === 1,
    payload,
    description:
      DEFAULT_SCHEDULES.find((schedule) => schedule.name === row.name)?.description ?? '',
  };
}

/**
 * Create any missing schedule rows.
 *
 * Existing rows are left alone: the interval and enabled flag belong to the
 * user once they've touched them.
 */
export function ensureDefaultSchedules(): void {
  const now = nowSeconds();

  for (const schedule of DEFAULT_SCHEDULES) {
    execute(
      `INSERT INTO scheduled_tasks
         (name, task_type, interval_seconds, next_run, enabled, payload)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(name) DO NOTHING`,
      [
        schedule.name,
        schedule.taskType,
        schedule.intervalSeconds,
        now + schedule.intervalSeconds,
        schedule.enabledByDefault ? 1 : 0,
        schedule.payload ? JSON.stringify(schedule.payload) : null,
      ]
    );
  }
}

export function listSchedules(): Schedule[] {
  return query<ScheduleRow>('SELECT * FROM scheduled_tasks ORDER BY name ASC').map(rowToSchedule);
}

export function getSchedule(name: string): Schedule | null {
  const row = queryOne<ScheduleRow>('SELECT * FROM scheduled_tasks WHERE name = ?', [name]);
  return row ? rowToSchedule(row) : null;
}

/**
 * Change how often a job runs. The next run is rescheduled from now, so
 * shortening an interval doesn't fire immediately.
 */
export function setScheduleInterval(name: string, intervalSeconds: number): void {
  if (intervalSeconds < 60) {
    throw new Error('Interval must be at least 60 seconds');
  }
  execute(
    'UPDATE scheduled_tasks SET interval_seconds = ?, next_run = ? WHERE name = ?',
    [intervalSeconds, nowSeconds() + intervalSeconds, name]
  );
}

export function setScheduleEnabled(name: string, enabled: boolean): void {
  const schedule = getSchedule(name);
  if (!schedule) throw new Error(`No schedule named ${name}`);

  execute('UPDATE scheduled_tasks SET enabled = ?, next_run = ? WHERE name = ?', [
    enabled ? 1 : 0,
    // Re-enabling starts a fresh interval rather than firing straight away.
    enabled ? nowSeconds() + schedule.intervalSeconds : schedule.nextRun,
    name,
  ]);
}

/** Run a job now, without disturbing its schedule. */
export function runScheduleNow(name: string): number {
  const schedule = getSchedule(name);
  if (!schedule) throw new Error(`No schedule named ${name}`);

  const task = enqueueTask(schedule.taskType, schedule.payload ?? {});
  execute('UPDATE scheduled_tasks SET last_run = ? WHERE name = ?', [nowSeconds(), name]);
  return task.id;
}

/**
 * Claim every job that is due, moving each one's next run forward in the same
 * statement. Two processes ticking at once cannot both claim the same row.
 */
export function claimDueSchedules(now = nowSeconds()): Schedule[] {
  const rows = getDb()
    .prepare(
      `UPDATE scheduled_tasks
          SET next_run = ? + interval_seconds,
              last_run = ?
        WHERE enabled = 1 AND next_run <= ?
        RETURNING *`
    )
    .all(now, now, now) as ScheduleRow[];

  return rows.map(rowToSchedule);
}

/** Claim what's due and queue it. Returns the tasks that were started. */
export function runDueSchedules(): Array<{ name: string; taskId: number }> {
  const started: Array<{ name: string; taskId: number }> = [];

  for (const schedule of claimDueSchedules()) {
    try {
      const task = enqueueTask(schedule.taskType, schedule.payload ?? {});
      started.push({ name: schedule.name, taskId: task.id });
      log.info('Scheduled job started', { name: schedule.name, taskId: task.id });
    } catch (error) {
      log.error('Scheduled job failed to start', { name: schedule.name, error });
    }
  }

  return started;
}

/** How often the scheduler looks for due jobs. */
const TICK_MS = 60_000;

/**
 * `setInterval` is typed as returning a number under DOM lib and a `Timeout`
 * under Node's; this module is only ever run on the server, so take whichever
 * the ambient types give us.
 */
type IntervalHandle = ReturnType<typeof setInterval>;

let timer: IntervalHandle | null = null;

/**
 * Start ticking. Safe to call more than once — the second call is a no-op —
 * and safe to run in several processes, because claiming is atomic.
 */
export function startScheduler(options: { tickMs?: number } = {}): void {
  if (timer) return;

  ensureDefaultSchedules();

  const tick = () => {
    try {
      runDueSchedules();
    } catch (error) {
      log.error('Scheduler tick failed', { error });
    }
  };

  const handle = setInterval(tick, options.tickMs ?? TICK_MS);
  // Don't hold the process open; a CLI that imports this should still exit.
  (handle as { unref?: () => void }).unref?.();
  timer = handle;

  log.info('Scheduler started', { tickMs: options.tickMs ?? TICK_MS });
}

export function stopScheduler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  log.info('Scheduler stopped');
}

export function isSchedulerRunning(): boolean {
  return timer !== null;
}
