/**
 * Migrating a mirrored library (adoption), and the recurring-job scheduler.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ComicIssueSummary, ComicVolumeDetail } from '@shelvarr/types';

let db: typeof import('../../lib/db/index.js');
let root: string;

/** A cached volume, in the shape the previous manager's mirror left it. */
function makeDetail(
  id: number,
  folder: string,
  issueCount = 5,
  overrides: Partial<ComicVolumeDetail> = {}
): ComicVolumeDetail {
  const issues: ComicIssueSummary[] = Array.from({ length: issueCount }, (_, index) => ({
    id: id * 1000 + index,
    volume_id: id,
    comicvine_id: 700000 + id * 100 + index,
    issue_number: String(index + 1),
    calculated_issue_number: index + 1,
    title: `Issue ${index + 1}`,
    date: '2018-06-13',
    description: '',
    monitored: true,
    files: [],
  }));

  return {
    id,
    comicvine_id: 42821 + id,
    title: `Series ${id}`,
    year: 2018,
    publisher: 'Marvel',
    volume_number: 1,
    description: '',
    monitored: true,
    monitor_new_issues: true,
    folder,
    issue_count: issueCount,
    issue_count_monitored: issueCount,
    issues_downloaded: 0,
    issues_downloaded_monitored: 0,
    total_size: 0,
    special_version: null,
    special_version_locked: false,
    site_url: '',
    root_folder: 1,
    volume_folder: `Series ${id}`,
    issues,
    general_files: [],
    ...overrides,
  };
}

describe('Migrating a mirrored library', () => {
  let adopt: typeof import('@shelvarr/services/comics/adopt');
  let libraryRoot: string;

  /**
   * The previous manager recorded paths under `/comics-1`; this process sees
   * them somewhere else, which is exactly what COMIC_PATH_MAP exists for.
   */
  const LEGACY_PREFIX = '/comics-1';

  before(async () => {
    root = '/tmp/shelvarr-adopt-test-' + Date.now();
    libraryRoot = join(root, 'library');
    process.env['DATA_DIR'] = root;
    process.env['DB_PATH'] = join(root, 'test.db');
    mkdirSync(libraryRoot, { recursive: true });

    db = await import('../../lib/db/index.js');
    db.initDatabase();

    const { initServiceConfig } = await import('@shelvarr/services');
    initServiceConfig({
      env: 'test',
      port: 3000,
      dataDir: root,
      libraryRoot: root,
      dbPath: join(root, 'test.db'),
      comicMigration: { pathMap: `${LEGACY_PREFIX}:${libraryRoot}` },
      getcomics: {
        baseUrl: 'https://getcomics.example',
        downloadDir: join(root, 'downloads'),
        libraryRoot,
        hostPreference: ['getcomics'],
        renameDownloadedFiles: true,
      },
      audiletome: { url: null, apiKey: null },
      supportedExtensions: ['.cbz'],
      rateLimits: { hardcover: 60 },
      hardcoverToken: null,
    });

    adopt = await import('@shelvarr/services/comics/adopt');
  });

  after(() => {
    if (db) db.closeDatabase();
    rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    db.getDb().exec(
      `DELETE FROM comic_issue_files; DELETE FROM comic_files; DELETE FROM comic_issues;
       DELETE FROM comics; DELETE FROM comic_root_folders;`
    );
    rmSync(libraryRoot, { recursive: true, force: true });
    mkdirSync(libraryRoot, { recursive: true });
  });

  /** Mirror a volume from the previous manager, with files on disk. */
  function seedMirroredVolume(
    id: number,
    name: string,
    fileNumbers: number[] = [1, 2, 3]
  ): { legacyFolder: string; localFolder: string } {
    const legacyFolder = `${LEGACY_PREFIX}/${name}`;
    const localFolder = join(libraryRoot, name);
    mkdirSync(localFolder, { recursive: true });

    for (const number of fileNumbers) {
      writeFileSync(
        join(localFolder, `Series ${id} (2018) Issue 00${number}.cbz`),
        'x'
      );
    }

    db.upsertComicDetail(makeDetail(id, legacyFolder));
    return { legacyFolder, localFolder };
  }

  describe('listAdoptionCandidates', () => {
    it('remaps the recorded path and finds the root folder', () => {
      db.addComicRootFolder(libraryRoot);
      const { localFolder } = seedMirroredVolume(1, 'Series One');

      const [candidate] = adopt.listAdoptionCandidates();
      assert.strictEqual(candidate!.localFolder, localFolder);
      assert.strictEqual(candidate!.blocker, null);
      assert.strictEqual(candidate!.issueCount, 5);
    });

    it('flags a folder that is not mounted', () => {
      db.addComicRootFolder(libraryRoot);
      db.upsertComicDetail(makeDetail(1, `${LEGACY_PREFIX}/Not Mounted`));

      const [candidate] = adopt.listAdoptionCandidates();
      assert.match(candidate!.blocker!, /not readable/);
      assert.match(candidate!.blocker!, /COMIC_PATH_MAP/);
    });

    it('flags a volume outside every configured root folder', () => {
      db.addComicRootFolder('/somewhere/else');
      seedMirroredVolume(1, 'Series One');

      const [candidate] = adopt.listAdoptionCandidates();
      assert.match(candidate!.blocker!, /No configured root folder/);
    });

    it('flags a volume whose issues were never cached', () => {
      db.addComicRootFolder(libraryRoot);
      const localFolder = join(libraryRoot, 'No Issues');
      mkdirSync(localFolder, { recursive: true });
      db.upsertComicDetail(makeDetail(1, `${LEGACY_PREFIX}/No Issues`, 0));

      const [candidate] = adopt.listAdoptionCandidates();
      assert.match(candidate!.blocker!, /No issues cached/);
    });

    it('ignores volumes that are already managed', async () => {
      db.addComicRootFolder(libraryRoot);
      seedMirroredVolume(1, 'Series One');
      await adopt.adoptVolume(1);

      assert.deepStrictEqual(adopt.listAdoptionCandidates(), []);
    });
  });

  describe('adoptVolume', () => {
    it('takes the volume over and matches its files, without ComicVine', async () => {
      db.addComicRootFolder(libraryRoot);
      const { localFolder } = seedMirroredVolume(1, 'Series One');

      const result = await adopt.adoptVolume(1);

      assert.strictEqual(result.matchedFiles, 3);
      assert.strictEqual(result.folder, localFolder);

      const volume = db.getComicVolume(1)!;
      assert.strictEqual(volume.folder, localFolder);
      assert.ok(volume.customFolder, 'adoption must not reorganise an existing library');
      assert.strictEqual(volume.lastCvFetch, 0, 'should be due for a metadata refresh');
      assert.ok(db.isComicVolumeManaged(1));
    });

    it('keeps the cached issues and their local ids', async () => {
      db.addComicRootFolder(libraryRoot);
      seedMirroredVolume(1, 'Series One');

      const before = db
        .getDb()
        .prepare('SELECT id FROM comic_issues WHERE volume_id = 1 ORDER BY id')
        .all() as Array<{ id: number }>;

      await adopt.adoptVolume(1);

      const after = db
        .getDb()
        .prepare('SELECT id FROM comic_issues WHERE volume_id = 1 ORDER BY id')
        .all() as Array<{ id: number }>;
      assert.deepStrictEqual(after, before);
    });

    it('reports downloaded counts from the files it found', async () => {
      db.addComicRootFolder(libraryRoot);
      seedMirroredVolume(1, 'Series One', [1, 2]);

      await adopt.adoptVolume(1);

      const stats = db.getComicVolumeFileStats(1);
      assert.strictEqual(stats.issueCount, 5);
      assert.strictEqual(stats.downloadedCount, 2);
    });

    it('refuses a volume it cannot reach', async () => {
      db.addComicRootFolder(libraryRoot);
      db.upsertComicDetail(makeDetail(1, `${LEGACY_PREFIX}/Gone`));

      await assert.rejects(() => adopt.adoptVolume(1), /not readable/);
    });

    it('refuses to adopt the same volume twice', async () => {
      db.addComicRootFolder(libraryRoot);
      seedMirroredVolume(1, 'Series One');
      await adopt.adoptVolume(1);

      await assert.rejects(() => adopt.adoptVolume(1), /already managed/);
    });
  });

  describe('adoptAllVolumes', () => {
    it('migrates what it can and reports what it cannot', async () => {
      db.addComicRootFolder(libraryRoot);
      seedMirroredVolume(1, 'Series One');
      seedMirroredVolume(2, 'Series Two');
      db.upsertComicDetail(makeDetail(3, `${LEGACY_PREFIX}/Not Mounted`));

      const result = await adopt.adoptAllVolumes();

      assert.strictEqual(result.adopted.length, 2);
      assert.strictEqual(result.skipped.length, 1);
      assert.match(result.skipped[0]!.reason, /not readable/);
    });

    it('reports progress as it goes', async () => {
      db.addComicRootFolder(libraryRoot);
      seedMirroredVolume(1, 'Series One');
      seedMirroredVolume(2, 'Series Two');

      const seen: Array<[number, number]> = [];
      await adopt.adoptAllVolumes({ onProgress: (done, total) => seen.push([done, total]) });

      assert.deepStrictEqual(seen, [
        [1, 2],
        [2, 2],
      ]);
    });

    it('leaves the files exactly where they were', async () => {
      db.addComicRootFolder(libraryRoot);
      const { localFolder } = seedMirroredVolume(1, 'Series One');
      const path = join(localFolder, 'Series 1 (2018) Issue 001.cbz');

      await adopt.adoptAllVolumes();

      assert.ok(existsSync(path), 'adoption must never move a file');
    });
  });

  describe('unadoptVolume', () => {
    it('puts a volume back to being a mirror', async () => {
      db.addComicRootFolder(libraryRoot);
      seedMirroredVolume(1, 'Series One');
      await adopt.adoptVolume(1);

      adopt.unadoptVolume(1);

      assert.ok(!db.isComicVolumeManaged(1));
      assert.strictEqual(db.getComicFilesForVolume(1).length, 0);
      // The issues are untouched, so re-adopting works.
      assert.strictEqual(adopt.listAdoptionCandidates().length, 1);
    });
  });
});

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

describe('Adoption task payloads', () => {
  let scheduler: typeof import('@shelvarr/services/queue/scheduler');

  before(async () => {
    scheduler = await import('@shelvarr/services/queue/scheduler');
  });

  it('is not something the scheduler runs on a timer', () => {
    // Migration is a one-off the user triggers; putting it on a schedule
    // would keep re-adopting whatever a previous manager had re-added.
    assert.ok(
      !scheduler.DEFAULT_SCHEDULES.some((schedule) => schedule.taskType === 'comic_adopt')
    );
  });
});
