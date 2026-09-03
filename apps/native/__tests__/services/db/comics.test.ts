import type { ComicVolumeSummary, ComicVolumeDetail, ComicIssueSummary } from '@shelvarr/types';
import { resetDatabase } from '../../../src/services/db/database';
import {
  getCachedComic,
  getCachedComicDetail,
  getCachedComics,
  upsertComicVolume,
  searchCachedComics,
  upsertComicVolumes,
  upsertComicDetail,
  softDeleteComic,
  isComicDetailStale,
} from '../../../src/services/db/comics';
import { _resetAllDatabases } from '../../../__mocks__/expo-sqlite';

function makeVolume(overrides: Partial<ComicVolumeSummary> = {}): ComicVolumeSummary {
  return {
    id: 1,
    slug: 'saga-2012',
    comicvine_id: 100,
    title: 'Saga',
    year: 2012,
    publisher: 'Image',
    volume_number: 1,
    description: 'Epic comic',
    monitored: true,
    monitor_new_issues: false,
    folder: '/c/saga',
    issue_count: 60,
    issue_count_monitored: 60,
    issues_downloaded: 30,
    issues_downloaded_monitored: 30,
    total_size: 1024,
    ...overrides,
  };
}

function makeIssue(overrides: Partial<ComicIssueSummary> = {}): ComicIssueSummary {
  return {
    id: 9001,
    volume_id: 1,
    comicvine_id: 8001,
    issue_number: '1',
    calculated_issue_number: 1,
    title: 'Issue 1',
    date: '2012-03-14',
    description: 'First',
    monitored: true,
    files: [{ id: 1, filepath: '/x.cbz', size: 1024 }],
    ...overrides,
  };
}

function makeDetail(overrides: Partial<ComicVolumeDetail> = {}): ComicVolumeDetail {
  return {
    ...makeVolume(),
    special_version: null,
    special_version_locked: false,
    site_url: 'https://example.com',
    root_folder: 1,
    volume_folder: 'saga',
    issues: [makeIssue()],
    general_files: [],
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDatabase();
  _resetAllDatabases();
});

describe('comics local cache', () => {
  describe('upsertComicVolume / getCachedComic', () => {
    it('returns null when not cached', async () => {
      expect(await getCachedComic(999)).toBeNull();
    });

    it('caches and retrieves a list volume', async () => {
      await upsertComicVolume(makeVolume({ id: 1, title: 'Saga' }));
      const cached = await getCachedComic(1);
      expect(cached?.id).toBe(1);
      expect(cached?.title).toBe('Saga');
      expect(cached?.monitored).toBe(true);
      expect(cached?.monitor_new_issues).toBe(false);
    });

    it('updates on re-upsert', async () => {
      await upsertComicVolume(makeVolume({ id: 1, title: 'Saga' }));
      await upsertComicVolume(makeVolume({ id: 1, title: 'Saga Deluxe' }));
      const cached = await getCachedComic(1);
      expect(cached?.title).toBe('Saga Deluxe');
    });
  });

  describe('upsertComicVolumes (bulk)', () => {
    it('inserts multiple volumes in one transaction', async () => {
      await upsertComicVolumes([
        makeVolume({ id: 1, title: 'A' }),
        makeVolume({ id: 2, title: 'B' }),
        makeVolume({ id: 3, title: 'C' }),
      ]);
      const all = await getCachedComics();
      expect(all).toHaveLength(3);
      expect(all.map((v) => v.title).sort()).toEqual(['A', 'B', 'C']);
    });
  });

  describe('getCachedComics', () => {
    it('returns empty when nothing cached', async () => {
      expect(await getCachedComics()).toEqual([]);
    });

    it('orders by title and excludes soft-deleted', async () => {
      await upsertComicVolume(makeVolume({ id: 1, title: 'Zebra' }));
      await upsertComicVolume(makeVolume({ id: 2, title: 'Apple' }));
      await upsertComicVolume(makeVolume({ id: 3, title: 'Mango' }));
      await softDeleteComic(3);
      const titles = (await getCachedComics()).map((v) => v.title);
      expect(titles).toEqual(['Apple', 'Zebra']);
    });
  });

  describe('upsertComicDetail / getCachedComicDetail', () => {
    it('returns null when no detail cached', async () => {
      await upsertComicVolume(makeVolume({ id: 1 }));
      expect(await getCachedComicDetail(1)).toBeNull();
    });

    it('round-trips a full detail with issues', async () => {
      const detail = makeDetail({
        id: 1,
        issues: [
          makeIssue({ id: 101, volume_id: 1, issue_number: '1', calculated_issue_number: 1 }),
          makeIssue({ id: 102, volume_id: 1, issue_number: '2', calculated_issue_number: 2 }),
        ],
        general_files: [{ id: 5, filepath: '/meta.xml', size: 100, file_type: 'metadata' }],
      });
      await upsertComicDetail(detail);
      const got = await getCachedComicDetail(1);
      expect(got?.id).toBe(1);
      expect(got?.issues).toHaveLength(2);
      expect(got?.issues[0].issue_number).toBe('1');
      expect(got?.issues[0].files[0].filepath).toBe('/x.cbz');
      expect(got?.general_files[0].file_type).toBe('metadata');
    });

    it('soft-deletes issues no longer present in incoming detail', async () => {
      await upsertComicDetail(makeDetail({
        id: 1,
        issues: [
          makeIssue({ id: 101, calculated_issue_number: 1 }),
          makeIssue({ id: 102, calculated_issue_number: 2 }),
          makeIssue({ id: 103, calculated_issue_number: 3 }),
        ],
      }));
      await upsertComicDetail(makeDetail({
        id: 1,
        issues: [
          makeIssue({ id: 101, calculated_issue_number: 1 }),
          makeIssue({ id: 103, calculated_issue_number: 3 }),
        ],
      }));
      const got = await getCachedComicDetail(1);
      expect(got?.issues.map((i) => i.id).sort()).toEqual([101, 103]);
    });

    it('orders issues by calculated number', async () => {
      await upsertComicDetail(makeDetail({
        id: 1,
        issues: [
          makeIssue({ id: 3, calculated_issue_number: 3 }),
          makeIssue({ id: 1, calculated_issue_number: 1 }),
          makeIssue({ id: 2, calculated_issue_number: 2 }),
        ],
      }));
      const got = await getCachedComicDetail(1);
      expect(got?.issues.map((i) => i.id)).toEqual([1, 2, 3]);
    });

    it('rolls back when a nested write throws', async () => {
      await upsertComicDetail(makeDetail({ id: 1 }));
      const bogusDetail = makeDetail({
        id: 2,
        // volume_id is NOT NULL on comic_issues — forces a constraint
        // failure inside the transaction.
        issues: [makeIssue({ id: 5000, volume_id: null as unknown as number })],
      });
      let err: unknown = null;
      try {
        await upsertComicDetail(bogusDetail);
      } catch (e) {
        err = e;
      }
      expect(err).toBeTruthy();
      expect((await getCachedComicDetail(1))?.id).toBe(1);
      expect(await getCachedComic(2)).toBeNull();
    });
  });

  describe('softDeleteComic', () => {
    it('hides comic and issues from getters', async () => {
      await upsertComicDetail(makeDetail({ id: 1 }));
      await softDeleteComic(1);
      expect(await getCachedComic(1)).toBeNull();
      expect(await getCachedComicDetail(1)).toBeNull();
      expect(await getCachedComics()).toHaveLength(0);
    });

    it('is idempotent', async () => {
      await upsertComicVolume(makeVolume({ id: 1 }));
      await softDeleteComic(1);
      await softDeleteComic(1);
      expect(await getCachedComic(1)).toBeNull();
    });

    it('upsert revives a soft-deleted comic', async () => {
      await upsertComicVolume(makeVolume({ id: 1, title: 'Original' }));
      await softDeleteComic(1);
      await upsertComicVolume(makeVolume({ id: 1, title: 'Revived' }));
      const cached = await getCachedComic(1);
      expect(cached?.title).toBe('Revived');
    });
  });

  describe('isComicDetailStale', () => {
    it('stale when never cached', async () => {
      expect(await isComicDetailStale(999, 60)).toBe(true);
    });

    it('stale when only list row is present', async () => {
      await upsertComicVolume(makeVolume({ id: 1 }));
      expect(await isComicDetailStale(1, 60)).toBe(true);
    });

    it('fresh immediately after detail upsert', async () => {
      await upsertComicDetail(makeDetail({ id: 1 }));
      expect(await isComicDetailStale(1, 60)).toBe(false);
    });

    it('stale after forced old timestamp', async () => {
      await upsertComicDetail(makeDetail({ id: 1 }));
      const { getDatabase } = require('../../../src/services/db/database');
      const db = await getDatabase();
      await db.runAsync(`UPDATE comics SET detail_cached_at = datetime('now', '-2 hours') WHERE id = ?`, [1]);
      expect(await isComicDetailStale(1, 60)).toBe(true);
    });

    it('treats Z-suffixed ISO timestamps as UTC', async () => {
      await upsertComicDetail(makeDetail({ id: 1 }));
      const { getDatabase } = require('../../../src/services/db/database');
      const db = await getDatabase();
      const future = new Date(Date.now() + 60_000).toISOString();
      await db.runAsync(`UPDATE comics SET detail_cached_at = ? WHERE id = ?`, [future, 1]);
      expect(await isComicDetailStale(1, 60)).toBe(false);
    });
  });

  describe('JSON parse fallback', () => {
    it('returns empty files array for corrupt issue JSON', async () => {
      await upsertComicDetail(makeDetail({ id: 1, issues: [makeIssue({ id: 99 })] }));
      const { getDatabase } = require('../../../src/services/db/database');
      const db = await getDatabase();
      await db.runAsync(`UPDATE comic_issues SET files = 'not-json' WHERE id = 99`);
      const got = await getCachedComicDetail(1);
      expect(got?.issues[0].files).toEqual([]);
    });

    it('returns empty general_files for corrupt JSON', async () => {
      await upsertComicDetail(makeDetail({ id: 1 }));
      const { getDatabase } = require('../../../src/services/db/database');
      const db = await getDatabase();
      await db.runAsync(`UPDATE comics SET general_files = 'not-json' WHERE id = 1`);
      const got = await getCachedComicDetail(1);
      expect(got?.general_files).toEqual([]);
    });
  });
});

describe('searchCachedComics', () => {
  it('matches on title, case-insensitively', async () => {
    await upsertComicVolumes([
      makeVolume({ id: 1, title: 'Immortal Hulk' }),
      makeVolume({ id: 2, title: 'Saga' }),
    ]);

    const results = await searchCachedComics('hulk');
    expect(results.map((v) => v.title)).toEqual(['Immortal Hulk']);
  });

  it('matches on publisher too', async () => {
    await upsertComicVolumes([
      makeVolume({ id: 1, title: 'Saga', publisher: 'Image' }),
      makeVolume({ id: 2, title: 'Hulk', publisher: 'Marvel' }),
    ]);

    const results = await searchCachedComics('marvel');
    expect(results.map((v) => v.title)).toEqual(['Hulk']);
  });

  it('returns the whole library for an empty query', async () => {
    await upsertComicVolumes([makeVolume({ id: 1 }), makeVolume({ id: 2 })]);
    expect(await searchCachedComics('   ')).toHaveLength(2);
  });

  it('treats LIKE wildcards as literal characters', async () => {
    await upsertComicVolumes([
      makeVolume({ id: 1, title: '100% Hero' }),
      makeVolume({ id: 2, title: 'Something Else' }),
    ]);

    // Without escaping, "%" would match everything.
    const results = await searchCachedComics('100%');
    expect(results.map((v) => v.title)).toEqual(['100% Hero']);
  });

  it('skips tombstoned volumes', async () => {
    await upsertComicVolumes([makeVolume({ id: 1, title: 'Saga' })]);
    await softDeleteComic(1);

    expect(await searchCachedComics('saga')).toEqual([]);
  });
});
