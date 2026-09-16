import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatRelativeTime, formatDateTime, formatDate } from '../../lib/utils/dates.js';

/** An ISO instant `msAgo` in the past, as the server would send it. */
function ago(msAgo: number): string {
  return new Date(Date.now() - msAgo).toISOString();
}

describe('Date formatting', () => {
  describe('formatRelativeTime', () => {
    it('counts back from a zone-qualified instant', () => {
      assert.strictEqual(formatRelativeTime(ago(5_000)), 'Just now');
      assert.strictEqual(formatRelativeTime(ago(5 * 60_000)), '5m ago');
      assert.strictEqual(formatRelativeTime(ago(3 * 3_600_000)), '3h ago');
    });

    it('falls back to a date once it is more than a day old', () => {
      const threeDays = ago(3 * 86_400_000);
      assert.strictEqual(formatRelativeTime(threeDays), new Date(threeDays).toLocaleDateString());
    });

    // The whole point: a naked stored timestamp read as local time put every
    // row ten hours in the past for a reader in AEST. The server marks the
    // zone now, so "a moment ago" reads as a moment ago in any timezone.
    it('reads a just-created timestamp as recent, whatever the timezone', () => {
      assert.strictEqual(formatRelativeTime(new Date().toISOString()), 'Just now');
    });

    it('treats a little clock skew as now rather than as a negative age', () => {
      assert.strictEqual(formatRelativeTime(new Date(Date.now() + 5_000).toISOString()), 'Just now');
    });

    it('says so rather than rendering "Invalid Date"', () => {
      assert.strictEqual(formatRelativeTime(null), 'unknown');
      assert.strictEqual(formatRelativeTime(undefined), 'unknown');
      assert.strictEqual(formatRelativeTime(''), 'unknown');
      assert.strictEqual(formatRelativeTime('not a date'), 'unknown');
    });
  });

  describe('formatDateTime and formatDate', () => {
    it('renders in the reader\'s own timezone', () => {
      const iso = '2026-09-16T01:54:53Z';
      assert.strictEqual(formatDateTime(iso), new Date(iso).toLocaleString());
      assert.strictEqual(formatDate(iso), new Date(iso).toLocaleDateString());
    });

    it('says so rather than rendering "Invalid Date"', () => {
      assert.strictEqual(formatDateTime(null), 'unknown');
      assert.strictEqual(formatDate('not a date'), 'unknown');
    });
  });
});
