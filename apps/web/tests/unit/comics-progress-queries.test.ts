/**
 * Unit tests for comic read-progress queries in @shelvarr/db:
 * getInProgressComics (dedup-by-volume, most-recent-first),
 * getNextUpComics and getComicReadProgressForVolume (per-issue progress).
 *
 * All three are per-reader: on a server with accounts, one person finishing an
 * issue must not move anybody else's rows.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import type { ComicVolumeDetail, ComicIssueSummary } from '@shelvarr/types';

let db: typeof import('../../lib/db/index.js');

function makeIssue(overrides: Partial<ComicIssueSummary> = {}): ComicIssueSummary {
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

function makeDetail(id: number, issues: ComicIssueSummary[]): ComicVolumeDetail {
  return {
    id,
    comicvine_id: 5000 + id,
    title: `Volume ${id}`,
    year: 2012,
    publisher: 'Image',
    volume_number: 1,
    description: '',
    monitored: true,
    monitor_new_issues: false,
    folder: `/comics/${id}`,
    issue_count: issues.length,
    issue_count_monitored: issues.length,
    issues_downloaded: issues.length,
    issues_downloaded_monitored: issues.length,
    total_size: 1024,
    special_version: null,
    special_version_locked: false,
    site_url: '',
    root_folder: 1,
    volume_folder: String(id),
    issues,
    general_files: [],
  };
}

// A signed-in reader. Everything below is their shelf unless stated.
const READER = 7;
const OTHER_READER = 8;

/** Force a deterministic updated_at so ordering assertions are stable. */
function setProgressTime(issueId: number, iso: string, userId = READER) {
  db.getDb()
    .prepare('UPDATE comic_read_progress SET updated_at = ? WHERE issue_id = ? AND user_id = ?')
    .run(iso, issueId, userId);
}

describe('Comic progress queries (@shelvarr/db)', () => {
  before(async () => {
    process.env['DATA_DIR'] = '/tmp/shelvarr-comic-progress-test-' + Date.now();
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
    const database = db.getDb();
    database.exec('DELETE FROM comic_read_progress; DELETE FROM comic_issues; DELETE FROM comics;');
  });

  describe('getComicReadProgressForVolume', () => {
    it('returns empty array when nothing is tracked', () => {
      db.upsertComicDetail(makeDetail(101, [makeIssue({ id: 1, volume_id: 101 })]));
      assert.deepStrictEqual(db.getComicReadProgressForVolume(READER, 101), []);
    });

    it('returns per-issue progress with completed as a boolean', () => {
      db.upsertComicDetail(makeDetail(101, [
        makeIssue({ id: 1, volume_id: 101 }),
        makeIssue({ id: 2, volume_id: 101, issue_number: '2', calculated_issue_number: 2 }),
      ]));
      db.upsertComicReadProgress(READER, 1, 5, false, 20);
      db.upsertComicReadProgress(READER, 2, 20, true, 20);

      const rows = db.getComicReadProgressForVolume(READER, 101);
      const byId = new Map(rows.map((r) => [r.issueId, r]));
      assert.strictEqual(rows.length, 2);
      assert.strictEqual(byId.get(1)?.completed, false);
      assert.strictEqual(byId.get(1)?.page, 5);
      assert.strictEqual(byId.get(1)?.total, 20);
      assert.strictEqual(byId.get(2)?.completed, true);
    });

    it('does not leak progress from another reader', () => {
      db.upsertComicDetail(makeDetail(101, [makeIssue({ id: 1, volume_id: 101 })]));
      db.upsertComicReadProgress(OTHER_READER, 1, 9, false, 20);

      assert.deepStrictEqual(db.getComicReadProgressForVolume(READER, 101), []);
      assert.strictEqual(db.getComicReadProgressForVolume(OTHER_READER, 101).length, 1);
    });

    it('does not leak progress from other volumes', () => {
      db.upsertComicDetail(makeDetail(101, [makeIssue({ id: 1, volume_id: 101 })]));
      db.upsertComicDetail(makeDetail(202, [makeIssue({ id: 2, volume_id: 202 })]));
      db.upsertComicReadProgress(READER, 1, 3, false, 10);
      db.upsertComicReadProgress(READER, 2, 4, false, 10);

      const rows = db.getComicReadProgressForVolume(READER, 101);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].issueId, 1);
    });
  });

  describe('getInProgressComics', () => {
    it('returns empty when nothing is in progress', () => {
      db.upsertComicDetail(makeDetail(101, [makeIssue({ id: 1, volume_id: 101 })]));
      assert.deepStrictEqual(db.getInProgressComics(READER, 10), []);
    });

    it('excludes completed issues and issues at page 0', () => {
      db.upsertComicDetail(makeDetail(101, [
        makeIssue({ id: 1, volume_id: 101 }),
        makeIssue({ id: 2, volume_id: 101, issue_number: '2', calculated_issue_number: 2 }),
      ]));
      db.upsertComicReadProgress(READER, 1, 20, true, 20); // completed -> excluded
      db.upsertComicReadProgress(READER, 2, 0, false, 20); // page 0 -> excluded
      assert.deepStrictEqual(db.getInProgressComics(READER, 10), []);
    });

    it('surfaces an in-progress volume with resume info', () => {
      db.upsertComicDetail(makeDetail(101, [
        makeIssue({ id: 1, volume_id: 101, issue_number: '3', calculated_issue_number: 3 }),
      ]));
      db.upsertComicReadProgress(READER, 1, 7, false, 22);

      const result = db.getInProgressComics(READER, 10);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].volume.id, 101);
      assert.strictEqual(result[0].issueId, 1);
      assert.strictEqual(result[0].issueNumber, '3');
      assert.strictEqual(result[0].page, 7);
      assert.strictEqual(result[0].total, 22);
    });

    it('returns one entry per volume, carrying the most recently read issue', () => {
      db.upsertComicDetail(makeDetail(101, [
        makeIssue({ id: 1, volume_id: 101, issue_number: '1', calculated_issue_number: 1 }),
        makeIssue({ id: 2, volume_id: 101, issue_number: '2', calculated_issue_number: 2 }),
      ]));
      db.upsertComicReadProgress(READER, 1, 3, false, 20);
      db.upsertComicReadProgress(READER, 2, 8, false, 20);
      setProgressTime(1, '2024-01-01 10:00:00');
      setProgressTime(2, '2024-01-02 10:00:00'); // more recent

      const result = db.getInProgressComics(READER, 10);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].volume.id, 101);
      assert.strictEqual(result[0].issueId, 2, 'should carry the most recently read issue');
    });

    it('orders volumes by most recent progress and respects the limit', () => {
      db.upsertComicDetail(makeDetail(101, [makeIssue({ id: 1, volume_id: 101 })]));
      db.upsertComicDetail(makeDetail(202, [makeIssue({ id: 2, volume_id: 202 })]));
      db.upsertComicDetail(makeDetail(303, [makeIssue({ id: 3, volume_id: 303 })]));
      db.upsertComicReadProgress(READER, 1, 2, false, 20);
      db.upsertComicReadProgress(READER, 2, 2, false, 20);
      db.upsertComicReadProgress(READER, 3, 2, false, 20);
      setProgressTime(1, '2024-01-01 10:00:00');
      setProgressTime(2, '2024-01-03 10:00:00');
      setProgressTime(3, '2024-01-02 10:00:00');

      const ordered = db.getInProgressComics(READER, 10).map((c) => c.volume.id);
      assert.deepStrictEqual(ordered, [202, 303, 101]);

      const limited = db.getInProgressComics(READER, 2).map((c) => c.volume.id);
      assert.deepStrictEqual(limited, [202, 303]);
    });

    it('excludes soft-deleted volumes', () => {
      db.upsertComicDetail(makeDetail(101, [makeIssue({ id: 1, volume_id: 101 })]));
      db.upsertComicReadProgress(READER, 1, 5, false, 20);
      db.softDeleteComic(101);
      assert.deepStrictEqual(db.getInProgressComics(READER, 10), []);
    });

    it("does not surface another reader's volume", () => {
      db.upsertComicDetail(makeDetail(101, [makeIssue({ id: 1, volume_id: 101 })]));
      db.upsertComicReadProgress(OTHER_READER, 1, 5, false, 20);

      assert.deepStrictEqual(db.getInProgressComics(READER, 10), []);
      assert.strictEqual(db.getInProgressComics(OTHER_READER, 10).length, 1);
    });
  });

  describe('getNextUpComics', () => {
    it('returns empty when no issue has been finished', () => {
      db.upsertComicDetail(makeDetail(101, [
        makeIssue({ id: 1, volume_id: 101, issue_number: '1', calculated_issue_number: 1 }),
        makeIssue({ id: 2, volume_id: 101, issue_number: '2', calculated_issue_number: 2 }),
      ]));
      db.upsertComicReadProgress(READER, 1, 5, false, 20); // in progress, not finished
      assert.deepStrictEqual(db.getNextUpComics(READER, 10), []);
    });

    it('surfaces the next downloaded unread issue after a finished one', () => {
      db.upsertComicDetail(makeDetail(101, [
        makeIssue({ id: 1, volume_id: 101, issue_number: '1', calculated_issue_number: 1 }),
        makeIssue({ id: 2, volume_id: 101, issue_number: '2', calculated_issue_number: 2 }),
      ]));
      db.upsertComicReadProgress(READER, 1, 20, true, 20); // finished #1

      const result = db.getNextUpComics(READER, 10);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].volume.id, 101);
      assert.strictEqual(result[0].issueId, 2, 'points at the next issue');
      assert.strictEqual(result[0].issueNumber, '2');
    });

    it('picks the lowest-numbered unread issue above the last finished', () => {
      db.upsertComicDetail(makeDetail(101, [
        makeIssue({ id: 1, volume_id: 101, issue_number: '1', calculated_issue_number: 1 }),
        makeIssue({ id: 2, volume_id: 101, issue_number: '2', calculated_issue_number: 2 }),
        makeIssue({ id: 3, volume_id: 101, issue_number: '3', calculated_issue_number: 3 }),
      ]));
      db.upsertComicReadProgress(READER, 1, 20, true, 20);
      db.upsertComicReadProgress(READER, 2, 20, true, 20); // #1 and #2 finished

      const result = db.getNextUpComics(READER, 10);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].issueId, 3);
    });

    it('excludes volumes with an issue in progress (they belong in In Progress)', () => {
      db.upsertComicDetail(makeDetail(101, [
        makeIssue({ id: 1, volume_id: 101, issue_number: '1', calculated_issue_number: 1 }),
        makeIssue({ id: 2, volume_id: 101, issue_number: '2', calculated_issue_number: 2 }),
      ]));
      db.upsertComicReadProgress(READER, 1, 20, true, 20); // finished #1
      db.upsertComicReadProgress(READER, 2, 4, false, 20); // mid-read #2
      assert.deepStrictEqual(db.getNextUpComics(READER, 10), []);
    });

    it('surfaces the next issue even when it is not downloaded', () => {
      db.upsertComicDetail(makeDetail(101, [
        makeIssue({ id: 1, volume_id: 101, issue_number: '1', calculated_issue_number: 1 }),
        makeIssue({ id: 2, volume_id: 101, issue_number: '2', calculated_issue_number: 2, files: [] }),
      ]));
      db.upsertComicReadProgress(READER, 1, 20, true, 20);

      const result = db.getNextUpComics(READER, 10);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].issueId, 2);
    });

    it('returns nothing once every issue is finished', () => {
      db.upsertComicDetail(makeDetail(101, [
        makeIssue({ id: 1, volume_id: 101, issue_number: '1', calculated_issue_number: 1 }),
      ]));
      db.upsertComicReadProgress(READER, 1, 20, true, 20);
      assert.deepStrictEqual(db.getNextUpComics(READER, 10), []);
    });

    it('orders by most-recently-finished and respects the limit', () => {
      db.upsertComicDetail(makeDetail(101, [
        makeIssue({ id: 1, volume_id: 101, issue_number: '1', calculated_issue_number: 1 }),
        makeIssue({ id: 11, volume_id: 101, issue_number: '2', calculated_issue_number: 2 }),
      ]));
      db.upsertComicDetail(makeDetail(202, [
        makeIssue({ id: 2, volume_id: 202, issue_number: '1', calculated_issue_number: 1 }),
        makeIssue({ id: 22, volume_id: 202, issue_number: '2', calculated_issue_number: 2 }),
      ]));
      db.upsertComicReadProgress(READER, 1, 20, true, 20);
      db.upsertComicReadProgress(READER, 2, 20, true, 20);
      setProgressTime(1, '2024-01-01 10:00:00');
      setProgressTime(2, '2024-01-05 10:00:00'); // 202 finished more recently

      const ordered = db.getNextUpComics(READER, 10).map((c) => c.volume.id);
      assert.deepStrictEqual(ordered, [202, 101]);

      const limited = db.getNextUpComics(READER, 1).map((c) => c.volume.id);
      assert.deepStrictEqual(limited, [202]);
    });

    it('excludes soft-deleted volumes', () => {
      db.upsertComicDetail(makeDetail(101, [
        makeIssue({ id: 1, volume_id: 101, issue_number: '1', calculated_issue_number: 1 }),
        makeIssue({ id: 2, volume_id: 101, issue_number: '2', calculated_issue_number: 2 }),
      ]));
      db.upsertComicReadProgress(READER, 1, 20, true, 20);
      db.softDeleteComic(101);
      assert.deepStrictEqual(db.getNextUpComics(READER, 10), []);
    });

    it('points each reader at their own next issue', () => {
      db.upsertComicDetail(makeDetail(101, [
        makeIssue({ id: 1, volume_id: 101, issue_number: '1', calculated_issue_number: 1 }),
        makeIssue({ id: 2, volume_id: 101, issue_number: '2', calculated_issue_number: 2 }),
        makeIssue({ id: 3, volume_id: 101, issue_number: '3', calculated_issue_number: 3 }),
      ]));
      db.upsertComicReadProgress(READER, 1, 20, true, 20); // READER finished #1
      db.upsertComicReadProgress(OTHER_READER, 1, 20, true, 20);
      db.upsertComicReadProgress(OTHER_READER, 2, 20, true, 20); // they finished #2 too

      assert.strictEqual(db.getNextUpComics(READER, 10)[0]?.issueId, 2);
      assert.strictEqual(db.getNextUpComics(OTHER_READER, 10)[0]?.issueId, 3);
    });

    it("is not blocked by another reader's issue in progress", () => {
      db.upsertComicDetail(makeDetail(101, [
        makeIssue({ id: 1, volume_id: 101, issue_number: '1', calculated_issue_number: 1 }),
        makeIssue({ id: 2, volume_id: 101, issue_number: '2', calculated_issue_number: 2 }),
      ]));
      db.upsertComicReadProgress(READER, 1, 20, true, 20);
      db.upsertComicReadProgress(OTHER_READER, 2, 4, false, 20); // mid-read, but not ours

      assert.strictEqual(db.getNextUpComics(READER, 10)[0]?.issueId, 2);
    });
  });
});
