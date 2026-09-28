/**
 * Per-source download limits: one place that knows a source is spent, how
 * long for, and that only one download may be talking to it at a time (E1-6).
 *
 * The queue already knew how to wait out a limit *per task* — `RateLimitedError`
 * and `scheduleRetry` in `queue/index.ts`, and the comic downloader's
 * `DownloadLimitReachedError` backoff. That is the right shape for a host
 * that is briefly busy, and the wrong shape for a daily quota: Z-Library's
 * free tier allows a handful of downloads a day and Anna's free tier is a
 * waitlist with a countdown, so ten queued books would each run, each hit the
 * same spent quota, and each start its own private backoff — ten pointless
 * requests, ten deferred tasks, and a host with every reason to block us.
 *
 * What is recorded here is therefore about the *source*, not the task:
 *
 * - **A deadline** (`recordSourceLimit`), which every download from that
 *   source respects before it fetches anything (`assertSourceAvailable`).
 *   The first book to hit the quota is the only one that spends a request on
 *   it; the rest defer straight away.
 * - **A concurrency cap of one** (`runWithSourceSlot`). These hosts punish
 *   parallelism, and two downloads racing a shared quota is how a limit gets
 *   hit in the first place. A download that finds the slot taken defers
 *   rather than queueing behind it, so it isn't holding a task at `running`
 *   for however long the transfer ahead of it takes.
 * - **A minimum gap between requests** (`paceSource`, from `utils/pacing.ts`).
 *
 * The deadline lives in the `source_limits` table rather than in memory, for
 * the same reason E6-2 moved the retry queue's `not_before` onto the task row:
 * a restart in the middle of a 12-hour wait must not hand the whole queue
 * back its spent quota. Nothing has to be rebuilt at boot — the deadline is
 * read from the database at the point of use — so a restart is simply
 * invisible to it.
 */

import { execute, query, queryOne, sqlTimeToIso, isoToSqlTime } from '@shelvarr/db';
import { createLogger } from '../utils/logger';
import { paceSource } from '../utils/pacing';

const log = createLogger('source-limits');

/**
 * A source Shelvarr downloads from. Typed loosely on purpose: the table is
 * keyed by name, and a source with no policy of its own gets the defaults
 * below rather than being a compile error.
 */
export type DownloadSource = 'libgen' | 'annas' | 'zlibrary' | 'getcomics';

/** Human-readable name for a source, for error messages and blocklist entries. */
export function sourceLabel(source: string): string {
  switch (source) {
    case 'libgen': return 'LibGen';
    case 'annas': return "Anna's Archive";
    case 'zlibrary': return 'Z-Library';
    case 'getcomics': return 'GetComics';
    default: return source;
  }
}

/** Nothing is ever deferred for longer than this, however long the host asks for. */
export const MAX_SOURCE_LIMIT_MS = 24 * 60 * 60 * 1000;

/** How long a download that found the source's single slot taken waits before looking again. */
export const SOURCE_BUSY_RETRY_MS = 30_000;

interface SourcePolicy {
  /** Minimum gap between requests to this source, across the whole queue. */
  paceMs: number;
  /**
   * Whether a limit from this source is an account-wide daily quota. A quota
   * is spent for everything — every mirror, every book — so there is no point
   * trying another link, and the wait is until the quota resets rather than a
   * few minutes. A plain busy host (LibGen, GetComics) is neither.
   */
  dailyQuota: boolean;
  /** Fallback wait when the host doesn't say, and isn't a daily quota. */
  defaultLimitMs: number;
}

const DEFAULT_POLICY: SourcePolicy = { paceMs: 2_000, dailyQuota: false, defaultLimitMs: 5 * 60_000 };

const POLICIES: Record<string, SourcePolicy> = {
  libgen: { paceMs: 2_000, dailyQuota: false, defaultLimitMs: 5 * 60_000 },
  annas: { paceMs: 5_000, dailyQuota: true, defaultLimitMs: 60 * 60_000 },
  zlibrary: { paceMs: 5_000, dailyQuota: true, defaultLimitMs: 60 * 60_000 },
  getcomics: { paceMs: 2_000, dailyQuota: false, defaultLimitMs: 60_000 },
};

export function sourcePolicy(source: string): SourcePolicy {
  return POLICIES[source] ?? DEFAULT_POLICY;
}

/**
 * How long until the next UTC midnight.
 *
 * Both free tiers this card exists for are day-scoped, and neither says when
 * its day rolls over, so a limit with no `Retry-After` on it is waited out
 * until the next UTC midnight rather than for an arbitrary number of hours.
 */
export function msUntilDailyReset(now: number = Date.now()): number {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.getTime() - now;
}

/** How long to defer `source` for when the host hasn't told us. */
export function defaultLimitMs(source: string, now: number = Date.now()): number {
  const policy = sourcePolicy(source);
  return policy.dailyQuota ? msUntilDailyReset(now) : policy.defaultLimitMs;
}

/**
 * Base for the two "come back later" errors this module raises.
 *
 * The queue defers a task that fails with either of these — status back to
 * `pending`, `not_before` set, partial file left alone — rather than failing
 * it. `deferralDelay` below is what the queue actually calls, so it doesn't
 * need to know which of the two it got.
 */
export abstract class SourceUnavailableError extends Error {
  constructor(readonly source: string, readonly retryAfterMs: number, message: string) {
    super(message);
    this.name = 'SourceUnavailableError';
  }
}

/**
 * The source's limit is spent: a daily quota, a waitlist countdown, a 429.
 *
 * Distinct from `DownloadLimitReachedError`, which says one *link* was
 * refused. This says the source itself is closed for now, so nothing else
 * from it should be attempted either.
 */
export class SourceLimitReachedError extends SourceUnavailableError {
  constructor(source: string, retryAfterMs: number, message?: string) {
    super(
      source,
      retryAfterMs,
      message ?? `${sourceLabel(source)} download limit reached — waiting ${describeWait(retryAfterMs)}`
    );
    this.name = 'SourceLimitReachedError';
  }
}

/** Another download from this source is already in flight, and one at a time is the rule. */
export class SourceBusyError extends SourceUnavailableError {
  constructor(source: string, retryAfterMs: number = SOURCE_BUSY_RETRY_MS) {
    super(source, retryAfterMs, `Another ${sourceLabel(source)} download is already running`);
    this.name = 'SourceBusyError';
  }
}

/** "3 min", "2 h" — for error messages a person reads in the queue. */
export function describeWait(ms: number): string {
  if (ms < 90_000) return `${Math.max(1, Math.round(ms / 1000))} s`;
  if (ms < 90 * 60_000) return `${Math.round(ms / 60_000)} min`;
  return `${Math.round(ms / 3_600_000)} h`;
}

/**
 * How long the queue should defer a task that failed with `error`, or null if
 * this isn't a deferrable failure at all.
 */
export function deferralDelay(error: unknown): number | null {
  return error instanceof SourceUnavailableError ? error.retryAfterMs : null;
}

/** Epoch ms -> the naked-UTC timestamp shape every other timestamp column uses. */
function msToSqlTime(ms: number): string | null {
  return isoToSqlTime(new Date(ms).toISOString());
}

export interface SourceLimit {
  source: string;
  /** ISO-8601 instant, zone included — see `sqlTimeToIso`. */
  retryAfter: string;
  /** Milliseconds from now until the deadline; never negative. */
  retryAfterMs: number;
  reason: string | null;
}

interface SourceLimitRow {
  source: string;
  retry_after: string;
  reason: string | null;
  recorded_at: string | null;
}

/**
 * Record that `source` is spent until `retryAfterMs` from now.
 *
 * A limit that is already recorded further out is left alone: a second book
 * hitting the same quota shouldn't shorten the wait the first one established
 * (nor should a 30-second mirror hiccup shorten a 12-hour daily reset).
 *
 * Returns the deadline actually in force, as epoch ms.
 */
export function recordSourceLimit(source: string, retryAfterMs: number, reason?: string): number {
  const now = Date.now();
  const clamped = Math.min(Math.max(retryAfterMs, 0), MAX_SOURCE_LIMIT_MS);
  const deadline = now + clamped;

  const existing = getSourceLimit(source);
  if (existing && now + existing.retryAfterMs >= deadline) {
    return now + existing.retryAfterMs;
  }

  execute(
    `INSERT INTO source_limits (source, retry_after, reason, recorded_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(source) DO UPDATE SET
       retry_after = excluded.retry_after,
       reason = excluded.reason,
       recorded_at = CURRENT_TIMESTAMP`,
    [source, msToSqlTime(deadline), reason ?? null]
  );

  log.info('Source limit recorded', {
    source,
    retryAfterMs: clamped,
    retryAfter: new Date(deadline).toISOString(),
    reason,
  });

  return deadline;
}

/**
 * What `source` is currently waiting out, or null if it is free to use.
 *
 * An expired row is deleted on the way past rather than being reported: the
 * table holds live deadlines only, so anything reading it (a boot log, a
 * future Settings panel) sees the truth without having to filter.
 */
export function getSourceLimit(source: string): SourceLimit | null {
  const row = queryOne<SourceLimitRow>('SELECT * FROM source_limits WHERE source = ?', [source]);
  if (!row) return null;

  const limit = rowToLimit(row);
  if (!limit) {
    clearSourceLimit(source);
    return null;
  }
  return limit;
}

/** Every source currently being waited out, soonest deadline first. */
export function listSourceLimits(): SourceLimit[] {
  const rows = query<SourceLimitRow>('SELECT * FROM source_limits ORDER BY retry_after', []);
  const live: SourceLimit[] = [];
  for (const row of rows) {
    const limit = rowToLimit(row);
    if (limit) live.push(limit);
    else clearSourceLimit(row.source);
  }
  return live;
}

function rowToLimit(row: SourceLimitRow, now: number = Date.now()): SourceLimit | null {
  const iso = sqlTimeToIso(row.retry_after);
  const deadline = Date.parse(iso);
  // An unparseable deadline is treated as expired: better to try the source
  // again than to lock it out forever on a bad row.
  if (Number.isNaN(deadline) || deadline <= now) return null;

  return {
    source: row.source,
    retryAfter: iso,
    retryAfterMs: deadline - now,
    reason: row.reason,
  };
}

/** Let `source` be used again immediately — it worked, or an operator said so. */
export function clearSourceLimit(source: string): void {
  execute('DELETE FROM source_limits WHERE source = ?', [source]);
}

/**
 * Drop deadlines that have passed. Called at boot alongside the retry-queue
 * rebuild; purely housekeeping, since `getSourceLimit` ignores them anyway.
 */
export function clearExpiredSourceLimits(): number {
  const now = msToSqlTime(Date.now());
  const result = execute('DELETE FROM source_limits WHERE retry_after <= ?', [now]);
  return result.rowCount;
}

/**
 * Throw if `source` is still waiting out a limit.
 *
 * Every download calls this before it fetches anything, which is what turns
 * one book's 429 into the whole queue's patience.
 */
export function assertSourceAvailable(source: string): void {
  const limit = getSourceLimit(source);
  if (!limit) return;

  throw new SourceLimitReachedError(
    source,
    limit.retryAfterMs,
    `${sourceLabel(source)} is rate limited until ${limit.retryAfter} ` +
      `(${describeWait(limit.retryAfterMs)} from now)${limit.reason ? `: ${limit.reason}` : ''}`
  );
}

/**
 * Which sources have a download in flight right now.
 *
 * In memory rather than in the database on purpose: unlike a deadline, this
 * is only true while *this* process is running, and a slot held by a process
 * that has since died would be a deadlock rather than a fact worth keeping.
 */
const busySources = new Set<string>();

/** Take the source's single download slot, or report that it's taken. */
export function tryAcquireSourceSlot(source: string): boolean {
  if (busySources.has(source)) return false;
  busySources.add(source);
  return true;
}

export function releaseSourceSlot(source: string): void {
  busySources.delete(source);
}

/** Whether anything currently holds `source`'s slot. */
export function isSourceBusy(source: string): boolean {
  return busySources.has(source);
}

/**
 * Run `fn` as the only thing talking to `source`, after waiting out the
 * source's pacing interval.
 *
 * @throws SourceLimitReachedError if the source is waiting out a limit.
 * @throws SourceBusyError if another download already holds the slot — the
 * caller is expected to let the queue defer it, not to block.
 */
export async function runWithSourceSlot<T>(source: string, fn: () => Promise<T>): Promise<T> {
  assertSourceAvailable(source);

  if (!tryAcquireSourceSlot(source)) {
    throw new SourceBusyError(source);
  }

  try {
    await paceSource(source, sourcePolicy(source).paceMs);
    return await fn();
  } finally {
    releaseSourceSlot(source);
  }
}
