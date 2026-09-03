/**
 * Comic acquisition persistence and import: the download queue, blocklist,
 * history, and moving a finished file into the library.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import type { ComicVolumeDetail, ComicIssueSummary } from '@shelvarr/types';

let db: typeof import('../../lib/db/index.js');
let dataDir: string;

function makeIssue(overrides: Partial<ComicIssueSummary> = {}): ComicIssueSummary {
  return {
    id: 9001,
    volume_id: 501,
    comicvine_id: 8001,
    issue_number: '1',
    calculated_issue_number: 1,
    title: 'Chapter One',
    date: '2018-06-13',
    description: '',
    monitored: true,
    files: [],
    ...overrides,
  };
}

function makeVolume(issues: ComicIssueSummary[]): ComicVolumeDetail {
  return {
    id: 501,
    comicvine_id: 5501,
    title: 'Immortal Hulk',
    year: 2018,
    publisher: 'Marvel',
    volume_number: 1,
    description: '',
    monitored: true,
    monitor_new_issues: false,
    folder: '/comics-source/Immortal Hulk',
    issue_count: issues.length,
    issue_count_monitored: issues.length,
    issues_downloaded: 0,
    issues_downloaded_monitored: 0,
    total_size: 0,
    special_version: null,
    special_version_locked: false,
    site_url: '',
    root_folder: 1,
    volume_folder: 'Immortal Hulk',
    issues,
    general_files: [],
  };
}

describe('Comic acquisition', () => {
  before(async () => {
    dataDir = '/tmp/shelvarr-comic-acq-test-' + Date.now();
    process.env['DATA_DIR'] = dataDir;
    process.env['DB_PATH'] = join(dataDir, 'test.db');
    mkdirSync(dataDir, { recursive: true });

    db = await import('../../lib/db/index.js');
    db.initDatabase();
  });

  after(() => {
    if (db) db.closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    db.getDb().exec(
      'DELETE FROM comic_downloads; DELETE FROM comic_blocklist; DELETE FROM comic_download_history; DELETE FROM comic_issues; DELETE FROM comics;'
    );
  });

  describe('download queue', () => {
    beforeEach(() => {
      db.upsertComicDetail(makeVolume([makeIssue()]));
    });

    it('queues a download and reads it back', () => {
      const created = db.addComicDownload({
        volumeId: 501,
        issueId: 9001,
        coveredIssues: 1,
        host: 'getcomics',
        downloadLink: 'http://getcomics.org/dls/A',
        webLink: 'https://getcomics.org/marvel/immortal-hulk-1/',
        webTitle: 'Immortal Hulk #1 (2018)',
        webSubTitle: 'Immortal Hulk #1',
        filenameBody: 'Immortal Hulk (2018) Volume 01 Issue 001',
      });

      assert.strictEqual(created.state, 'queued');
      assert.strictEqual(created.coveredIssues, 1);

      const fetched = db.getComicDownload(created.id);
      assert.strictEqual(fetched?.downloadLink, 'http://getcomics.org/dls/A');
      assert.strictEqual(fetched?.host, 'getcomics');
    });

    it('round-trips a covered issue range', () => {
      const created = db.addComicDownload({
        volumeId: 501,
        coveredIssues: [1, 25],
        host: 'pixeldrain',
        downloadLink: 'http://getcomics.org/dls/B',
      });
      assert.deepStrictEqual(db.getComicDownload(created.id)?.coveredIssues, [1, 25]);
    });

    it('reports a link as active only while it is unfinished', () => {
      const created = db.addComicDownload({
        volumeId: 501,
        host: 'getcomics',
        downloadLink: 'http://getcomics.org/dls/C',
      });
      assert.ok(db.isComicDownloadActive('http://getcomics.org/dls/C'));

      db.setComicDownloadState(created.id, 'completed', { filePath: '/x/y.cbz' });
      assert.ok(!db.isComicDownloadActive('http://getcomics.org/dls/C'));
      assert.ok(!db.isComicDownloadActive('http://getcomics.org/dls/never-seen'));
    });

    it('records progress and a completion timestamp', () => {
      const created = db.addComicDownload({
        volumeId: 501,
        host: 'getcomics',
        downloadLink: 'http://getcomics.org/dls/D',
      });

      db.updateComicDownloadProgress(created.id, 1_048_576, 47_425_974);
      let row = db.getComicDownload(created.id)!;
      assert.strictEqual(row.progress, 1_048_576);
      assert.strictEqual(row.size, 47_425_974);
      assert.strictEqual(row.completedAt, null);

      db.setComicDownloadState(created.id, 'completed', { filePath: '/x/y.cbz' });
      row = db.getComicDownload(created.id)!;
      assert.strictEqual(row.state, 'completed');
      assert.ok(row.completedAt);
    });

    it('keeps the size when a later progress update does not know it', () => {
      const created = db.addComicDownload({
        volumeId: 501,
        host: 'getcomics',
        downloadLink: 'http://getcomics.org/dls/E',
      });
      db.updateComicDownloadProgress(created.id, 10, 500);
      db.updateComicDownloadProgress(created.id, 20, null);
      assert.strictEqual(db.getComicDownload(created.id)?.size, 500);
    });

    it('filters the queue by state and volume', () => {
      const a = db.addComicDownload({ volumeId: 501, host: 'getcomics', downloadLink: 'link-a' });
      db.addComicDownload({ volumeId: 501, host: 'getcomics', downloadLink: 'link-b' });
      db.setComicDownloadState(a.id, 'failed', { error: 'nope' });

      assert.strictEqual(db.getComicDownloads({ state: 'queued' }).length, 1);
      assert.strictEqual(db.getComicDownloads({ state: 'failed' }).length, 1);
      assert.strictEqual(db.getComicDownloads({ volumeId: 501 }).length, 2);
      assert.strictEqual(db.getComicDownloads({ volumeId: 999 }).length, 0);
    });

    it('goes away with its volume', () => {
      db.addComicDownload({ volumeId: 501, host: 'getcomics', downloadLink: 'link-c' });
      db.getDb().prepare('DELETE FROM comics WHERE id = ?').run(501);
      assert.strictEqual(db.getComicDownloads({}).length, 0);
    });
  });

  describe('blocklist', () => {
    it('records and finds a blocked link', () => {
      db.addToComicBlocklist({
        downloadLink: 'http://getcomics.org/dls/dead',
        reason: 'link-broken',
      });
      assert.ok(db.comicBlocklistContains('http://getcomics.org/dls/dead'));
      assert.ok(!db.comicBlocklistContains('http://getcomics.org/dls/alive'));
    });

    it('updates rather than duplicates on re-block', () => {
      db.addToComicBlocklist({ downloadLink: 'dupe', reason: 'link-broken' });
      db.addToComicBlocklist({ downloadLink: 'dupe', reason: 'added-by-user' });

      const entries = db.getComicBlocklist();
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0]!.reason, 'added-by-user');
    });

    it('removes one entry or empties the list', () => {
      db.addToComicBlocklist({ downloadLink: 'one', reason: 'link-broken' });
      db.addToComicBlocklist({ downloadLink: 'two', reason: 'link-broken' });

      const [first] = db.getComicBlocklist();
      assert.ok(db.removeFromComicBlocklist(first!.id));
      assert.strictEqual(db.getComicBlocklist().length, 1);

      assert.strictEqual(db.clearComicBlocklist(), 1);
      assert.strictEqual(db.getComicBlocklist().length, 0);
    });
  });

  describe('history', () => {
    it('records successes and failures newest-first', () => {
      db.upsertComicDetail(makeVolume([makeIssue()]));
      db.addComicDownloadHistory({
        volumeId: 501,
        fileTitle: 'first.cbz',
        host: 'getcomics',
        success: true,
      });
      db.addComicDownloadHistory({ volumeId: 501, host: 'pixeldrain', success: false });

      const history = db.getComicDownloadHistory(10, 501);
      assert.strictEqual(history.length, 2);
      assert.strictEqual(db.getComicDownloadHistory(10, 999).length, 0);
    });
  });

  describe('GetComics source toggle', () => {
    let getcomics: typeof import('@shelvarr/services/comics/getcomics/index');

    before(async () => {
      getcomics = await import('@shelvarr/services/comics/getcomics/index');
    });

    beforeEach(() => {
      db.getDb().exec('DELETE FROM download_source_config;');
    });

    it('is enabled when nothing has been configured', () => {
      assert.strictEqual(getcomics.isGetComicsEnabled(), true);
    });

    it('follows the download source config', () => {
      db.upsertDownloadSourceConfig('getcomics', false);
      assert.strictEqual(getcomics.isGetComicsEnabled(), false);

      db.upsertDownloadSourceConfig('getcomics', true);
      assert.strictEqual(getcomics.isGetComicsEnabled(), true);
    });

    it('makes auto search a no-op while disabled', async () => {
      db.upsertDownloadSourceConfig('getcomics', false);

      // Returns before the volume is even loaded, so the missing volume 501
      // would otherwise have thrown.
      const result = await getcomics.autoSearchVolume(501);
      assert.deepStrictEqual(result, { downloads: [], failed: [] });
    });

    it('refuses a manual search while disabled', async () => {
      db.upsertDownloadSourceConfig('getcomics', false);

      await assert.rejects(getcomics.searchVolume(501), /disabled/i);
      await assert.rejects(getcomics.searchPosts('immortal hulk'), /disabled/i);
    });
  });

  describe('getComicVolumeForMatching', () => {
    it('shapes a volume and its issues for the matcher', () => {
      db.upsertComicDetail(
        makeVolume([
          makeIssue({ id: 9001, calculated_issue_number: 1, date: '2018-06-13' }),
          makeIssue({
            id: 9002,
            calculated_issue_number: 2,
            date: '2018-07-11',
            files: [{ id: 1, filepath: '/comics-source/hulk-2.cbz', size: 100 }],
          }),
        ])
      );

      const loaded = db.getComicVolumeForMatching(501)!;
      assert.strictEqual(loaded.volume.title, 'Immortal Hulk');
      assert.strictEqual(loaded.volume.year, 2018);
      assert.strictEqual(loaded.volume.monitored, true);
      assert.strictEqual(loaded.issues.length, 2);
      assert.strictEqual(loaded.issues[0]!.year, 2018);
      assert.strictEqual(loaded.issues[0]!.hasFile, false);
      assert.strictEqual(loaded.issues[1]!.hasFile, true);
    });

    it('returns null for a volume that is not there', () => {
      assert.strictEqual(db.getComicVolumeForMatching(4242), null);
    });
  });
});

describe('Comic download import', () => {
  let root: string;
  let importer: typeof import('@shelvarr/services/comics/import');

  const volume = {
    title: 'Immortal Hulk',
    year: 2018,
    volumeNumber: 1,
    specialVersion: null,
    publisher: 'Marvel',
  };

  /** Rebuild the whole app config; `libraryRoot: null` exercises the no-destination path. */
  async function configure(comicLibraryRoot: string | null) {
    const { initServiceConfig } = await import('@shelvarr/services');
    initServiceConfig({
      env: 'test',
      port: 3000,
      dataDir: root,
      libraryRoot: root,
      dbPath: join(root, 'db.sqlite'),
      komga: { url: null, apiKey: null },
      comicMigration: { pathMap: null },
      getcomics: {
        baseUrl: 'https://getcomics.org',
        downloadDir: join(root, 'downloads'),
        libraryRoot: comicLibraryRoot,
        hostPreference: ['getcomics', 'pixeldrain'],
        renameDownloadedFiles: true,
      },
      audiletome: { url: null, apiKey: null },
      supportedExtensions: ['.cbz'],
      rateLimits: { hardcover: 60 },
      hardcoverToken: null,
    });
  }

  before(async () => {
    root = '/tmp/shelvarr-comic-import-test-' + Date.now();
    mkdirSync(root, { recursive: true });
    await configure(join(root, 'library'));
    importer = await import('@shelvarr/services/comics/import');
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  function scratchFile(name: string, contents = 'comic-bytes'): string {
    const dir = join(root, 'downloads');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, name);
    writeFileSync(path, contents);
    return path;
  }

  it('renames the file and files it under the library root', async () => {
    const source = scratchFile('raw-download-1.cbz');
    const result = await importer.importComicDownload(
      { filenameBody: 'Immortal Hulk (2018) Volume 01 Issue 005' },
      source,
      { ...volume, folder: null }
    );

    assert.strictEqual(
      result.path,
      join(root, 'library', 'Immortal Hulk', 'Volume 01 (2018)', 'Immortal Hulk (2018) Volume 01 Issue 005.cbz')
    );
    assert.ok(existsSync(result.path));
    assert.ok(!existsSync(source), 'the scratch file should have been moved, not copied');
    assert.strictEqual(readFileSync(result.path, 'utf8'), 'comic-bytes');
    assert.strictEqual(result.renamed, true);
  });

  it("prefers the volume's existing folder over the template", async () => {
    const source = scratchFile('raw-download-2.cbz');
    const folder = join(root, 'existing-volume-folder');

    const result = await importer.importComicDownload(
      { filenameBody: 'Immortal Hulk (2018) Volume 01 Issue 006' },
      source,
      { ...volume, folder }
    );

    assert.strictEqual(
      result.path,
      join(folder, 'Immortal Hulk (2018) Volume 01 Issue 006.cbz')
    );
  });

  it('keeps the original name when renaming is off for this download', async () => {
    const source = scratchFile('Some Scene Release 007.cbz');
    const result = await importer.importComicDownload(
      { filenameBody: null },
      source,
      { ...volume, folder: join(root, 'noname') }
    );

    assert.ok(result.path.endsWith('Some Scene Release 007.cbz'));
    assert.strictEqual(result.renamed, false);
  });

  it('never overwrites a file that is already there', async () => {
    const folder = join(root, 'collide');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'Dupe.cbz'), 'original');

    const result = await importer.importComicDownload(
      { filenameBody: 'Dupe' },
      scratchFile('raw-download-3.cbz', 'replacement'),
      { ...volume, folder }
    );

    assert.strictEqual(result.path, join(folder, 'Dupe (2).cbz'));
    assert.strictEqual(readFileSync(join(folder, 'Dupe.cbz'), 'utf8'), 'original');
  });

  it('fails loudly when the downloaded file has gone missing', async () => {
    await assert.rejects(
      () =>
        importer.importComicDownload({ filenameBody: 'x' }, join(root, 'downloads', 'gone.cbz'), {
          ...volume,
          folder: root,
        }),
      /missing/
    );
  });

  it('refuses to guess a destination when there is nowhere to put the file', async () => {
    await configure(null);
    try {
      assert.throws(
        () => importer.resolveImportTarget({ ...volume, folder: null }, 'x.cbz'),
        /COMIC_LIBRARY_ROOT/,
        'expected the error to name the setting that would fix it'
      );
    } finally {
      await configure(join(root, 'library'));
    }
  });
});
