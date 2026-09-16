/**
 * Timestamps as a person in their own timezone would read them.
 *
 * Everything that reaches the browser is an ISO-8601 instant — the database
 * stores SQLite's naked "YYYY-MM-DD HH:MM:SS" and the server marks it as UTC on
 * the way out (see `sqlTimeToIso` in `@shelvarr/db`). That matters here because
 * `new Date()` reads a naked string as *local* time: a reader in AEST would put
 * every row ten hours further into the past than it really is. These helpers
 * assume the zone is present and simply render in the reader's own.
 *
 * They are for client components. Formatting a date on the server renders it in
 * the server's locale and timezone, which then disagrees with what the browser
 * produces on hydration.
 */

/** Guard against a null column or a value that isn't a date at all. */
function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * How long ago something happened: "Just now", "5m ago", "3h ago", or a plain
 * local date once it is older than a day.
 *
 * A timestamp slightly in the future reads as "Just now" rather than as a
 * negative age — the server's clock and the reader's are never exactly aligned,
 * and a few seconds of skew shouldn't be shown to anyone.
 */
export function formatRelativeTime(value: string | null | undefined): string {
  const date = toDate(value);
  if (!date) return 'unknown';

  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return date.toLocaleDateString();
}

/** A date and time in the reader's timezone, for when the exact moment matters. */
export function formatDateTime(value: string | null | undefined): string {
  const date = toDate(value);
  return date ? date.toLocaleString() : 'unknown';
}

/** Just the calendar date in the reader's timezone. */
export function formatDate(value: string | null | undefined): string {
  const date = toDate(value);
  return date ? date.toLocaleDateString() : 'unknown';
}
