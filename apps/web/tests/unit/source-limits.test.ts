/**
 * Per-source download limits (E1-6): the deadline a spent source is waiting
 * out, the one-download-at-a-time cap, and the errors the queue defers on.
 *
 * Driven against a real database, like book-acquisition.test.ts, because the
 * point of the deadline is that it is written down — an in-memory stand-in
 * would pass while proving nothing about the restart the card cares about.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';

let db: typeof import('../../lib/db/index.js');
let limits: typeof import('../../lib/services/downloads/source-limits.js');
let dataDir: string;

describe('Per-source download limits', () => {
  before(async () => {
    dataDir = '/tmp/shelvarr-source-limits-test-' + Date.now();
    process.env['DATA_DIR'] = dataDir;
    process.env['DB_PATH'] = join(dataDir, 'test.db');
    mkdirSync(dataDir, { recursive: true });

    db = await import('../../lib/db/index.js');
    db.initDatabase();
    limits = await import('../../lib/services/downloads/source-limits.js');
  });

  after(() => {
    if (db) db.closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    db.getDb().exec('DELETE FROM source_limits');
    limits.releaseSourceSlot('zlibrary');
    limits.releaseSourceSlot('annas');
    limits.releaseSourceSlot('libgen');
  });

  describe('recording a deadline', () => {
    it('reports how long is left, and blocks the source until then', () => {
      limits.recordSourceLimit('zlibrary', 60_000, 'daily quota spent');

      const limit = limits.getSourceLimit('zlibrary');
      assert.ok(limit);
      assert.strictEqual(limit.source, 'zlibrary');
      assert.strictEqual(limit.reason, 'daily quota spent');
      assert.ok(limit.retryAfterMs > 55_000 && limit.retryAfterMs <= 60_000);

      assert.throws(
        () => limits.assertSourceAvailable('zlibrary'),
        (error: unknown) => error instanceof limits.SourceLimitReachedError
      );
    });

    it('leaves other sources alone', () => {
      limits.recordSourceLimit('zlibrary', 60_000);

      assert.strictEqual(limits.getSourceLimit('annas'), null);
      limits.assertSourceAvailable('annas');
      limits.assertSourceAvailable('libgen');
    });

    it('stores the deadline as a naked-UTC timestamp, like every other column', () => {
      limits.recordSourceLimit('annas', 60_000);

      const row = db.queryOne<{ retry_after: string }>(
        'SELECT retry_after FROM source_limits WHERE source = ?',
        ['annas']
      );
      assert.ok(row);
      assert.match(row.retry_after, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      // ...and comes back out as a real instant, zone included.
      assert.match(limits.getSourceLimit('annas')!.retryAfter, /Z$/);
    });

    it('keeps the longer of two deadlines, so a small hiccup cannot shorten a daily quota', () => {
      limits.recordSourceLimit('zlibrary', 6 * 60 * 60_000, 'daily quota');
      limits.recordSourceLimit('zlibrary', 30_000, 'a passing 429');

      const limit = limits.getSourceLimit('zlibrary');
      assert.ok(limit);
      assert.ok(limit.retryAfterMs > 60_000, `retryAfterMs was ${limit.retryAfterMs}`);
      assert.strictEqual(limit.reason, 'daily quota');
    });

    it('never defers for longer than a day, whatever the host asks for', () => {
      limits.recordSourceLimit('annas', 30 * 24 * 60 * 60_000);

      const limit = limits.getSourceLimit('annas');
      assert.ok(limit);
      assert.ok(limit.retryAfterMs <= limits.MAX_SOURCE_LIMIT_MS);
    });
  });

  describe('a deadline that has passed', () => {
    it('is not reported, and is swept away on the way past', () => {
      limits.recordSourceLimit('zlibrary', 0);

      assert.strictEqual(limits.getSourceLimit('zlibrary'), null);
      limits.assertSourceAvailable('zlibrary');

      const row = db.queryOne<{ source: string }>(
        'SELECT source FROM source_limits WHERE source = ?',
        ['zlibrary']
      );
      assert.strictEqual(row, null);
    });

    it('is cleared in bulk at boot', () => {
      db.getDb()
        .prepare('INSERT INTO source_limits (source, retry_after) VALUES (?, ?)')
        .run('zlibrary', '2000-01-01 00:00:00');
      limits.recordSourceLimit('annas', 60_000);

      assert.strictEqual(limits.clearExpiredSourceLimits(), 1);
      assert.ok(limits.getSourceLimit('annas'), 'a live deadline must survive the sweep');
    });

    it('can be lifted by hand before it expires', () => {
      limits.recordSourceLimit('libgen', 60_000);
      limits.clearSourceLimit('libgen');

      assert.strictEqual(limits.getSourceLimit('libgen'), null);
    });
  });

  it('survives a restart, because the whole queue would otherwise walk back into it', () => {
    limits.recordSourceLimit('zlibrary', 6 * 60 * 60_000, 'daily quota spent');

    // The process dies and comes back — the in-memory retry queue with it.
    db.closeDatabase();
    db.initDatabase();

    const limit = limits.getSourceLimit('zlibrary');
    assert.ok(limit, 'the deadline should still be in force after a restart');
    assert.ok(limit.retryAfterMs > 5 * 60 * 60_000);
  });

  describe('one download at a time', () => {
    it('lets the first caller through and defers the second', async () => {
      let release = (): void => {};
      const held = new Promise<void>((resolve) => { release = resolve; });

      const first = limits.runWithSourceSlot('zlibrary', async () => {
        await held;
        return 'done';
      });

      await assert.rejects(
        () => limits.runWithSourceSlot('zlibrary', async () => 'should not run'),
        (error: unknown) => error instanceof limits.SourceBusyError
      );

      release();
      assert.strictEqual(await first, 'done');
    });

    it('hands the slot back even when the download throws', async () => {
      await assert.rejects(
        () => limits.runWithSourceSlot('zlibrary', async () => { throw new Error('disk full'); }),
        /disk full/
      );

      assert.strictEqual(limits.isSourceBusy('zlibrary'), false);
      assert.strictEqual(await limits.runWithSourceSlot('zlibrary', async () => 'ok'), 'ok');
    });

    it('refuses to start at all while the source is waiting out a limit', async () => {
      limits.recordSourceLimit('zlibrary', 60_000);

      let ran = false;
      await assert.rejects(
        () => limits.runWithSourceSlot('zlibrary', async () => { ran = true; return 'ok'; }),
        (error: unknown) => error instanceof limits.SourceLimitReachedError
      );

      assert.strictEqual(ran, false, 'the source must not be contacted at all');
      assert.strictEqual(limits.isSourceBusy('zlibrary'), false);
    });

    it('caps each source separately', async () => {
      let release = (): void => {};
      const held = new Promise<void>((resolve) => { release = resolve; });

      const zlib = limits.runWithSourceSlot('zlibrary', async () => { await held; return 'z'; });
      assert.strictEqual(await limits.runWithSourceSlot('libgen', async () => 'l'), 'l');

      release();
      assert.strictEqual(await zlib, 'z');
    });
  });

  describe('what the queue reads off the error', () => {
    it('gives a deferral delay for both kinds of "come back later"', () => {
      assert.strictEqual(
        limits.deferralDelay(new limits.SourceLimitReachedError('zlibrary', 1_000)),
        1_000
      );
      assert.strictEqual(
        limits.deferralDelay(new limits.SourceBusyError('zlibrary', 500)),
        500
      );
    });

    it('gives nothing for an ordinary failure, which must still fail', () => {
      assert.strictEqual(limits.deferralDelay(new Error('disk full')), null);
      assert.strictEqual(limits.deferralDelay(null), null);
    });
  });

  describe('how long to wait when the host does not say', () => {
    it('waits until the daily reset for a source whose free tier is a daily quota', () => {
      const now = Date.parse('2026-09-17T18:00:00Z');
      assert.strictEqual(limits.defaultLimitMs('zlibrary', now), 6 * 60 * 60_000);
      assert.strictEqual(limits.defaultLimitMs('annas', now), 6 * 60 * 60_000);
    });

    it('waits a few minutes for a source that is merely busy', () => {
      assert.strictEqual(limits.defaultLimitMs('libgen'), 5 * 60_000);
    });

    it('always returns a positive wait, even on the stroke of midnight', () => {
      assert.strictEqual(limits.msUntilDailyReset(Date.parse('2026-09-17T00:00:00Z')), 24 * 60 * 60_000);
    });
  });
});
