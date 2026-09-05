/**
 * The recurring-job scheduler.
 *
 * Split out of the old comics-migration suite when the Kapowarr adoption path
 * was removed — the scheduler was the half of that file which outlived it.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('Scheduler', () => {
  let scheduler: typeof import('@shelvarr/services/queue/scheduler');
  let schedulerRoot: string;
  let schedulerDb: typeof import('../../lib/db/index.js');

  before(async () => {
    schedulerRoot = '/tmp/shelvarr-scheduler-test-' + Date.now();
    process.env['DATA_DIR'] = schedulerRoot;
    process.env['DB_PATH'] = join(schedulerRoot, 'test.db');
    mkdirSync(schedulerRoot, { recursive: true });

    schedulerDb = await import('../../lib/db/index.js');
    schedulerDb.initDatabase();

    scheduler = await import('@shelvarr/services/queue/scheduler');
  });

  after(() => {
    scheduler.stopScheduler();
    rmSync(schedulerRoot, { recursive: true, force: true });
  });

  beforeEach(() => {
    schedulerDb.getDb().exec('DELETE FROM scheduled_tasks; DELETE FROM tasks;');
  });

  it('creates the default jobs', () => {
    scheduler.ensureDefaultSchedules();

    const schedules = scheduler.listSchedules();
    assert.strictEqual(schedules.length, scheduler.DEFAULT_SCHEDULES.length);
    assert.ok(schedules.every((schedule) => schedule.nextRun > Math.floor(Date.now() / 1000)));
  });

  it('leaves the metadata refresh on and the download sweep off', () => {
    scheduler.ensureDefaultSchedules();

    assert.strictEqual(scheduler.getSchedule('comic_update_all')!.enabled, true);
    // Downloading things unprompted should be opt-in.
    assert.strictEqual(scheduler.getSchedule('comic_search_all')!.enabled, false);
    // Finishing a download that was already asked for is not unprompted, so
    // the resume sweep runs by default.
    assert.strictEqual(scheduler.getSchedule('comic_resume')!.enabled, true);
  });

  it('sorts the book jobs onto the Books tab and the comic jobs onto Comics', () => {
    scheduler.ensureDefaultSchedules();

    const byName = new Map(
      scheduler.listSchedules().map((schedule) => [schedule.name, schedule.category])
    );
    assert.strictEqual(byName.get('book_scan_all'), 'books');
    assert.strictEqual(byName.get('book_metadata_all'), 'books');
    assert.strictEqual(byName.get('book_organize_all'), 'books');
    assert.strictEqual(byName.get('comic_update_all'), 'comics');
    // Session cleanup keeps the app running rather than managing content, so
    // it belongs to neither tab.
    assert.strictEqual(byName.get('auth_prune'), 'system');
  });

  it('leaves the book rename sweep off, since it moves files', () => {
    scheduler.ensureDefaultSchedules();

    assert.strictEqual(scheduler.getSchedule('book_scan_all')!.enabled, true);
    assert.strictEqual(scheduler.getSchedule('book_metadata_all')!.enabled, true);
    assert.strictEqual(scheduler.getSchedule('book_organize_all')!.enabled, false);
  });

  it('does not overwrite settings the user has changed', () => {
    scheduler.ensureDefaultSchedules();
    scheduler.setScheduleEnabled('comic_update_all', false);
    scheduler.setScheduleInterval('comic_update_all', 7200);

    scheduler.ensureDefaultSchedules();

    const schedule = scheduler.getSchedule('comic_update_all')!;
    assert.strictEqual(schedule.enabled, false);
    assert.strictEqual(schedule.intervalSeconds, 7200);
  });

  it('rejects an interval that would hammer the queue', () => {
    scheduler.ensureDefaultSchedules();
    assert.throws(() => scheduler.setScheduleInterval('comic_update_all', 30), /at least 60/);
  });

  it('claims only what is due', () => {
    scheduler.ensureDefaultSchedules();
    assert.deepStrictEqual(scheduler.claimDueSchedules(), []);

    // Pretend an hour has passed.
    const future = Math.floor(Date.now() / 1000) + 25 * 3600;
    const claimed = scheduler.claimDueSchedules(future);

    // Only the jobs that are on by default come back. Derived rather than
    // written out, so adding a scheduled job does not fail this test for
    // saying something it never meant to say — which is what a hardcoded
    // list did twice over.
    assert.deepStrictEqual(
      claimed.map((schedule) => schedule.name).sort(),
      scheduler.DEFAULT_SCHEDULES.filter((entry) => entry.enabledByDefault)
        .map((entry) => entry.name)
        .sort()
    );
    // The download sweep is off by default, so it must not appear.
    assert.strictEqual(
      claimed.some((schedule) => schedule.name === 'comic_search_all'),
      false,
      'a job that is off by default must not be claimed'
    );
  });

  it('claims each due job exactly once', () => {
    scheduler.ensureDefaultSchedules();
    const future = Math.floor(Date.now() / 1000) + 25 * 3600;
    const enabledCount = scheduler.DEFAULT_SCHEDULES.filter(
      (entry) => entry.enabledByDefault
    ).length;

    const first = scheduler.claimDueSchedules(future);
    // A second process ticking at the same moment must come away empty: the
    // claim moved next_run forward in the same statement.
    const second = scheduler.claimDueSchedules(future);

    assert.strictEqual(first.length, enabledCount);
    assert.deepStrictEqual(second, []);
  });

  it('moves the next run forward by the interval', () => {
    scheduler.ensureDefaultSchedules();
    const future = Math.floor(Date.now() / 1000) + 25 * 3600;

    scheduler.claimDueSchedules(future);

    const schedule = scheduler.getSchedule('comic_update_all')!;
    assert.strictEqual(schedule.nextRun, future + schedule.intervalSeconds);
    assert.strictEqual(schedule.lastRun, future);
  });

  it('re-enabling starts a fresh interval rather than firing at once', () => {
    scheduler.ensureDefaultSchedules();
    scheduler.setScheduleEnabled('comic_search_all', true);

    const schedule = scheduler.getSchedule('comic_search_all')!;
    assert.ok(schedule.nextRun > Math.floor(Date.now() / 1000) + 3600);
    assert.deepStrictEqual(scheduler.claimDueSchedules(), []);
  });

  it('runs a job on demand without disturbing its schedule', () => {
    scheduler.ensureDefaultSchedules();
    const before = scheduler.getSchedule('comic_search_all')!.nextRun;

    const taskId = scheduler.runScheduleNow('comic_search_all');

    assert.ok(taskId > 0);
    assert.strictEqual(scheduler.getSchedule('comic_search_all')!.nextRun, before);
  });

  it('refuses to touch a job that does not exist', () => {
    assert.throws(() => scheduler.runScheduleNow('nope'), /No schedule named/);
    assert.throws(() => scheduler.setScheduleEnabled('nope', true), /No schedule named/);
  });

  it('starts and stops idempotently', () => {
    scheduler.startScheduler({ tickMs: 60_000 });
    scheduler.startScheduler({ tickMs: 60_000 });
    assert.ok(scheduler.isSchedulerRunning());

    scheduler.stopScheduler();
    scheduler.stopScheduler();
    assert.ok(!scheduler.isSchedulerRunning());
  });
});
