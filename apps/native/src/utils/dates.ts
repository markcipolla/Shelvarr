/**
 * Reading the timestamps in the local mirror.
 *
 * The mirror holds what the server's columns hold: SQLite's CURRENT_TIMESTAMP
 * format, "YYYY-MM-DD HH:MM:SS", always UTC but with nothing on it to say so.
 * Rows arriving from /api/sync are stored exactly as sent, and the REST cache
 * path writes CURRENT_TIMESTAMP itself, so both spellings land in one column.
 *
 * `new Date("2026-09-16 01:54:53")` reads that as *local* time, which on a
 * device in AEST is ten hours out. Appending a bare "Z" isn't enough either —
 * "2026-09-16 01:54:53Z" is not valid ISO-8601, and while V8 tolerates it
 * Hermes does not reliably, so it can come back NaN. The separator has to
 * become "T" as well.
 *
 * This mirrors `sqlTimeToIso` in @shelvarr/db; the two formats have to agree.
 */

/** SQLite's CURRENT_TIMESTAMP shape: "YYYY-MM-DD HH:MM:SS", UTC, no zone. */
const SQLITE_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;

/**
 * Mark a stored timestamp as the UTC instant it actually is.
 *
 * Anything already carrying a zone is passed through, so this is idempotent
 * and safe over a column written from both sides.
 */
export function sqlTimeToIso(value: string): string {
  if (!SQLITE_TIMESTAMP.test(value)) return value;
  return `${value.replace(' ', 'T')}Z`;
}

/** Parse a stored timestamp, or null if it isn't a date at all. */
export function parseSqlTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(sqlTimeToIso(value));
  return Number.isNaN(date.getTime()) ? null : date;
}
