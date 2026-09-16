/**
 * Byte counts as a person would read them.
 *
 * Sizes come off the wire in bytes — download progress, imported file sizes —
 * and a raw count is unreadable at a glance, so everything user-facing goes
 * through here.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/**
 * How far through a byte-counted transfer we are.
 *
 * The total is only known when the server sent a content length, so without
 * one this falls back to the bytes so far — "37.2 MB" says more than nothing.
 */
export function formatByteProgress(progress: number, total: number | null): string {
  if (!total || total <= 0) return progress > 0 ? formatBytes(progress) : '';
  const percent = Math.min(100, Math.round((progress / total) * 100));
  return `${formatBytes(progress)} of ${formatBytes(total)} (${percent}%)`;
}
