/**
 * Read-only answers to "what is this server doing, and what has it been
 * doing?" — the data behind the admin API and its MCP endpoint.
 *
 * Everything here reads; nothing here changes anything. That is deliberate:
 * an assistant pointed at a running library should be able to diagnose it
 * without being able to break it.
 */

import { statSync } from 'fs';

import { getSetting, query, queryOne } from '@shelvarr/db';

import { APP_NAME, APP_VERSION } from '../constants';
import { getServiceConfig } from '../config';
import { isAuthEnabled, isEmailConfigured } from '../auth/config';
import { countAdmins, countUsers } from '../auth/users';
import * as queue from '../queue/index';
import * as scheduler from '../queue/scheduler';
import {
  getLogBufferStats,
  readLogBuffer,
  type BufferedLogEntry,
  type LogLevel,
} from '../utils/logger';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface LogQuery {
  /** Drop anything below this level. Defaults to everything buffered. */
  minLevel?: LogLevel;
  /** Only lines from this logger, e.g. "scheduler". Case-insensitive substring. */
  context?: string;
  /** Case-insensitive substring, matched against the message and its data. */
  search?: string;
  /** Only lines at or after this ISO timestamp. */
  since?: string;
  /** Only lines after this sequence number, for polling without re-reading. */
  afterSequence?: number;
  /** How many of the most recent matches to return. Defaults to 100. */
  limit?: number;
}

export interface LogQueryResult {
  entries: BufferedLogEntry[];
  /** Matches before `limit` was applied. */
  matched: number;
  buffer: ReturnType<typeof getLogBufferStats>;
  /** Set when the buffer has already evicted lines older than the window asked for. */
  truncated: boolean;
}

const DEFAULT_LOG_LIMIT = 100;
const MAX_LOG_LIMIT = 1000;

function clampLimit(limit: number | undefined, fallback: number, max: number): number {
  if (limit === undefined || !Number.isFinite(limit)) return fallback;
  return Math.max(1, Math.min(Math.floor(limit), max));
}

/**
 * The most recent buffered lines matching a filter, oldest first.
 *
 * Oldest-first because that is how logs read: a caller wanting the last 50
 * lines gets the last 50 in the order they happened.
 */
export function searchLogs(options: LogQuery = {}): LogQueryResult {
  const all = readLogBuffer();
  const minRank = options.minLevel ? LEVEL_ORDER[options.minLevel] : -1;
  const context = options.context?.toLowerCase();
  const search = options.search?.toLowerCase();
  const since = options.since ? Date.parse(options.since) : Number.NaN;

  const matches = all.filter((entry) => {
    if (minRank >= 0 && LEVEL_ORDER[entry.level] < minRank) return false;
    if (context && !(entry.context ?? '').toLowerCase().includes(context)) return false;
    if (options.afterSequence !== undefined && entry.sequence <= options.afterSequence) return false;
    if (!Number.isNaN(since) && Date.parse(entry.timestamp) < since) return false;
    if (search) {
      const haystack = `${entry.message} ${entry.data ?? ''}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const limit = clampLimit(options.limit, DEFAULT_LOG_LIMIT, MAX_LOG_LIMIT);
  const buffer = getLogBufferStats();

  return {
    entries: matches.slice(-limit),
    matched: matches.length,
    buffer,
    // The oldest line still held is not line zero, so anything asked for
    // before it is simply gone rather than absent.
    truncated: buffer.recorded > buffer.buffered,
  };
}

function count(sql: string, params: unknown[] = []): number {
  return queryOne<{ count: number }>(sql, params)?.count ?? 0;
}

/** `{ queued: 3, failed: 1 }` for a status/state column, skipping empty groups. */
function countByGroup(sql: string): Record<string, number> {
  const rows = query<{ label: string | null; count: number }>(sql, []);
  const out: Record<string, number> = {};
  for (const row of rows) out[row.label ?? 'unknown'] = row.count;
  return out;
}

export interface LibraryCounts {
  libraries: number;
  books: number;
  booksWithMetadata: number;
  booksMissingMetadata: number;
  series: number;
  authors: number;
  comicVolumes: number;
  comicIssues: number;
  comicFiles: number;
  wantedBooks: Record<string, number>;
}

function getLibraryCounts(): LibraryCounts {
  return {
    libraries: count('SELECT COUNT(*) as count FROM libraries'),
    books: count('SELECT COUNT(*) as count FROM books WHERE deleted_at IS NULL'),
    booksWithMetadata: count(
      'SELECT COUNT(*) as count FROM books WHERE deleted_at IS NULL AND metadata_source IS NOT NULL'
    ),
    booksMissingMetadata: count(
      'SELECT COUNT(*) as count FROM books WHERE deleted_at IS NULL AND metadata_source IS NULL'
    ),
    series: count('SELECT COUNT(*) as count FROM series'),
    authors: count('SELECT COUNT(*) as count FROM authors'),
    comicVolumes: count('SELECT COUNT(*) as count FROM comics WHERE deleted_at IS NULL'),
    comicIssues: count('SELECT COUNT(*) as count FROM comic_issues WHERE deleted_at IS NULL'),
    comicFiles: count('SELECT COUNT(*) as count FROM comic_files'),
    wantedBooks: countByGroup(
      'SELECT status as label, COUNT(*) as count FROM wanted_books GROUP BY status'
    ),
  };
}

export interface DownloadCounts {
  /** Comic acquisition queue, by state: queued, downloading, importing, … */
  comics: Record<string, number>;
  /** Book download queue, by status. */
  books: Record<string, number>;
  /** Comic downloads that have stopped without reaching a terminal state. */
  comicsStalled: number;
}

/** A non-terminal comic download whose heartbeat has gone this cold is stuck. */
const STALLED_DOWNLOAD_SECONDS = 300;

function getDownloadCounts(): DownloadCounts {
  return {
    comics: countByGroup(
      'SELECT state as label, COUNT(*) as count FROM comic_downloads GROUP BY state'
    ),
    books: countByGroup(
      'SELECT status as label, COUNT(*) as count FROM downloads GROUP BY status'
    ),
    comicsStalled: count(
      `SELECT COUNT(*) as count FROM comic_downloads
        WHERE state IN ('queued', 'downloading', 'importing')
          AND heartbeat_at IS NOT NULL
          AND heartbeat_at < datetime('now', ?)`,
      [`-${STALLED_DOWNLOAD_SECONDS} seconds`]
    ),
  };
}

function getDatabaseInfo(): { path: string; sizeBytes: number | null } {
  const path = getServiceConfig().dbPath;
  try {
    return { path, sizeBytes: statSync(path).size };
  } catch {
    // In-memory databases and a path we cannot stat both land here.
    return { path, sizeBytes: null };
  }
}

export interface SystemStatus {
  app: {
    name: string;
    version: string;
    build: string;
    env: string;
    nodeVersion: string;
    platform: string;
    uptimeSeconds: number;
    startedAt: string;
    now: string;
  };
  database: { path: string; sizeBytes: number | null };
  library: LibraryCounts;
  tasks: {
    stats: ReturnType<typeof queue.getTaskStats>;
    running: queue.Task[];
    recentFailures: queue.Task[];
  };
  scheduler: {
    running: boolean;
    schedules: Array<{
      name: string;
      description: string;
      enabled: boolean;
      intervalSeconds: number;
      lastRun: string | null;
      nextRun: string | null;
    }>;
  };
  downloads: DownloadCounts;
  integrations: {
    hardcover: boolean;
    comicvine: boolean;
    email: boolean;
    auth: { enabled: boolean; users: number; admins: number };
  };
  logs: ReturnType<typeof getLogBufferStats>;
}

/** Epoch seconds to ISO, for the scheduler's integer timestamps. */
function secondsToIso(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined) return null;
  return new Date(seconds * 1000).toISOString();
}

export function getSystemStatus(): SystemStatus {
  const uptimeSeconds = Math.round(process.uptime());
  const now = new Date();

  return {
    app: {
      name: APP_NAME,
      version: APP_VERSION,
      build: process.env['NEXT_PUBLIC_BUILD_VERSION'] || 'dev',
      env: process.env['NODE_ENV'] || 'development',
      nodeVersion: process.version,
      platform: `${process.platform}/${process.arch}`,
      uptimeSeconds,
      startedAt: new Date(now.getTime() - uptimeSeconds * 1000).toISOString(),
      now: now.toISOString(),
    },
    database: getDatabaseInfo(),
    library: getLibraryCounts(),
    tasks: {
      stats: queue.getTaskStats(),
      running: queue.getRunningTasks(),
      recentFailures: queue.getTasks({ status: 'failed', limit: 5 }).tasks,
    },
    scheduler: {
      running: scheduler.isSchedulerRunning(),
      schedules: scheduler.listSchedules().map((schedule) => ({
        name: schedule.name,
        description: schedule.description,
        enabled: schedule.enabled,
        intervalSeconds: schedule.intervalSeconds,
        lastRun: secondsToIso(schedule.lastRun),
        nextRun: secondsToIso(schedule.nextRun),
      })),
    },
    downloads: getDownloadCounts(),
    integrations: {
      hardcover: Boolean(
        getServiceConfig().hardcoverToken || process.env['HARDCOVER_API_TOKEN']
      ),
      comicvine: Boolean(comicVineKey()),
      email: isEmailConfigured(),
      auth: {
        enabled: isAuthEnabled(),
        users: safeCount(countUsers),
        admins: safeCount(countAdmins),
      },
    },
    logs: getLogBufferStats(),
  };
}

/** The ComicVine key, read directly so this stays free of the comics stack. */
function comicVineKey(): string | null {
  return getSetting<string>('comicvine_api_key', null) || process.env['COMICVINE_API_KEY'] || null;
}

/** A count that must not take the whole status response down with it. */
function safeCount(fn: () => number): number {
  try {
    return fn();
  } catch {
    return 0;
  }
}

export interface TaskQuery {
  status?: queue.TaskStatus;
  type?: queue.TaskType;
  limit?: number;
}

const DEFAULT_TASK_LIMIT = 25;
const MAX_TASK_LIMIT = 200;

export function listTasks(options: TaskQuery = {}): { tasks: queue.Task[]; total: number } {
  return queue.getTasks({
    ...(options.status ? { status: options.status } : {}),
    ...(options.type ? { type: options.type } : {}),
    limit: clampLimit(options.limit, DEFAULT_TASK_LIMIT, MAX_TASK_LIMIT),
  });
}

export function getTask(id: number): queue.Task | null {
  return queue.getTask(id);
}

/** The comic acquisition queue, newest first — the usual "why is nothing downloading?". */
export function listComicDownloads(options: { state?: string; limit?: number } = {}) {
  const limit = clampLimit(options.limit, DEFAULT_TASK_LIMIT, MAX_TASK_LIMIT);
  const where = options.state ? 'WHERE cd.state = ?' : '';
  const params = options.state ? [options.state, limit] : [limit];

  return query(
    `SELECT cd.id, cd.volume_id AS volumeId, c.title AS volumeTitle, cd.issue_id AS issueId,
            cd.host, cd.state, cd.progress, cd.size, cd.attempts, cd.error,
            cd.web_title AS webTitle, cd.heartbeat_at AS heartbeatAt,
            cd.created_at AS createdAt, cd.completed_at AS completedAt
       FROM comic_downloads cd
       LEFT JOIN comics c ON c.id = cd.volume_id
       ${where}
       ORDER BY cd.created_at DESC
       LIMIT ?`,
    params
  );
}
