/**
 * Contract tests for the comic endpoints the native app depends on.
 *
 * These run the real route handlers against a real database — no mocks — and
 * assert the exact response shapes `apps/native/src/services/api/comics.ts`
 * reads. The native app ships separately, so a silent shape change here is a
 * broken client that nothing else would catch.
 *
 * When one of these fails, the native app needs updating too.
 *
 * Requests carry a real session token, as the native app does: these routes
 * are behind authentication, so a contract test that skipped it would be
 * testing a path no client actually takes.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ComicVolumeMetadata, ComicIssueMetadata } from '@shelvarr/types';

let db: typeof import('../../lib/db/index.js');
let root: string;
let libraryRoot: string;

type Handler = (request: unknown, context?: unknown) => Promise<Response>;

let comicsRoute: { GET: Handler };
let comicDetailRoute: { GET: Handler };
let issueRoute: { GET: Handler };
let inProgressRoute: { GET: Handler };
let nextUpRoute: { GET: Handler };
let sessionToken: string;

/**
 * A request in the shape the route handlers read. Some reach for
 * `request.nextUrl`, others parse `request.url`; a real NextRequest has both.
 */
function request(url = 'http://host/api/comics'): unknown {
  const parsed = new URL(url);
  return {
    url,
    headers: new Headers({ Authorization: `Bearer ${sessionToken}` }),
    nextUrl: { searchParams: parsed.searchParams },
  };
}

function params(id: number | string) {
  return { params: Promise.resolve({ id: String(id) }) };
}

function metadata(overrides: Partial<ComicVolumeMetadata> = {}): ComicVolumeMetadata {
  return {
    comicvineId: 42821,
    title: 'Immortal Hulk',
    year: 2018,
    volumeNumber: 1,
    publisher: 'Marvel',
    description: 'Bruce Banner is alive.',
    coverLink: null,
    siteUrl: 'https://comicvine.example/hulk/',
    aliases: [],
    issueCount: 3,
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
    date: '2018-06-13',
    description: '',
  }));
}

describe('Native app comic API contract', () => {
  before(async () => {
    root = '/tmp/shelvarr-native-contract-' + Date.now();
    libraryRoot = join(root, 'library');
    process.env['DATA_DIR'] = root;
    process.env['DB_PATH'] = join(root, 'test.db');
    process.env['COMIC_LIBRARY_ROOT'] = libraryRoot;
    mkdirSync(libraryRoot, { recursive: true });

    db = await import('../../lib/db/index.js');
    db.initDatabase();

    const { auth } = await import('@shelvarr/services');
    sessionToken = auth.issueSession(
      auth.createFirstAdmin('contract@example.com', 'Contract'),
      'native',
      'contract test'
    ).token;

    comicsRoute = (await import('../../app/api/comics/route.js')) as unknown as { GET: Handler };
    comicDetailRoute = (await import('../../app/api/comics/[id]/route.js')) as unknown as {
      GET: Handler;
    };
    issueRoute = (await import('../../app/api/comics/issues/[id]/route.js')) as unknown as {
      GET: Handler;
    };
    inProgressRoute = (await import('../../app/api/comics/in-progress/route.js')) as unknown as {
      GET: Handler;
    };
    nextUpRoute = (await import('../../app/api/comics/next-up/route.js')) as unknown as {
      GET: Handler;
    };
  });

  after(() => {
    if (db) db.closeDatabase();
    rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    db.getDb().exec(
      `DELETE FROM comic_issue_files; DELETE FROM comic_files; DELETE FROM comic_issues;
       DELETE FROM comics; DELETE FROM comic_root_folders; DELETE FROM comic_read_progress;`
    );
    rmSync(libraryRoot, { recursive: true, force: true });
    mkdirSync(libraryRoot, { recursive: true });
  });

  /** A managed volume with issues, and a file on disk for issue 1. */
  async function seedVolume(title = 'Immortal Hulk'): Promise<{
    volumeId: number;
    issueIds: number[];
  }> {
    const rootFolder = db.addComicRootFolder(libraryRoot);
    const folder = join(libraryRoot, title);
    mkdirSync(folder, { recursive: true });

    const volumeId = db.upsertManagedComicVolume({
      metadata: metadata({ title }),
      rootFolderId: rootFolder.id,
      folder,
    });
    db.replaceComicIssuesFromMetadata(volumeId, issues(3));

    const issueIds = (
      db
        .getDb()
        .prepare(
          'SELECT id FROM comic_issues WHERE volume_id = ? ORDER BY calculated_issue_number'
        )
        .all(volumeId) as Array<{ id: number }>
    ).map((row) => row.id);

    const path = join(folder, `${title} (2018) Issue 001.cbz`);
    writeFileSync(path, 'x');
    const fileId = db.upsertComicFile({ volumeId, filepath: path, size: 1 });
    db.linkComicFileToIssues(fileId, [issueIds[0]!]);
    db.refreshComicVolumeStats(volumeId);

    return { volumeId, issueIds };
  }

  describe('GET /api/comics — fetchComics / fetchRecentComics', () => {
    it('returns { volumes } with every field the comic grid reads', async () => {
      await seedVolume();

      const body = (await (await comicsRoute.GET(request())).json()) as {
        volumes: Array<Record<string, unknown>>;
      };

      assert.ok(Array.isArray(body.volumes), 'native destructures data.volumes');
      assert.strictEqual(body.volumes.length, 1);

      // ComicCard and the offline cache read these by name.
      const volume = body.volumes[0]!;
      for (const field of [
        'id',
        'comicvine_id',
        'title',
        'year',
        'publisher',
        'volume_number',
        'description',
        'monitored',
        'monitor_new_issues',
        'folder',
        'issue_count',
        'issue_count_monitored',
        'issues_downloaded',
        'issues_downloaded_monitored',
        'total_size',
      ]) {
        assert.ok(field in volume, `volumes[].${field} is missing`);
      }
    });

    it('honours the search param the native search bar sends', async () => {
      await seedVolume('Immortal Hulk');
      await seedVolume('Saga');

      const body = (await (
        await comicsRoute.GET(request('http://host/api/comics?search=saga'))
      ).json()) as { volumes: Array<{ title: string }> };

      assert.deepStrictEqual(
        body.volumes.map((volume) => volume.title),
        ['Saga']
      );
    });

    it('honours sort=recently_added, which fetchRecentComics sends', async () => {
      await seedVolume('First');
      await seedVolume('Second');

      const body = (await (
        await comicsRoute.GET(request('http://host/api/comics?sort=recently_added'))
      ).json()) as { volumes: Array<{ title: string }> };

      assert.strictEqual(body.volumes[0]!.title, 'Second', 'newest first');
    });

    it('returns an empty array, not an error, for an empty library', async () => {
      const response = await comicsRoute.GET(request());
      assert.strictEqual(response.status, 200);
      assert.deepStrictEqual(((await response.json()) as { volumes: unknown[] }).volumes, []);
    });
  });

  describe('GET /api/comics/[id] — fetchComicDetail', () => {
    it('returns { volume } with the issues array the detail screen maps over', async () => {
      const { volumeId } = await seedVolume();

      const body = (await (
        await comicDetailRoute.GET(request(), params(volumeId))
      ).json()) as { volume: Record<string, unknown> };

      assert.ok(body.volume, 'native reads data.volume');
      assert.ok(Array.isArray(body.volume['issues']));
      assert.strictEqual((body.volume['issues'] as unknown[]).length, 3);
      assert.ok(Array.isArray(body.volume['general_files']));
    });

    it('gives each issue the fields the issue list renders', async () => {
      const { volumeId } = await seedVolume();

      const body = (await (
        await comicDetailRoute.GET(request(), params(volumeId))
      ).json()) as { volume: { issues: Array<Record<string, unknown>> } };

      const issue = body.volume.issues[0]!;
      for (const field of [
        'id',
        'volume_id',
        'comicvine_id',
        'issue_number',
        'calculated_issue_number',
        'title',
        'date',
        'description',
        'monitored',
        'files',
      ]) {
        assert.ok(field in issue, `issues[].${field} is missing`);
      }
      assert.ok(Array.isArray(issue['files']));
    });

    it('reports downloaded issues via a non-empty files array', async () => {
      const { volumeId } = await seedVolume();

      const body = (await (
        await comicDetailRoute.GET(request(), params(volumeId))
      ).json()) as { volume: { issues: Array<{ files: unknown[] }> } };

      // The native app decides "downloadable" from files.length.
      assert.strictEqual(body.volume.issues[0]!.files.length, 1);
      assert.strictEqual(body.volume.issues[1]!.files.length, 0);
    });

    it('404s for an unknown volume so the client falls back to its cache', async () => {
      const response = await comicDetailRoute.GET(request(), params(999));
      assert.strictEqual(response.status, 404);
    });
  });

  describe('GET /api/comics/issues/[id] — fetchComicIssue', () => {
    it('returns { issue } with its files', async () => {
      const { issueIds } = await seedVolume();

      const body = (await (
        await issueRoute.GET(request(), params(issueIds[0]!))
      ).json()) as { issue: { id: number; files: unknown[] } };

      assert.ok(body.issue, 'native reads data.issue');
      assert.strictEqual(body.issue.id, issueIds[0]);
      assert.strictEqual(body.issue.files.length, 1);
    });

    it('404s for an unknown issue', async () => {
      const response = await issueRoute.GET(request(), params(999999));
      assert.strictEqual(response.status, 404);
    });
  });

  describe('home screen rows', () => {
    it('GET /api/comics/in-progress returns { comics }', async () => {
      const { issueIds } = await seedVolume();
      db.upsertComicReadProgress(issueIds[0]!, 5, false, 20);

      const body = (await (await inProgressRoute.GET(request())).json()) as {
        comics: unknown[];
      };
      assert.ok(Array.isArray(body.comics), 'native reads data.comics');
    });

    it('GET /api/comics/next-up returns { comics }', async () => {
      await seedVolume();

      const body = (await (await nextUpRoute.GET(request())).json()) as { comics: unknown[] };
      assert.ok(Array.isArray(body.comics), 'native reads data.comics');
    });
  });
});
