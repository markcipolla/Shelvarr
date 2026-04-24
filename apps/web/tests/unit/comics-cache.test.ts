/**
 * Unit tests for comic metadata caching in @shelvarr/db.
 * Exercises upsert/get/soft-delete/staleness for comics + comic_issues tables.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import type { KapowarrVolume, KapowarrVolumeDetail, KapowarrIssue } from '@shelvarr/types';

let db: typeof import('../../lib/db/index.js');

function makeVolume(overrides: Partial<KapowarrVolume> = {}): KapowarrVolume {
  return {
    id: 101,
    comicvine_id: 5001,
    title: 'Saga',
    year: 2012,
    publisher: 'Image',
    volume_number: 1,
    description: 'Epic space opera',
    monitored: true,
    monitor_new_issues: false,
    folder: '/comics/saga',
    issue_count: 60,
    issue_count_monitored: 60,
    issues_downloaded: 30,
    issues_downloaded_monitored: 30,
    total_size: 1048576,
    ...overrides,
  };
}

function makeIssue(overrides: Partial<KapowarrIssue> = {}): KapowarrIssue {
  return {
    id: 9001,
    volume_id: 101,
    comicvine_id: 8001,
    issue_number: '1',
    calculated_issue_number: 1,
    title: 'Chapter One',
    date: '2012-03-14',
    description: 'Intro',
    monitored: true,
    files: [{ id: 1, filepath: '/c/saga-1.cbz', size: 4096 }],
    ...overrides,
  };
}

function makeDetail(overrides: Partial<KapowarrVolumeDetail> = {}): KapowarrVolumeDetail {
  return {
    ...makeVolume(),
    special_version: null,
    special_version_locked: false,
    site_url: 'https://example/saga',
    root_folder: 1,
    volume_folder: 'saga',
    issues: [makeIssue({ id: 9001, issue_number: '1', calculated_issue_number: 1 })],
    general_files: [],
    ...overrides,
  };
}

describe('Comics cache (@shelvarr/db)', () => {
  before(async () => {
    process.env['DATA_DIR'] = '/tmp/shelvarr-comics-test-' + Date.now();
    process.env['DB_PATH'] = process.env['DATA_DIR'] + '/test.db';

    const fs = await import('fs');
    fs.mkdirSync(process.env['DATA_DIR']!, { recursive: true });

    db = await import('../../lib/db/index.js');
    db.initDatabase();
  });

  after(async () => {
    if (db) db.closeDatabase();
    const fs = await import('fs');
    if (process.env['DATA_DIR']) {
      fs.rmSync(process.env['DATA_DIR'], { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    if (!db) return;
    const database = db.getDb();
    database.exec('DELETE FROM comic_issues; DELETE FROM comics;');
  });

  describe('upsertComicVolume / getCachedComic', () => {
    it('returns null for uncached comic', () => {
      assert.strictEqual(db.getCachedComic(9999), null);
    });

    it('caches and retrieves a list-level volume', () => {
      const volume = makeVolume({ id: 101, title: 'Saga' });
      db.upsertComicVolume(volume);
      const cached = db.getCachedComic(101);
      assert.ok(cached);
      assert.strictEqual(cached.id, 101);
      assert.strictEqual(cached.title, 'Saga');
      assert.strictEqual(cached.publisher, 'Image');
      assert.strictEqual(cached.monitored, true);
      assert.strictEqual(cached.issue_count, 60);
    });

    it('updates an existing comic on re-upsert', () => {
      db.upsertComicVolume(makeVolume({ id: 101, title: 'Saga' }));
      db.upsertComicVolume(makeVolume({ id: 101, title: 'Saga Deluxe', issues_downloaded: 50 }));
      const cached = db.getCachedComic(101);
      assert.strictEqual(cached?.title, 'Saga Deluxe');
      assert.strictEqual(cached?.issues_downloaded, 50);
    });

    it('preserves detail_cached_at when list upsert runs over a cached detail', () => {
      db.upsertComicDetail(makeDetail({ id: 101 }));
      db.upsertComicVolume(makeVolume({ id: 101, title: 'Saga Updated' }));
      const detail = db.getCachedComicDetail(101);
      // detail should still be retrievable because list upsert must not clear detail_cached_at
      assert.ok(detail, 'detail should remain cached after list upsert');
      assert.strictEqual(detail.title, 'Saga Updated');
    });
  });

  describe('upsertComicVolumes', () => {
    it('bulk upserts multiple volumes in a transaction', () => {
      db.upsertComicVolumes([
        makeVolume({ id: 1, title: 'A' }),
        makeVolume({ id: 2, title: 'B' }),
        makeVolume({ id: 3, title: 'C' }),
      ]);
      const all = db.getCachedComics();
      assert.strictEqual(all.length, 3);
      assert.deepStrictEqual(all.map(v => v.title).sort(), ['A', 'B', 'C']);
    });

    it('is idempotent for repeated calls', () => {
      const volumes = [makeVolume({ id: 1 }), makeVolume({ id: 2 })];
      db.upsertComicVolumes(volumes);
      db.upsertComicVolumes(volumes);
      assert.strictEqual(db.getCachedComics().length, 2);
    });
  });

  describe('getCachedComics', () => {
    it('returns empty array when no comics cached', () => {
      assert.deepStrictEqual(db.getCachedComics(), []);
    });

    it('excludes soft-deleted comics', () => {
      db.upsertComicVolume(makeVolume({ id: 1, title: 'A' }));
      db.upsertComicVolume(makeVolume({ id: 2, title: 'B' }));
      db.softDeleteComic(1);
      const all = db.getCachedComics();
      assert.strictEqual(all.length, 1);
      assert.strictEqual(all[0].id, 2);
    });

    it('orders by title', () => {
      db.upsertComicVolume(makeVolume({ id: 1, title: 'Zebra' }));
      db.upsertComicVolume(makeVolume({ id: 2, title: 'Apple' }));
      db.upsertComicVolume(makeVolume({ id: 3, title: 'Mango' }));
      const titles = db.getCachedComics().map(v => v.title);
      assert.deepStrictEqual(titles, ['Apple', 'Mango', 'Zebra']);
    });
  });

  describe('upsertComicDetail / getCachedComicDetail', () => {
    it('returns null when no detail has ever been cached', () => {
      db.upsertComicVolume(makeVolume({ id: 101 }));
      assert.strictEqual(db.getCachedComicDetail(101), null);
    });

    it('caches a full detail with issues and round-trips', () => {
      const detail = makeDetail({
        id: 101,
        issues: [
          makeIssue({ id: 1, issue_number: '1', calculated_issue_number: 1 }),
          makeIssue({ id: 2, issue_number: '2', calculated_issue_number: 2 }),
        ],
        general_files: [{ id: 1, filepath: '/c/saga.xml', size: 100, file_type: 'metadata' }],
      });
      db.upsertComicDetail(detail);
      const got = db.getCachedComicDetail(101);
      assert.ok(got);
      assert.strictEqual(got.id, 101);
      assert.strictEqual(got.issues.length, 2);
      assert.strictEqual(got.issues[0].issue_number, '1');
      assert.strictEqual(got.general_files.length, 1);
      assert.strictEqual(got.general_files[0].file_type, 'metadata');
    });

    it('persists issue files as JSON', () => {
      const detail = makeDetail({
        id: 101,
        issues: [makeIssue({ id: 1, files: [{ id: 55, filepath: '/x.cbz', size: 123 }] })],
      });
      db.upsertComicDetail(detail);
      const got = db.getCachedComicDetail(101);
      assert.strictEqual(got?.issues[0].files.length, 1);
      assert.strictEqual(got?.issues[0].files[0].filepath, '/x.cbz');
    });

    it('soft-deletes issues that are no longer in incoming detail', () => {
      db.upsertComicDetail(makeDetail({
        id: 101,
        issues: [
          makeIssue({ id: 1, issue_number: '1', calculated_issue_number: 1 }),
          makeIssue({ id: 2, issue_number: '2', calculated_issue_number: 2 }),
          makeIssue({ id: 3, issue_number: '3', calculated_issue_number: 3 }),
        ],
      }));
      db.upsertComicDetail(makeDetail({
        id: 101,
        issues: [
          makeIssue({ id: 1, issue_number: '1', calculated_issue_number: 1 }),
          makeIssue({ id: 3, issue_number: '3', calculated_issue_number: 3 }),
        ],
      }));
      const got = db.getCachedComicDetail(101);
      assert.strictEqual(got?.issues.length, 2);
      assert.deepStrictEqual(got?.issues.map(i => i.id).sort(), [1, 3]);
    });

    it('returns issues ordered by calculated_issue_number', () => {
      db.upsertComicDetail(makeDetail({
        id: 101,
        issues: [
          makeIssue({ id: 3, issue_number: '3', calculated_issue_number: 3 }),
          makeIssue({ id: 1, issue_number: '1', calculated_issue_number: 1 }),
          makeIssue({ id: 2, issue_number: '2', calculated_issue_number: 2 }),
        ],
      }));
      const got = db.getCachedComicDetail(101);
      assert.deepStrictEqual(got?.issues.map(i => i.id), [1, 2, 3]);
    });
  });

  describe('softDeleteComic', () => {
    it('hides the comic and its issues from getters', () => {
      db.upsertComicDetail(makeDetail({ id: 101, issues: [makeIssue({ id: 1 })] }));
      db.softDeleteComic(101);
      assert.strictEqual(db.getCachedComic(101), null);
      assert.strictEqual(db.getCachedComicDetail(101), null);
      assert.strictEqual(db.getCachedComics().length, 0);
    });

    it('is idempotent', () => {
      db.upsertComicVolume(makeVolume({ id: 101 }));
      db.softDeleteComic(101);
      db.softDeleteComic(101);
      assert.strictEqual(db.getCachedComic(101), null);
    });

    it('lets subsequent upsert un-delete the comic', () => {
      db.upsertComicVolume(makeVolume({ id: 101 }));
      db.softDeleteComic(101);
      db.upsertComicVolume(makeVolume({ id: 101, title: 'Revived' }));
      const cached = db.getCachedComic(101);
      assert.ok(cached);
      assert.strictEqual(cached.title, 'Revived');
    });
  });

  describe('isComicDetailStale', () => {
    it('reports stale when comic is not cached', () => {
      assert.strictEqual(db.isComicDetailStale(9999, 60), true);
    });

    it('reports stale when list-cached but no detail', () => {
      db.upsertComicVolume(makeVolume({ id: 101 }));
      assert.strictEqual(db.isComicDetailStale(101, 60), true);
    });

    it('reports fresh immediately after detail upsert', () => {
      db.upsertComicDetail(makeDetail({ id: 101 }));
      assert.strictEqual(db.isComicDetailStale(101, 60), false);
    });

    it('reports stale after forced old timestamp', () => {
      db.upsertComicDetail(makeDetail({ id: 101 }));
      const database = db.getDb();
      database.exec(`UPDATE comics SET detail_cached_at = datetime('now', '-2 hours') WHERE id = 101`);
      assert.strictEqual(db.isComicDetailStale(101, 60), true);
    });
  });
});
