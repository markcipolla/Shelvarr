/**
 * Schedules gained a record of the default the code shipped for them, so a
 * changed default can reach an install that already has the row.
 *
 * Rows that predate the columns have no history to read: no edit was ever
 * recorded, so the migration says so by recording their current value as the
 * default. The first `ensureDefaultSchedules` after that adopts whatever the
 * code now ships, and from then on an edit is distinguishable and survives.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('schedule defaults migration', () => {
  let dir: string;
  let db: typeof import('../../lib/db/index.js');
  let scheduler: typeof import('@shelvarr/services/queue/scheduler');

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'shelvarr-schedule-defaults-'));
    process.env['DATA_DIR'] = dir;
    process.env['DB_PATH'] = join(dir, 'test.db');

    db = await import('../../lib/db/index.js');
    db.initDatabase();
    scheduler = await import('@shelvarr/services/queue/scheduler');
    scheduler.ensureDefaultSchedules();

    // Rewind to the pre-migration shape: no recorded defaults, and the state
    // this install actually carried — comic_resume off, on a six-hour
    // interval the code stopped asking for.
    const raw = db.getDb();
    raw.exec('ALTER TABLE scheduled_tasks DROP COLUMN default_enabled');
    raw.exec('ALTER TABLE scheduled_tasks DROP COLUMN default_interval_seconds');
    raw.exec(
      `UPDATE scheduled_tasks SET enabled = 0, interval_seconds = 21600
        WHERE name IN ('comic_resume', 'comic_search_all')`
    );
    db.closeDatabase();

    db.initDatabase();
  });

  after(() => {
    db?.closeDatabase();
    rmSync(dir, { recursive: true, force: true });
  });

  it('records what each row currently holds as its default', () => {
    const row = db
      .getDb()
      .prepare(
        `SELECT enabled, interval_seconds, default_enabled, default_interval_seconds
           FROM scheduled_tasks WHERE name = 'comic_resume'`
      )
      .get() as Record<string, number>;

    assert.strictEqual(row['default_enabled'], row['enabled']);
    assert.strictEqual(row['default_interval_seconds'], row['interval_seconds']);
  });

  it('adopts the shipped default on the next start', () => {
    scheduler.ensureDefaultSchedules();

    const resume = scheduler.getSchedule('comic_resume')!;
    assert.strictEqual(resume.enabled, true, 'ships on by default');
    assert.strictEqual(resume.intervalSeconds, 900);
  });

  it('still does not switch on a job that ships off by default', () => {
    scheduler.ensureDefaultSchedules();

    const search = scheduler.getSchedule('comic_search_all')!;
    assert.strictEqual(search.enabled, false);
    assert.strictEqual(search.intervalSeconds, 86400);
  });

  it('holds an edit made after the migration', () => {
    scheduler.ensureDefaultSchedules();
    scheduler.setScheduleEnabled('comic_resume', false);

    scheduler.ensureDefaultSchedules();

    assert.strictEqual(scheduler.getSchedule('comic_resume')!.enabled, false);
  });
});
