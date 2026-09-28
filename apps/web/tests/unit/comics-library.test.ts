/**
 * Owning the comic library: ComicVine metadata, root folders, disk scanning,
 * renaming, and adopting an existing folder tree.
 */

import { describe, it, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ComicIssueMetadata, ComicVolumeMetadata } from '@shelvarr/types';

let db: typeof import('../../lib/db/index.js');
let root: string;

// ---------------------------------------------------------------------------
// ComicVine client
// ---------------------------------------------------------------------------

describe('ComicVine client', () => {
  const originalFetch = global.fetch;
  let cv: typeof import('@shelvarr/services/comics/comicvine/index');

  before(async () => {
    cv = await import('@shelvarr/services/comics/comicvine/index');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function cvResponse(body: Record<string, unknown>) {
    return new Response(JSON.stringify({ status_code: 1, error: 'OK', ...body }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const VOLUME_RESULT = {
    id: 42821,
    name: 'Immortal Hulk',
    deck: 'Volume 1 of the ongoing series.',
    start_year: '2018',
    description: '<p>Bruce Banner is alive.</p><h2>Collected Editions</h2><ul><li>Vol 1</li></ul>',
    image: { small_url: 'https://comicvine.example/cover.jpg' },
    publisher: { name: 'Marvel' },
    site_detail_url: 'https://comicvine.example/immortal-hulk/',
    aliases: 'The Immortal Hulk\r\nHulk (2018)',
    count_of_issues: 50,
  };

  const ISSUE_RESULT = {
    id: 700001,
    volume: { id: 42821 },
    issue_number: '3',
    name: 'The Hulk Is Not a Monster',
    cover_date: '2018-08-15',
    store_date: '2018-08-01',
    description: '<p>Issue three.</p>',
  };

  describe('id normalisation', () => {
    it('accepts every form a ComicVine id comes in', () => {
      assert.strictEqual(cv.toFullComicVineId(42821), '4050-42821');
      assert.strictEqual(cv.toFullComicVineId('4050-42821'), '4050-42821');
      assert.strictEqual(cv.toFullComicVineId('cv:42821'), '4050-42821');
      assert.strictEqual(cv.toComicVineId('4050-42821'), '42821');
    });

    it('rejects something that is not an id', () => {
      assert.throws(() => cv.toFullComicVineId('immortal hulk'), /No ComicVine volume/);
    });
  });

  describe('cleanDescription', () => {
    it('drops images and empty paragraphs', () => {
      const cleaned = cv.cleanDescription(
        '<figure><img src="x.jpg"></figure><p>  </p><p>Real text.</p>'
      );
      assert.strictEqual(cleaned, '<p>Real text.</p>');
    });

    it('cuts the boilerplate that follows the first heading', () => {
      const cleaned = cv.cleanDescription('<p>Story.</p><h2>Collected</h2><ul><li>a</li></ul>');
      assert.strictEqual(cleaned, '<p>Story.</p>');
    });

    it('keeps headings and lists in the short form', () => {
      const cleaned = cv.cleanDescription('<p>Story.</p><h2>Collected</h2>', true);
      assert.ok(cleaned.includes('<h2>'));
    });

    it('absolutises site-relative links', () => {
      const cleaned = cv.cleanDescription('<p><a href="/hulk/">Hulk</a></p>');
      assert.ok(cleaned.includes('href="https://comicvine.gamespot.com/hulk/"'));
    });

    it('handles a missing description', () => {
      assert.strictEqual(cv.cleanDescription(null), '');
    });
  });

  describe('fetchVolume', () => {
    it('maps a volume and its issues', async () => {
      global.fetch = mock.fn(async (url: URL | string) => {
        const href = String(url);
        if (href.includes('/volume/')) return cvResponse({ results: VOLUME_RESULT });
        return cvResponse({ results: [ISSUE_RESULT], number_of_total_results: 1 });
      }) as unknown as typeof fetch;

      const client = new cv.ComicVine({ apiKey: 'key' });
      const volume = await client.fetchVolume(42821);

      assert.strictEqual(volume.comicvineId, 42821);
      assert.strictEqual(volume.title, 'Immortal Hulk');
      assert.strictEqual(volume.year, 2018);
      assert.strictEqual(volume.volumeNumber, 1);
      assert.strictEqual(volume.publisher, 'Marvel');
      assert.strictEqual(volume.issueCount, 50);
      assert.deepStrictEqual(volume.aliases, ['The Immortal Hulk', 'Hulk (2018)']);
      assert.strictEqual(volume.coverLink, 'https://comicvine.example/cover.jpg');

      const issue = volume.issues![0]!;
      assert.strictEqual(issue.comicvineId, 700001);
      assert.strictEqual(issue.issueNumber, '3');
      assert.strictEqual(issue.calculatedIssueNumber, 3);
      assert.strictEqual(issue.date, '2018-08-15');
    });

    it('honours the store_date preference', async () => {
      global.fetch = mock.fn(async (url: URL | string) =>
        String(url).includes('/volume/')
          ? cvResponse({ results: VOLUME_RESULT })
          : cvResponse({ results: [ISSUE_RESULT], number_of_total_results: 1 })
      ) as unknown as typeof fetch;

      const client = new cv.ComicVine({ apiKey: 'key', dateType: 'store_date' });
      const volume = await client.fetchVolume(42821);
      assert.strictEqual(volume.issues![0]!.date, '2018-08-01');
    });

    it('sends the api key and field list', async () => {
      let firstUrl = '';
      global.fetch = mock.fn(async (url: URL | string) => {
        if (!firstUrl) firstUrl = String(url);
        return String(url).includes('/volume/')
          ? cvResponse({ results: VOLUME_RESULT })
          : cvResponse({ results: [], number_of_total_results: 0 });
      }) as unknown as typeof fetch;

      await new cv.ComicVine({ apiKey: 'secret' }).fetchVolume(42821);
      assert.ok(firstUrl.includes('api_key=secret'));
      assert.ok(firstUrl.includes('format=json'));
      assert.ok(firstUrl.includes('field_list='));
    });
  });

  describe('error handling', () => {
    it('maps status_code 100 to an invalid-key error', async () => {
      global.fetch = mock.fn(async () =>
        new Response(JSON.stringify({ status_code: 100, error: 'Invalid API Key' }), {
          status: 200,
        })
      ) as unknown as typeof fetch;

      await assert.rejects(
        () => new cv.ComicVine({ apiKey: 'bad' }).searchVolumes('hulk'),
        cv.InvalidComicVineApiKeyError
      );
    });

    it('maps status_code 107 to a rate-limit error', async () => {
      global.fetch = mock.fn(async () =>
        new Response(JSON.stringify({ status_code: 107, error: 'Rate limited' }), { status: 200 })
      ) as unknown as typeof fetch;

      await assert.rejects(
        () => new cv.ComicVine({ apiKey: 'key' }).searchVolumes('hulk'),
        cv.ComicVineRateLimitError
      );
    });

    it('treats an HTML throttle page as a rate limit', async () => {
      global.fetch = mock.fn(async () =>
        new Response('<html>Too many requests</html>', { status: 200 })
      ) as unknown as typeof fetch;

      await assert.rejects(
        () => new cv.ComicVine({ apiKey: 'key' }).searchVolumes('hulk'),
        cv.ComicVineRateLimitError
      );
    });

    it('does not mistake a network failure for a rate limit', async () => {
      global.fetch = mock.fn(async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch;

      await assert.rejects(() => new cv.ComicVine({ apiKey: 'key' }).searchVolumes('hulk'), {
        name: 'Error',
        message: /ComicVine request failed: fetch failed/,
      });
    });

    it('refuses to construct without a key', () => {
      assert.throws(() => new cv.ComicVine({ apiKey: '' }), cv.InvalidComicVineApiKeyError);
    });
  });

  describe('searchVolumes', () => {
    it('fetches directly when the query is an id', async () => {
      let path = '';
      global.fetch = mock.fn(async (url: URL | string) => {
        path = new URL(String(url)).pathname;
        return cvResponse({ results: VOLUME_RESULT });
      }) as unknown as typeof fetch;

      const results = await new cv.ComicVine({ apiKey: 'key' }).searchVolumes('4050-42821');
      assert.strictEqual(results.length, 1);
      assert.ok(path.includes('/volume/4050-42821'));
    });

    it('uses the search endpoint for a text query', async () => {
      let path = '';
      global.fetch = mock.fn(async (url: URL | string) => {
        path = new URL(String(url)).pathname;
        return cvResponse({ results: [VOLUME_RESULT] });
      }) as unknown as typeof fetch;

      await new cv.ComicVine({ apiKey: 'key' }).searchVolumes('immortal hulk');
      assert.ok(path.includes('/search'));
    });

    it('paces two clients against each other, not just its own loop', async () => {
    // The bug this pins: a client is built per operation, so per-instance
    // pacing meant an import of 200 volumes fired 200 requests as fast as the
    // network allowed and spent ComicVine's hourly budget in seconds.
    const { resetSourcePacing } = await import('@shelvarr/services/utils/pacing');
    const flag = 'SHELVARR_DISABLE_REQUEST_PACING';
    const original = process.env[flag];
    delete process.env[flag];
    resetSourcePacing('comicvine');

    global.fetch = mock.fn(async () => cvResponse({ results: [] })) as unknown as typeof fetch;

    try {
      const started = Date.now();
      await Promise.all([
        new cv.ComicVine({ apiKey: 'k', baseUrl: 'https://cv.example' }).searchVolumes('a'),
        new cv.ComicVine({ apiKey: 'k', baseUrl: 'https://cv.example' }).searchVolumes('b'),
      ]);
      assert.ok(
        Date.now() - started >= 900,
        `two clients went out ${Date.now() - started}ms apart`
      );
    } finally {
      if (original === undefined) delete process.env[flag];
      else process.env[flag] = original;
      resetSourcePacing('comicvine');
    }
  });

  it('returns nothing for an empty query without calling out', async () => {
      const fetchMock = mock.fn(async () => cvResponse({ results: [] }));
      global.fetch = fetchMock as unknown as typeof fetch;

      assert.deepStrictEqual(await new cv.ComicVine({ apiKey: 'key' }).searchVolumes('  '), []);
      assert.strictEqual(fetchMock.mock.callCount(), 0);
    });
  });
});

// ---------------------------------------------------------------------------
// Library: root folders, scanning, renaming, import
// ---------------------------------------------------------------------------

function metadata(overrides: Partial<ComicVolumeMetadata> = {}): ComicVolumeMetadata {
  return {
    comicvineId: 42821,
    title: 'Immortal Hulk',
    year: 2018,
    volumeNumber: 1,
    publisher: 'Marvel',
    description: 'Bruce Banner is alive.',
    coverLink: null,
    siteUrl: 'https://comicvine.example/immortal-hulk/',
    aliases: ['The Immortal Hulk'],
    issueCount: 5,
    translated: false,
    issues: null,
    ...overrides,
  };
}

function issues(count: number): ComicIssueMetadata[] {
  return Array.from({ length: count }, (_, index) => ({
    comicvineId: 700000 + index,
    volumeComicvineId: 42821,
    issueNumber: String(index + 1),
    calculatedIssueNumber: index + 1,
    title: `Issue ${index + 1}`,
    date: `2018-0${Math.min(9, index + 1)}-01`,
    description: '',
  }));
}

describe('Comic library', () => {
  let scan: typeof import('@shelvarr/services/comics/scan');
  let rename: typeof import('@shelvarr/services/comics/rename');
  let importLibrary: typeof import('@shelvarr/services/comics/import-library');

  before(async () => {
    root = '/tmp/shelvarr-comic-library-test-' + Date.now();
    process.env['DATA_DIR'] = root;
    process.env['DB_PATH'] = join(root, 'test.db');
    mkdirSync(root, { recursive: true });

    db = await import('../../lib/db/index.js');
    db.initDatabase();

    const { initServiceConfig } = await import('@shelvarr/services');
    initServiceConfig({
      dataDir: root,
      libraryRoot: root,
      dbPath: join(root, 'test.db'),
      comicPaths: { pathMap: null },
      getcomics: {
        baseUrl: 'https://getcomics.example',
        downloadDir: join(root, 'downloads'),
        hostPreference: ['getcomics'],
        renameDownloadedFiles: true,
      },
      supportedExtensions: ['.cbz'],
    });

    scan = await import('@shelvarr/services/comics/scan');
    rename = await import('@shelvarr/services/comics/rename');
    importLibrary = await import('@shelvarr/services/comics/import-library');
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
    // Tests reuse folder names, so the files on disk have to go too — a
    // leftover file from the previous test would be picked up by the next scan.
    rmSync(join(root, 'library'), { recursive: true, force: true });
  });

  /** Create a managed volume with `issueCount` issues and a real folder. */
  function seedVolume(
    folderName: string,
    issueCount = 5,
    overrides: Partial<ComicVolumeMetadata> = {}
  ): { volumeId: number; folder: string; rootFolderId: number } {
    const rootPath = join(root, 'library');
    mkdirSync(rootPath, { recursive: true });
    const rootFolder = db.addComicRootFolder(rootPath);

    const folder = join(rootPath, folderName);
    mkdirSync(folder, { recursive: true });

    const volumeId = db.upsertManagedComicVolume({
      metadata: metadata(overrides),
      rootFolderId: rootFolder.id,
      folder,
    });
    db.replaceComicIssuesFromMetadata(volumeId, issues(issueCount));

    return { volumeId, folder, rootFolderId: rootFolder.id };
  }

  describe('root folders', () => {
    it('adds, lists and removes', () => {
      const folder = db.addComicRootFolder('/comics/main');
      assert.strictEqual(db.getComicRootFolders().length, 1);
      assert.ok(db.deleteComicRootFolder(folder.id));
      assert.strictEqual(db.getComicRootFolders().length, 0);
    });

    it('is idempotent and strips trailing slashes', () => {
      const a = db.addComicRootFolder('/comics/main/');
      const b = db.addComicRootFolder('/comics/main');
      assert.strictEqual(a.id, b.id);
      assert.strictEqual(a.path, '/comics/main');
    });

    it('counts the volumes living in it', () => {
      const { rootFolderId } = seedVolume('Immortal Hulk');
      assert.strictEqual(db.countVolumesInRootFolder(rootFolderId), 1);
    });
  });

  describe('replaceComicIssuesFromMetadata', () => {
    it('keeps local issue ids across a refresh', () => {
      const { volumeId } = seedVolume('Immortal Hulk', 3);
      const before = db
        .getDb()
        .prepare('SELECT id, comicvine_id FROM comic_issues WHERE volume_id = ? ORDER BY id')
        .all(volumeId) as Array<{ id: number; comicvine_id: number }>;

      // Refresh with the same issues plus a new one.
      const result = db.replaceComicIssuesFromMetadata(volumeId, issues(4));
      assert.strictEqual(result.inserted, 1);
      assert.strictEqual(result.updated, 3);

      const after = db
        .getDb()
        .prepare('SELECT id, comicvine_id FROM comic_issues WHERE volume_id = ? ORDER BY id')
        .all(volumeId) as Array<{ id: number; comicvine_id: number }>;

      // Read progress and the native app reference these ids, so they must not
      // change when metadata is refreshed.
      for (const original of before) {
        const match = after.find((row) => row.comicvine_id === original.comicvine_id);
        assert.strictEqual(match?.id, original.id);
      }
    });

    it('tombstones issues that disappear upstream', () => {
      const { volumeId } = seedVolume('Immortal Hulk', 5);
      db.replaceComicIssuesFromMetadata(volumeId, issues(3));

      const alive = db
        .getDb()
        .prepare('SELECT COUNT(*) AS c FROM comic_issues WHERE volume_id = ? AND deleted_at IS NULL')
        .get(volumeId) as { c: number };
      assert.strictEqual(alive.c, 3);

      const total = db
        .getDb()
        .prepare('SELECT COUNT(*) AS c FROM comic_issues WHERE volume_id = ?')
        .get(volumeId) as { c: number };
      assert.strictEqual(total.c, 5, 'tombstoned issues are kept, not deleted');
    });

    it('respects monitorNewIssues when adding issues', () => {
      const { volumeId } = seedVolume('Immortal Hulk', 2);
      db.replaceComicIssuesFromMetadata(volumeId, issues(4), { monitorNewIssues: false });

      const unmonitored = db
        .getDb()
        .prepare('SELECT COUNT(*) AS c FROM comic_issues WHERE volume_id = ? AND monitored = 0')
        .get(volumeId) as { c: number };
      assert.strictEqual(unmonitored.c, 2);
    });
  });

  describe('scanVolumeFiles', () => {
    it('matches numbered issue files to their issues', async () => {
      const { volumeId, folder } = seedVolume('Immortal Hulk');
      for (const number of [1, 2, 3]) {
        writeFileSync(join(folder, `Immortal Hulk (2018) Volume 01 Issue 00${number}.cbz`), 'x');
      }

      const result = await scan.scanVolumeFiles(volumeId);
      assert.strictEqual(result.matched, 3);
      assert.deepStrictEqual(result.unmatched, []);

      const stats = db.getComicVolumeFileStats(volumeId);
      assert.strictEqual(stats.downloadedCount, 3);
      assert.strictEqual(stats.issueCount, 5);
    });

    it('links a collected edition to every issue it covers', async () => {
      const { volumeId, folder } = seedVolume('Immortal Hulk');
      writeFileSync(join(folder, 'Immortal Hulk (2018) 001-005.cbz'), 'x');

      await scan.scanVolumeFiles(volumeId);
      assert.strictEqual(db.getComicVolumeFileStats(volumeId).downloadedCount, 5);
    });

    it('reports files it cannot place rather than guessing', async () => {
      const { volumeId, folder } = seedVolume('Immortal Hulk');
      writeFileSync(join(folder, 'Immortal Hulk (2018) Issue 999.cbz'), 'x');

      const result = await scan.scanVolumeFiles(volumeId);
      assert.strictEqual(result.matched, 0);
      assert.strictEqual(result.unmatched.length, 1);
    });

    it('forgets files that have left the folder', async () => {
      const { volumeId, folder } = seedVolume('Immortal Hulk');
      const path = join(folder, 'Immortal Hulk (2018) Issue 001.cbz');
      writeFileSync(path, 'x');
      await scan.scanVolumeFiles(volumeId);
      assert.strictEqual(db.getComicFilesForVolume(volumeId).length, 1);

      rmSync(path);
      const result = await scan.scanVolumeFiles(volumeId);
      assert.strictEqual(result.removed, 1);
      assert.strictEqual(db.getComicFilesForVolume(volumeId).length, 0);
    });

    it('keeps every file on its own issue when the folder is rescanned', async () => {
      const { volumeId, folder } = seedVolume('Immortal Hulk');
      for (const number of [1, 2, 3]) {
        writeFileSync(join(folder, `Immortal Hulk (2018) Volume 01 Issue 00${number}.cbz`), 'x');
      }

      await scan.scanVolumeFiles(volumeId);
      const rescan = await scan.scanVolumeFiles(volumeId);
      assert.strictEqual(rescan.matched, 3);

      const issueRows = db
        .getDb()
        .prepare('SELECT id, calculated_issue_number AS number FROM comic_issues WHERE volume_id = ? ORDER BY calculated_issue_number')
        .all(volumeId) as Array<{ id: number; number: number }>;

      for (const number of [1, 2, 3]) {
        const issue = issueRows.find((row) => row.number === number)!;
        const files = db.getComicFilesForIssue(issue.id);
        assert.strictEqual(files.length, 1, `issue ${number} should still have one file`);
        assert.ok(
          files[0]!.filepath.endsWith(`Issue 00${number}.cbz`),
          `issue ${number} is linked to ${files[0]!.filepath}`
        );
      }
    });

    it('leaves a hand-made link alone on rescan', async () => {
      const { volumeId, folder } = seedVolume('Immortal Hulk');
      // A file whose name says nothing useful, linked by hand to issue 2.
      const path = join(folder, 'mystery-scan.cbz');
      writeFileSync(path, 'x');

      const issueRows = db
        .getDb()
        .prepare('SELECT id FROM comic_issues WHERE volume_id = ? ORDER BY calculated_issue_number')
        .all(volumeId) as Array<{ id: number }>;

      const fileId = db.upsertComicFile({ volumeId, filepath: path, size: 1 });
      db.linkComicFileToIssues(fileId, [issueRows[1]!.id], true);

      await scan.scanVolumeFiles(volumeId);

      assert.strictEqual(db.getComicFilesForIssue(issueRows[1]!.id).length, 1);
      assert.strictEqual(db.getComicFilesForVolume(volumeId).length, 1);
    });

    it('does nothing when the folder is not there', async () => {
      const { volumeId, folder } = seedVolume('Immortal Hulk');
      rmSync(folder, { recursive: true, force: true });
      const result = await scan.scanVolumeFiles(volumeId);
      assert.strictEqual(result.matched, 0);
    });
  });

  describe('rename', () => {
    it('proposes template names for badly named files', async () => {
      const { volumeId, folder } = seedVolume('Immortal Hulk');
      writeFileSync(join(folder, 'Immortal Hulk (2018) Issue 001.cbz'), 'x');
      await scan.scanVolumeFiles(volumeId);

      const preview = rename.previewVolumeRename(volumeId);
      assert.strictEqual(preview.files.length, 1);
      assert.ok(
        preview.files[0]!.to.endsWith('Immortal Hulk (2018) Volume 01 Issue 001.cbz'),
        preview.files[0]!.to
      );
    });

    it('proposes nothing when files are already correct', async () => {
      const { volumeId, folder } = seedVolume('Immortal Hulk');
      writeFileSync(join(folder, 'Immortal Hulk (2018) Volume 01 Issue 001.cbz'), 'x');
      await scan.scanVolumeFiles(volumeId);

      // The folder still moves to the template path, but no file does.
      const preview = rename.previewVolumeRename(volumeId);
      const fileMoves = preview.files.filter((file) => !file.to.includes('Volume 01 (2018)'));
      assert.deepStrictEqual(fileMoves, []);
    });

    it('moves the files and records where they went', async () => {
      const { volumeId, folder } = seedVolume('Immortal Hulk');
      writeFileSync(join(folder, 'Immortal Hulk (2018) Issue 002.cbz'), 'content');
      await scan.scanVolumeFiles(volumeId);

      const result = await rename.applyVolumeRename(volumeId);
      assert.strictEqual(result.errors.length, 0);
      assert.strictEqual(result.renamed, 1);

      const [file] = db.getComicFilesForVolume(volumeId);
      assert.ok(existsSync(file!.filepath), 'the recorded path should exist on disk');
      assert.strictEqual(readFileSync(file!.filepath, 'utf8'), 'content');
    });

    it('disambiguates two files that want the same name', async () => {
      const { volumeId, folder } = seedVolume('Immortal Hulk');
      writeFileSync(join(folder, 'Immortal Hulk (2018) Issue 003.cbz'), 'a');
      writeFileSync(join(folder, 'Immortal Hulk (2018) Issue 003.pdf'), 'b');
      await scan.scanVolumeFiles(volumeId);

      const targets = rename.previewVolumeRename(volumeId).files.map((file) => file.to);
      assert.strictEqual(new Set(targets).size, targets.length, 'targets must be unique');
    });

    it('leaves a hand-picked folder where it is', () => {
      const { volumeId, folder } = seedVolume('Custom Place');
      db.setComicVolumeFolder(volumeId, folder, true);

      const preview = rename.previewVolumeRename(volumeId);
      assert.strictEqual(preview.folderTo, null);
    });
  });

  describe('library import', () => {
    it('groups a folder tree into one candidate volume per folder', async () => {
      const tree = join(root, 'adopt');
      const hulk = join(tree, 'Immortal Hulk', 'Volume 01 (2018)');
      const saga = join(tree, 'Saga');
      mkdirSync(hulk, { recursive: true });
      mkdirSync(saga, { recursive: true });
      writeFileSync(join(hulk, 'Immortal Hulk (2018) Issue 001.cbz'), 'x');
      writeFileSync(join(hulk, 'Immortal Hulk (2018) Issue 002.cbz'), 'x');
      writeFileSync(join(saga, 'Saga (2012) Issue 001.cbz'), 'x');

      const groups = await importLibrary.findImportGroups(tree);
      assert.strictEqual(groups.length, 2);

      const hulkGroup = groups.find((group) => group.folder === hulk)!;
      assert.strictEqual(hulkGroup.files.length, 2);
      assert.strictEqual(hulkGroup.info.series, 'Immortal Hulk');
      assert.strictEqual(hulkGroup.info.year, 2018);
    });

    it('skips folders that only hold other folders', async () => {
      const tree = join(root, 'adopt-nested');
      mkdirSync(join(tree, 'Publisher', 'Series'), { recursive: true });
      writeFileSync(join(tree, 'Publisher', 'Series', 'Series (2020) Issue 001.cbz'), 'x');

      const groups = await importLibrary.findImportGroups(tree);
      assert.strictEqual(groups.length, 1);
      assert.ok(groups[0]!.folder.endsWith('Series'));
    });

    it('refuses a folder that is not there', async () => {
      await assert.rejects(
        () => importLibrary.findImportGroups(join(root, 'nope')),
        /No such folder/
      );
    });
  });

  describe('proposing matches', () => {
    const originalFetch = global.fetch;
    /** Every ComicVine URL the proposal pass asked for. */
    let requested: string[];

    /** A folder holding one file, named so it parses to `series` (`year`). */
    function seedFolder(name: string, series: string, year: number): string {
      const folder = join(root, 'propose', name);
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, `${series} (${year}) Issue 001.cbz`), 'x');
      return folder;
    }

    before(() => {
      db.setSetting('comicvine_api_key', 'test-key');
    });

    beforeEach(() => {
      requested = [];
      rmSync(join(root, 'propose'), { recursive: true, force: true });
      global.fetch = mock.fn(async (url: URL | string) => {
        const href = String(url);
        requested.push(href);
        const volume = {
          id: 42821,
          name: 'Gear School',
          start_year: '2007',
          description: '',
          publisher: { name: 'Image' },
          site_detail_url: 'https://comicvine.example/gear-school/',
          aliases: '',
          count_of_issues: 1,
        };
        // A fetch by id returns the one volume; a search returns a list.
        const results = href.includes('/volume/') ? volume : [volume];
        return new Response(JSON.stringify({ status_code: 1, error: 'OK', results }), {
          status: 200,
        });
      }) as unknown as typeof fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('takes the ComicVine id a mirrored folder already carries', async () => {
      // Deliberately parses to something ComicVine would never match, so the
      // only way to the right volume is the id the mirror recorded.
      const folder = seedFolder('Gear School', 'GS Digest', 2007);
      db.upsertComicVolume({
        id: 991,
        slug: 'gear-school',
        comicvine_id: 42821,
        title: 'Gear School',
        year: 2007,
        publisher: 'Image',
        volume_number: 1,
        description: '',
        monitored: true,
        monitor_new_issues: false,
        folder,
        issue_count: 1,
        issue_count_monitored: 1,
        issues_downloaded: 1,
        issues_downloaded_monitored: 1,
        total_size: 1,
      });

      const groups = await importLibrary.findImportGroups(join(root, 'propose'));
      const { proposals } = await importLibrary.proposeLibraryImport(groups);
      const proposal = proposals[0]!;

      assert.strictEqual(proposal.suggested?.comicvineId, 42821);
      assert.strictEqual(proposal.suggested?.title, 'Gear School');
      assert.strictEqual(proposal.alreadyAdded, 991);
      // The row holds the id and everything the review prints, so a folder the
      // library already recognises costs no request at all — the whole point,
      // given ComicVine's hourly budget.
      assert.deepStrictEqual(requested, []);
    });

    it('keeps the match of a folder it owns, so removing the volume re-offers it', async () => {
      const folder = seedFolder('Gear School', 'GS Digest', 2007);
      const rootFolder = db.addComicRootFolder(join(root, 'propose'));
      const volumeId = db.upsertManagedComicVolume({
        metadata: metadata({ comicvineId: 42821, title: 'Gear School', year: 2007 }),
        rootFolderId: rootFolder.id,
        folder,
      });

      const groups = await importLibrary.findImportGroups(join(root, 'propose'));
      const proposal = (await importLibrary.proposeLibraryImport(groups)).proposals[0]!;

      // Still in the library, so the review will not offer it — but the match
      // is recorded, which is what lets the folder go back on offer the moment
      // the volume is removed, with no rescan and no ComicVine request.
      assert.strictEqual(proposal.alreadyAdded, volumeId);
      assert.strictEqual(proposal.suggested?.comicvineId, 42821);
      assert.deepStrictEqual(requested, []);
    });

    it('searches by title alone, so the year cannot empty the search', async () => {
      seedFolder('Gear School', 'Gear School', 2007);

      const groups = await importLibrary.findImportGroups(join(root, 'propose'));
      const { proposals } = await importLibrary.proposeLibraryImport(groups);

      const search = requested.find((href) => href.includes('/search'))!;
      assert.strictEqual(new URL(search).searchParams.get('query'), 'Gear School');
      assert.strictEqual(proposals[0]!.suggested?.comicvineId, 42821);
      assert.strictEqual(proposals[0]!.checked, true);
    });

    it('leaves the rest unchecked when the hourly quota runs out', async () => {
      seedFolder('A Series', 'A Series', 2001);
      seedFolder('B Series', 'B Series', 2002);
      seedFolder('C Series', 'C Series', 2003);

      // ComicVine answers the first search and then reports its quota spent.
      let answered = 0;
      global.fetch = mock.fn(async (url: URL | string) => {
        requested.push(String(url));
        if (answered++ > 0) {
          return new Response(JSON.stringify({ status_code: 107, error: 'Rate limit' }), {
            status: 200,
          });
        }
        return new Response(
          JSON.stringify({
            status_code: 1,
            error: 'OK',
            results: [
              {
                id: 42821,
                name: 'A Series',
                start_year: '2001',
                description: '',
                publisher: { name: 'Image' },
                site_detail_url: '',
                aliases: '',
                count_of_issues: 1,
              },
            ],
          }),
          { status: 200 }
        );
      }) as unknown as typeof fetch;

      const groups = await importLibrary.findImportGroups(join(root, 'propose'));
      const { proposals, quotaSpent } = await importLibrary.proposeLibraryImport(groups);

      assert.strictEqual(quotaSpent, true);
      assert.strictEqual(proposals.length, 3, 'every folder is still listed');
      assert.strictEqual(proposals[0]!.checked, true);
      assert.deepStrictEqual(
        proposals.slice(1).map((proposal) => proposal.checked),
        [false, false]
      );
      // Two requests: the one that worked and the one that hit the wall. The
      // third folder is not asked at all.
      assert.strictEqual(requested.length, 2);

      // Scanning again reuses the answer it has and only asks about the rest.
      requested = [];
      const reuse = new Map(
        proposals
          .filter((proposal) => proposal.checked)
          .map((proposal) => [
            proposal.folder,
            {
              candidates: proposal.candidates,
              suggestedComicvineId: proposal.suggested?.comicvineId ?? null,
            },
          ])
      );
      const second = await importLibrary.proposeLibraryImport(groups, { reuse });
      assert.strictEqual(second.proposals[0]!.suggested?.comicvineId, 42821);
      assert.ok(
        !requested.some((href) => href.includes('A%20Series') || href.includes('A+Series')),
        `the answered folder should not be asked again, got ${requested.join(', ')}`
      );
    });
  });

  describe('duplicate volumes', () => {
    it('keeps one volume per folder, preferring the mirror\'s ComicVine id', async () => {
      const { volumeId, folder } = seedVolume('20th Century Men', 6, { comicvineId: 9999 });

      // The mirror left behind by the previous manager, pointing at the volume
      // it had matched, under the same folder.
      db.upsertComicVolume({
        id: 991,
        slug: '20th-century-men-mirror',
        comicvine_id: 42821,
        title: '20th Century Men',
        year: 2022,
        publisher: 'Image',
        volume_number: 1,
        description: '',
        monitored: true,
        monitor_new_issues: false,
        folder,
        issue_count: 6,
        issue_count_monitored: 6,
        issues_downloaded: 0,
        issues_downloaded_monitored: 0,
        total_size: 0,
      });

      const library = await import('@shelvarr/services/comics/library');
      const result = library.mergeDuplicateComicVolumes();

      assert.strictEqual(result.folders, 1);
      assert.strictEqual(result.removed, 1);
      assert.strictEqual(result.retargeted, 1);

      // The volume Shelvarr owns survives, pointed at the id the mirror carried
      // and marked stale so the next refresh rewrites its metadata.
      assert.strictEqual(db.getComicVolume(991), null);
      const kept = db.getComicVolume(volumeId)!;
      assert.strictEqual(kept.comicvineId, 42821);
      assert.strictEqual(kept.lastCvFetch, 0);

      // Idempotent: nothing left to merge.
      assert.strictEqual(library.mergeDuplicateComicVolumes().removed, 0);
    });

    it('drops an empty copy of a volume already held under another folder', async () => {
      // The same ComicVine volume adopted twice: once where its files are, once
      // under a path that has nothing. Different folders, so the pass above
      // cannot see them.
      const withFiles = seedVolume('Immortal Hulk', 3);
      db.upsertComicFile({
        volumeId: withFiles.volumeId,
        filepath: join(withFiles.folder, 'Immortal Hulk (2018) Issue 001.cbz'),
        size: 1,
      });
      const empty = db.upsertManagedComicVolume({
        metadata: metadata(),
        rootFolderId: withFiles.rootFolderId,
        folder: join(root, 'library', 'Immortal Hulk (2018)'),
      });

      const library = await import('@shelvarr/services/comics/library');
      const result = library.mergeDuplicateComicVolumes();

      assert.strictEqual(result.ids, 1);
      assert.strictEqual(result.removed, 1);
      assert.deepStrictEqual(result.unresolved, []);
      assert.strictEqual(db.getComicVolume(empty), null);
      assert.ok(db.getComicVolume(withFiles.volumeId));

      assert.strictEqual(library.mergeDuplicateComicVolumes().removed, 0);
    });

    it('drops a copy whose files are not where it says they are', async () => {
      // The prod-shaped case: a mirror from a previous manager still carrying
      // the paths that manager recorded, for a folder since reorganised away.
      const kept = seedVolume('Immortal Hulk', 3);
      db.upsertComicFile({
        volumeId: kept.volumeId,
        filepath: join(kept.folder, 'Immortal Hulk (2018) Issue 001.cbz'),
        size: 1,
      });
      db.upsertComicVolume({
        id: 992,
        slug: 'immortal-hulk-mirror',
        comicvine_id: 42821,
        title: 'Immortal Hulk',
        year: 2018,
        publisher: 'Marvel',
        volume_number: 1,
        description: '',
        monitored: true,
        monitor_new_issues: false,
        // Under the same root, so the root being mounted is not in doubt —
        // this folder itself is simply gone.
        folder: join(root, 'library', 'Immortal Hulk v1 (2018)'),
        issue_count: 3,
        issue_count_monitored: 3,
        issues_downloaded: 3,
        issues_downloaded_monitored: 3,
        total_size: 3,
      });
      db.upsertComicIssue({
        id: 9001,
        volume_id: 992,
        comicvine_id: 700001,
        issue_number: '1',
        calculated_issue_number: 1,
        title: 'Or Is He Both?',
        date: '2018-06-06',
        description: '',
        monitored: true,
        files: [join(root, 'library', 'Immortal Hulk v1 (2018)', 'Issue 001.cbz')],
      });

      const library = await import('@shelvarr/services/comics/library');
      const result = library.mergeDuplicateComicVolumes();

      assert.strictEqual(result.removed, 1);
      assert.deepStrictEqual(result.unresolved, []);
      assert.strictEqual(db.getComicVolume(992), null);
      assert.ok(db.getComicVolume(kept.volumeId));
    });

    it('leaves a volume split across two folders for a human to settle', async () => {
      // Both copies know about files, so which folder is the volume is a
      // question about someone's disk, not one to guess at.
      const first = seedVolume('Immortal Hulk', 3);
      db.upsertComicFile({
        volumeId: first.volumeId,
        filepath: join(first.folder, 'Immortal Hulk (2018) Issue 001.cbz'),
        size: 1,
      });
      const secondFolder = join(root, 'library', 'Immortal Hulk (2018)');
      mkdirSync(secondFolder, { recursive: true });
      const second = db.upsertManagedComicVolume({
        metadata: metadata(),
        rootFolderId: first.rootFolderId,
        folder: secondFolder,
      });
      db.upsertComicFile({
        volumeId: second,
        filepath: join(secondFolder, 'Immortal Hulk (2018) Issue 002.cbz'),
        size: 1,
      });

      const library = await import('@shelvarr/services/comics/library');
      const result = library.mergeDuplicateComicVolumes();

      assert.strictEqual(result.ids, 1);
      assert.strictEqual(result.removed, 0);
      assert.strictEqual(result.unresolved.length, 1);
      assert.strictEqual(result.unresolved[0]!.comicvineId, 42821);
      assert.deepStrictEqual(result.unresolved[0]!.folders.sort(), [first.folder, secondFolder].sort());

      // Neither row is touched.
      assert.ok(db.getComicVolume(first.volumeId));
      assert.ok(db.getComicVolume(second));
    });

    it('reports two ComicVine volumes whose titles only differ by punctuation', async () => {
      const first = seedVolume('The Expanse - Dragon Tooth', 2, {
        comicvineId: 149581,
        title: 'The Expanse - Dragon Tooth',
      });
      seedVolume('The Expanse Dragon Tooth', 2, {
        comicvineId: 158373,
        title: 'The Expanse: Dragon Tooth',
      });
      // A sequel is not a duplicate: the digit keeps it out of the group.
      seedVolume('The Magic Order', 2, { comicvineId: 118385, title: 'The Magic Order' });
      seedVolume('The Magic Order 2', 2, { comicvineId: 140006, title: 'The Magic Order 2' });

      const library = await import('@shelvarr/services/comics/library');
      const candidates = library.findComicDuplicateCandidates();

      assert.strictEqual(candidates.length, 1);
      assert.deepStrictEqual(
        candidates[0]!.volumes.map((volume) => volume.comicvineId).sort(),
        [149581, 158373]
      );
      // Reported only — nothing was merged away.
      assert.ok(db.getComicVolume(first.volumeId));
    });
  });
});

// ---------------------------------------------------------------------------
// End to end: adding and refreshing a volume with ComicVine mocked out
// ---------------------------------------------------------------------------

describe('Adding and refreshing a volume', () => {
  const originalFetch = global.fetch;
  let library: typeof import('@shelvarr/services/comics/library');
  let e2eRoot: string;
  let e2eDb: typeof import('../../lib/db/index.js');

  /** Mock ComicVine with a volume of `issueCount` issues. */
  function mockComicVine(issueCount: number, volumeOverrides: Record<string, unknown> = {}) {
    global.fetch = mock.fn(async (url: URL | string) => {
      const href = String(url);

      if (href.includes('/volume/')) {
        return new Response(
          JSON.stringify({
            status_code: 1,
            error: 'OK',
            results: {
              id: 42821,
              name: 'Immortal Hulk',
              deck: 'Volume 1',
              start_year: '2018',
              description: '<p>Bruce Banner is alive.</p>',
              image: { small_url: 'https://comicvine.example/cover.jpg' },
              publisher: { name: 'Marvel' },
              site_detail_url: 'https://comicvine.example/hulk/',
              aliases: '',
              count_of_issues: issueCount,
              ...volumeOverrides,
            },
          }),
          { status: 200 }
        );
      }

      if (href.includes('/issues/')) {
        return new Response(
          JSON.stringify({
            status_code: 1,
            error: 'OK',
            number_of_total_results: issueCount,
            results: Array.from({ length: issueCount }, (_, index) => ({
              id: 700000 + index,
              volume: { id: 42821 },
              issue_number: String(index + 1),
              name: `Issue ${index + 1}`,
              cover_date: '2018-06-13',
              store_date: '2018-06-01',
              description: '',
            })),
          }),
          { status: 200 }
        );
      }

      // The cover image.
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }) as unknown as typeof fetch;
  }

  before(async () => {
    e2eRoot = '/tmp/shelvarr-comic-e2e-test-' + Date.now();
    process.env['DATA_DIR'] = e2eRoot;
    process.env['DB_PATH'] = join(e2eRoot, 'test.db');
    mkdirSync(e2eRoot, { recursive: true });

    e2eDb = await import('../../lib/db/index.js');
    e2eDb.initDatabase();
    e2eDb.setSetting('comicvine_api_key', 'test-key');

    library = await import('@shelvarr/services/comics/library');
  });

  after(() => {
    global.fetch = originalFetch;
    rmSync(e2eRoot, { recursive: true, force: true });
  });

  beforeEach(() => {
    e2eDb.getDb().exec(
      `DELETE FROM comic_issue_files; DELETE FROM comic_files; DELETE FROM comic_issues;
       DELETE FROM comics; DELETE FROM comic_root_folders;`
    );
    rmSync(join(e2eRoot, 'lib'), { recursive: true, force: true });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('creates the volume, its issues and its folder', async () => {
    mockComicVine(5);
    const rootFolder = await library.addRootFolder(join(e2eRoot, 'lib'));

    const result = await library.addVolume({
      comicvineId: 42821,
      rootFolderId: rootFolder.id,
    });

    assert.strictEqual(result.title, 'Immortal Hulk');
    assert.strictEqual(result.issueCount, 5);
    assert.ok(existsSync(result.folder), 'the volume folder should have been created');
    assert.ok(result.folder.endsWith(join('Immortal Hulk', 'Volume 01 (2018)')), result.folder);

    const detail = e2eDb.getManagedComicDetail(result.volumeId)!;
    assert.strictEqual(detail.issues.length, 5);
    assert.strictEqual(detail.title, 'Immortal Hulk');
  });

  it('adopts files already sitting in the folder', async () => {
    mockComicVine(5);
    const rootFolder = await library.addRootFolder(join(e2eRoot, 'lib'));

    // Put a file where the volume folder will be, before adding the volume.
    const folder = join(e2eRoot, 'lib', 'Immortal Hulk', 'Volume 01 (2018)');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'Immortal Hulk (2018) Issue 002.cbz'), 'x');

    const result = await library.addVolume({
      comicvineId: 42821,
      rootFolderId: rootFolder.id,
    });

    assert.strictEqual(result.matchedFiles, 1);
    assert.strictEqual(e2eDb.getComicVolumeFileStats(result.volumeId).downloadedCount, 1);
  });

  it('stores the cover so it can be served without ComicVine', async () => {
    mockComicVine(2);
    const rootFolder = await library.addRootFolder(join(e2eRoot, 'lib'));
    const result = await library.addVolume({ comicvineId: 42821, rootFolderId: rootFolder.id });

    const cover = e2eDb.getComicVolumeCover(result.volumeId);
    assert.ok(cover && cover.length > 0, 'the cover should be stored locally');
  });

  it('refreshes rather than duplicating when the volume is already there', async () => {
    mockComicVine(3);
    const rootFolder = await library.addRootFolder(join(e2eRoot, 'lib'));

    const first = await library.addVolume({ comicvineId: 42821, rootFolderId: rootFolder.id });
    const second = await library.addVolume({ comicvineId: 42821, rootFolderId: rootFolder.id });

    assert.strictEqual(first.volumeId, second.volumeId);
    assert.strictEqual(e2eDb.getManagedComicVolumes().length, 1);
  });

  it('picks up issues that appeared since the volume was added', async () => {
    mockComicVine(3);
    const rootFolder = await library.addRootFolder(join(e2eRoot, 'lib'));
    const added = await library.addVolume({ comicvineId: 42821, rootFolderId: rootFolder.id });

    mockComicVine(5);
    const refreshed = await library.refreshVolume(added.volumeId);

    assert.strictEqual(refreshed.issuesAdded, 2);
    assert.strictEqual(e2eDb.getManagedComicDetail(added.volumeId)!.issues.length, 5);
  });

  it('leaves the user\'s monitoring choice alone across a refresh', async () => {
    mockComicVine(3);
    const rootFolder = await library.addRootFolder(join(e2eRoot, 'lib'));
    const added = await library.addVolume({ comicvineId: 42821, rootFolderId: rootFolder.id });

    library.setMonitored(added.volumeId, false);
    mockComicVine(3);
    await library.refreshVolume(added.volumeId);

    assert.strictEqual(e2eDb.getComicVolume(added.volumeId)!.monitored, false);
  });

  it('refuses to add without a ComicVine key', async () => {
    e2eDb.setSetting('comicvine_api_key', '');

    try {
      const rootFolder = await library.addRootFolder(join(e2eRoot, 'lib'));
      await assert.rejects(
        () => library.addVolume({ comicvineId: 42821, rootFolderId: rootFolder.id }),
        /API key/
      );
    } finally {
      e2eDb.setSetting('comicvine_api_key', 'test-key');
    }
  });

  it('adopts the volume already holding the folder instead of adding a second', async () => {
    mockComicVine(3);
    const rootFolder = await library.addRootFolder(join(e2eRoot, 'lib'));
    const folder = join(e2eRoot, 'lib', '20th Century Men');
    mkdirSync(folder, { recursive: true });

    // A mirror from a previous manager, pointing at a different ComicVine
    // volume than the one being imported.
    e2eDb.upsertComicVolume({
      id: 991,
      slug: '20th-century-men',
      comicvine_id: 55555,
      title: '20th Century Men',
      year: 2022,
      publisher: 'Image',
      volume_number: 1,
      description: '',
      monitored: true,
      monitor_new_issues: false,
      folder,
      issue_count: 6,
      issue_count_monitored: 6,
      issues_downloaded: 0,
      issues_downloaded_monitored: 0,
      total_size: 0,
    });

    const added = await library.addVolume({
      comicvineId: 42821,
      rootFolderId: rootFolder.id,
      folder,
    });

    assert.strictEqual(added.volumeId, 991, 'the row already on the folder is the one adopted');
    assert.strictEqual(e2eDb.getManagedComicVolumes().length, 1, 'no duplicate volume');
    const volume = e2eDb.getComicVolume(991)!;
    assert.strictEqual(volume.comicvineId, 42821, 'retargeted at what was imported');
    assert.strictEqual(volume.folder, folder, 'and it follows its files here');
  });

  it('stops an import at the quota and says what is left rather than failing the rest', async () => {
    const importLib = await import('@shelvarr/services/comics/import-library');
    const rootFolder = await library.addRootFolder(join(e2eRoot, 'lib'));

    // ComicVine answers for the first volume, then reports its quota spent.
    let volumeFetches = 0;
    global.fetch = mock.fn(async (url: URL | string) => {
      const href = String(url);
      if (href.includes('/volume/') && ++volumeFetches > 1) {
        return new Response(JSON.stringify({ status_code: 107, error: 'Rate limit' }), {
          status: 200,
        });
      }
      if (href.includes('/volume/')) {
        return new Response(
          JSON.stringify({
            status_code: 1,
            error: 'OK',
            results: {
              id: 42821,
              name: 'Immortal Hulk',
              start_year: '2018',
              description: '',
              image: { small_url: 'https://comicvine.example/cover.jpg' },
              publisher: { name: 'Marvel' },
              site_detail_url: '',
              aliases: '',
              count_of_issues: 1,
            },
          }),
          { status: 200 }
        );
      }
      if (href.includes('/issues/')) {
        return new Response(
          JSON.stringify({ status_code: 1, error: 'OK', number_of_total_results: 0, results: [] }),
          { status: 200 }
        );
      }
      return new Response(new Uint8Array([1]), { status: 200 });
    }) as unknown as typeof fetch;

    const first = join(e2eRoot, 'lib', 'First');
    const second = join(e2eRoot, 'lib', 'Second');
    const third = join(e2eRoot, 'lib', 'Third');

    const result = await importLib.applyLibraryImport(
      [
        { folder: first, comicvineId: 42821 },
        { folder: second, comicvineId: 42822 },
        { folder: third, comicvineId: 42823 },
      ],
      rootFolder.id
    );

    assert.strictEqual(result.imported.length, 1);
    assert.deepStrictEqual(result.failed, [], 'a spent quota is not a failure');
    assert.deepStrictEqual(
      result.remaining.map((selection) => selection.folder),
      [second, third],
      'what was not tried comes back to be resumed'
    );
  });

  it('tombstones a deleted volume but keeps the files by default', async () => {
    mockComicVine(2);
    const rootFolder = await library.addRootFolder(join(e2eRoot, 'lib'));
    const added = await library.addVolume({ comicvineId: 42821, rootFolderId: rootFolder.id });

    await library.deleteVolume(added.volumeId);

    assert.strictEqual(e2eDb.getComicVolume(added.volumeId), null);
    assert.ok(existsSync(added.folder), 'the files should still be on disk');
  });
});
