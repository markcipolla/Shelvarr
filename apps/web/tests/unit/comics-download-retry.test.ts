/**
 * What happens when a comic download goes wrong in a way that isn't fatal:
 * the link dies between search and download, or the host rate-limits us.
 *
 * These drive the real `comic_download` task handler through the queue, with
 * only `fetch` stubbed, so the download client's own 404/429 handling is part
 * of what's under test.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ComicVolumeDetail, ComicIssueSummary } from '@shelvarr/types';

let db: typeof import('../../lib/db/index.js');
let queue: typeof import('@shelvarr/services/queue/index');
let dataDir: string;
let libraryDir: string;
let scratchDir: string;

const realFetch = globalThis.fetch;

const LINK_A = 'https://getcomics.org/dls/AAA';
const LINK_B = 'https://getcomics.org/dls/BBB';

/** A response the download client accepts as a real, resumable file. */
function fileResponse(body: string, url: string): Response {
  return new Response(body, {
    status: 206,
    headers: {
      'content-type': 'application/zip',
      'content-range': `bytes 0-${body.length - 1}/${body.length}`,
      'content-disposition': 'attachment; filename="Immortal Hulk 001.cbz"',
      'accept-ranges': 'bytes',
    },
  }) as Response & { url: string };
}

/**
 * Stub `fetch` with a per-URL handler. The client probes with a range request
 * and then fetches the body, so each URL is asked for more than once.
 */
function stubFetch(responses: Record<string, () => Response>): { calls: string[] } {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push(url);

    const make = responses[url];
    if (!make) return new Response('not found', { status: 404 });

    const response = make();
    // `Response.url` is read-only and empty for a constructed response; the
    // client reads it to follow redirects, so give it the URL it asked for.
    Object.defineProperty(response, 'url', { value: url });
    return response;
  }) as typeof fetch;
  return { calls };
}

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

function makeVolume(): ComicVolumeDetail {
  const issues = [makeIssue()];
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
    folder: libraryDir,
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

/**
 * Queue a download for the volume and run its task to completion, returning
 * the task's final status. `runTask` records a handler's error on the task
 * rather than re-throwing, so the status is how a failure is observed.
 */
async function runDownload(id: number): Promise<string> {
  const task = queue.createTask('comic_download', { comicDownloadId: id });
  await queue.runTask(task.id);
  return queue.getTask(task.id)?.status ?? 'missing';
}

describe('Comic download retries', () => {
  before(async () => {
    const stamp = Date.now();
    dataDir = `/tmp/shelvarr-comic-retry-test-${stamp}`;
    libraryDir = join(dataDir, 'library', 'Immortal Hulk');
    scratchDir = join(dataDir, 'downloads');
    process.env['DATA_DIR'] = dataDir;
    process.env['DB_PATH'] = join(dataDir, 'test.db');
    mkdirSync(libraryDir, { recursive: true });
    mkdirSync(scratchDir, { recursive: true });

    db = await import('../../lib/db/index.js');
    db.initDatabase();

    const { initServiceConfig } = await import('@shelvarr/services');
    initServiceConfig({
      env: 'test',
      port: 3000,
      dataDir,
      libraryRoot: join(dataDir, 'library'),
      dbPath: join(dataDir, 'test.db'),
      komga: { url: null, apiKey: null },
      comicMigration: { pathMap: null },
      getcomics: {
        baseUrl: 'https://getcomics.org',
        downloadDir: scratchDir,
        libraryRoot: join(dataDir, 'library'),
        hostPreference: ['getcomics', 'pixeldrain'],
        renameDownloadedFiles: true,
      },
      audiletome: { url: null, apiKey: null },
      supportedExtensions: ['.cbz'],
      rateLimits: { hardcover: 60 },
      hardcoverToken: null,
    });

    queue = await import('@shelvarr/services/queue/index');
  });

  after(() => {
    globalThis.fetch = realFetch;
    if (db) db.closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    db.getDb().exec(
      'DELETE FROM tasks; DELETE FROM comic_downloads; DELETE FROM comic_blocklist;' +
        ' DELETE FROM comic_download_history; DELETE FROM comic_issues; DELETE FROM comics;'
    );
    for (const entry of readdirSync(libraryDir)) {
      rmSync(join(libraryDir, entry), { force: true });
    }
    db.upsertComicDetail(makeVolume());
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('falls back to an alternate link when the first one is dead', async () => {
    stubFetch({
      [LINK_A]: () => new Response('gone', { status: 404 }),
      [LINK_B]: () => fileResponse('comic-bytes', LINK_B),
    });

    const download = db.addComicDownload({
      volumeId: 501,
      issueId: 9001,
      host: 'getcomics',
      downloadLink: LINK_A,
      alternateLinks: [{ host: 'getcomics', link: LINK_B }],
      filenameBody: 'Immortal Hulk (2018) Volume 01 Issue 001',
    });

    assert.strictEqual(await runDownload(download.id), 'completed');

    const after = db.getComicDownload(download.id)!;
    assert.strictEqual(after.state, 'completed');
    assert.strictEqual(after.downloadLink, LINK_B, 'switched to the alternate');
    assert.deepStrictEqual(after.alternateLinks, [], 'the alternate was consumed');
    assert.ok(
      existsSync(join(libraryDir, 'Immortal Hulk (2018) Volume 01 Issue 001.cbz')),
      'the file landed in the volume folder'
    );

    // The dead link is remembered so later searches skip it.
    assert.ok(db.comicBlocklistContains(LINK_A));
    assert.ok(!db.comicBlocklistContains(LINK_B));
  });

  it('fails once every link is exhausted, and says which error ended it', async () => {
    stubFetch({
      [LINK_A]: () => new Response('gone', { status: 404 }),
      [LINK_B]: () => new Response('gone too', { status: 410 }),
    });

    const download = db.addComicDownload({
      volumeId: 501,
      host: 'getcomics',
      downloadLink: LINK_A,
      alternateLinks: [{ host: 'getcomics', link: LINK_B }],
    });

    assert.strictEqual(await runDownload(download.id), 'failed');

    const after = db.getComicDownload(download.id)!;
    assert.strictEqual(after.state, 'failed');
    assert.match(after.error ?? '', /410/);
    assert.ok(db.comicBlocklistContains(LINK_A));
    assert.ok(db.comicBlocklistContains(LINK_B));

    const history = db.getComicDownloadHistory(10, 501);
    assert.strictEqual(history.length, 1, 'a real failure is recorded in history');
  });

  it('puts a rate-limited download back in the queue rather than failing it', async () => {
    stubFetch({ [LINK_A]: () => new Response('slow down', { status: 429 }) });

    const download = db.addComicDownload({
      volumeId: 501,
      host: 'getcomics',
      downloadLink: LINK_A,
    });

    assert.strictEqual(await runDownload(download.id), 'pending', 'requeued, not failed');

    const after = db.getComicDownload(download.id)!;
    assert.strictEqual(after.state, 'queued', 'still queued, not failed');
    assert.strictEqual(after.attempts, 1);
    assert.match(after.error ?? '', /Download limit reached/);
    assert.match(after.error ?? '', /attempt 1 of 5/);

    // Nothing went to history: the release is fine, the host is just busy.
    assert.strictEqual(db.getComicDownloadHistory(10, 501).length, 0);

    // The task is pending again so the retry queue can pick it up.
    const tasks = db.query<{ status: string }>("SELECT status FROM tasks WHERE type = 'comic_download'");
    assert.strictEqual(tasks[0]!.status, 'pending');
  });

  it('gives up on a host that keeps rate-limiting, so a later search can try elsewhere', async () => {
    stubFetch({ [LINK_A]: () => new Response('slow down', { status: 429 }) });

    const download = db.addComicDownload({
      volumeId: 501,
      host: 'getcomics',
      downloadLink: LINK_A,
    });
    // Four attempts already spent; this run is the fifth and last.
    db.execute('UPDATE comic_downloads SET attempts = 4 WHERE id = ?', [download.id]);

    assert.strictEqual(await runDownload(download.id), 'failed');

    const after = db.getComicDownload(download.id)!;
    assert.strictEqual(after.state, 'failed');
    assert.strictEqual(after.attempts, 5);
    assert.match(after.error ?? '', /gave up after 5 attempts/);
    assert.strictEqual(db.getComicDownloadHistory(10, 501).length, 1);
  });

  it('resumes a partial file rather than starting over', async () => {
    let bodyRequests = 0;
    stubFetch({
      [LINK_A]: () => {
        bodyRequests += 1;
        return fileResponse('comic-bytes', LINK_A);
      },
    });

    const download = db.addComicDownload({
      volumeId: 501,
      host: 'getcomics',
      downloadLink: LINK_A,
      filenameBody: 'Immortal Hulk (2018) Volume 01 Issue 001',
    });

    await runDownload(download.id);
    assert.ok(bodyRequests >= 2, 'probed and then fetched');
    assert.strictEqual(db.getComicDownload(download.id)!.state, 'completed');
  });

  it('throws away the dead link\'s partial file before trying the next', async () => {
    stubFetch({
      [LINK_A]: () => new Response('gone', { status: 404 }),
      [LINK_B]: () => fileResponse('comic-bytes', LINK_B),
    });

    const download = db.addComicDownload({
      volumeId: 501,
      host: 'getcomics',
      downloadLink: LINK_A,
      alternateLinks: [{ host: 'getcomics', link: LINK_B }],
      filenameBody: 'Immortal Hulk (2018) Volume 01 Issue 001',
    });

    // Both links suggest the same filename, so they share a scratch path. A
    // partial left by the first must not be resumed into the second's stream.
    writeFileSync(join(scratchDir, `${download.id}-Immortal Hulk 001.cbz`), 'junk');

    assert.strictEqual(await runDownload(download.id), 'completed');

    const imported = join(libraryDir, 'Immortal Hulk (2018) Volume 01 Issue 001.cbz');
    assert.strictEqual(readFileSync(imported, 'utf8'), 'comic-bytes');
  });

  it('records the article\'s other links as fallbacks when queueing', async () => {
    // One release, offered on two mirrors. Only the first is probed; the
    // second is kept for the download to fall back to.
    const post = {
      id: 1,
      title: 'Immortal Hulk #1',
      link: 'https://getcomics.org/marvel/immortal-hulk-1/',
      date: '2018-06-13T00:00:00',
      contentHtml:
        '<p style="text-align: center;"><strong>Immortal Hulk #1</strong><br />' +
        '<strong>Language :</strong> English | <strong>Year :</strong> 2018</p>' +
        `<p><div class="aio-button-center"><a href="${LINK_A}" title="DOWNLOAD NOW">DOWNLOAD NOW</a></div>` +
        `<div class="aio-button-center"><a href="${LINK_B}" title="MIRROR DOWNLOAD">MIRROR DOWNLOAD</a></div>` +
        '<hr />',
    };

    stubFetch({
      [LINK_A]: () => fileResponse('comic-bytes', LINK_A),
      [LINK_B]: () => fileResponse('comic-bytes', LINK_B),
    });

    const getcomics = await import('@shelvarr/services/comics/getcomics/index');
    const created = await getcomics.createDownloadsFromPost({ volumeId: 501, post });

    assert.strictEqual(created.length, 1);
    assert.strictEqual(created[0]!.downloadLink, LINK_A);
    assert.deepStrictEqual(created[0]!.alternateLinks, [{ host: 'getcomics', link: LINK_B }]);
  });

  it('resumes a download orphaned by a restart, and leaves live ones alone', async () => {
    const orphan = db.addComicDownload({
      volumeId: 501,
      host: 'getcomics',
      downloadLink: LINK_A,
    });
    const live = db.addComicDownload({
      volumeId: 501,
      host: 'getcomics',
      downloadLink: LINK_B,
    });
    // The orphan was last heard from an hour ago, mid-download; the other one
    // checked in a moment ago and is somebody else's work.
    db.execute(
      `UPDATE comic_downloads SET state = 'downloading',
              heartbeat_at = datetime('now', '-60 minutes') WHERE id = ?`,
      [orphan.id]
    );
    db.execute("UPDATE comic_downloads SET state = 'downloading' WHERE id = ?", [live.id]);

    // The sweep only queues the download tasks; stub the transport so the one
    // it starts finishes rather than reaching the network.
    stubFetch({ [LINK_A]: () => fileResponse('comic-bytes', LINK_A) });

    const task = queue.createTask('comic_resume', { staleMinutes: 30, limit: 25 });
    await queue.runTask(task.id);

    const result = queue.getTask(task.id)!;
    assert.strictEqual(result.status, 'completed');
    assert.deepStrictEqual(JSON.parse(result.result!).downloadIds, [orphan.id]);

    assert.strictEqual(
      db.getComicDownload(live.id)!.state,
      'downloading',
      'a download that is still checking in is left alone'
    );
  });

  it('will not let two sweeps claim the same orphan', () => {
    const orphan = db.addComicDownload({
      volumeId: 501,
      host: 'getcomics',
      downloadLink: LINK_A,
    });
    db.execute(
      `UPDATE comic_downloads SET state = 'importing',
              heartbeat_at = datetime('now', '-60 minutes') WHERE id = ?`,
      [orphan.id]
    );

    // Two server processes sweeping at once: the claim is the same statement
    // that finds the row, so only the first one gets it.
    const first = db.claimStalledComicDownloads(30);
    const second = db.claimStalledComicDownloads(30);

    assert.deepStrictEqual(
      first.map((download) => download.id),
      [orphan.id]
    );
    assert.deepStrictEqual(second, []);
    assert.strictEqual(db.getComicDownload(orphan.id)!.state, 'queued');
  });

  it('keeps the heartbeat warm while a download is making progress', () => {
    const download = db.addComicDownload({
      volumeId: 501,
      host: 'getcomics',
      downloadLink: LINK_A,
    });
    db.execute(
      `UPDATE comic_downloads SET state = 'downloading',
              heartbeat_at = datetime('now', '-60 minutes') WHERE id = ?`,
      [download.id]
    );

    db.updateComicDownloadProgress(download.id, 2048, 4096);

    assert.deepStrictEqual(db.claimStalledComicDownloads(30), []);
  });

  it('reset clears the counters so a spent download can be driven again', () => {
    const download = db.addComicDownload({
      volumeId: 501,
      host: 'getcomics',
      downloadLink: LINK_A,
    });
    db.startComicDownloadAttempt(download.id);
    db.setComicDownloadState(download.id, 'failed', { error: 'nope' });

    db.resetComicDownloadForRetry(download.id);

    const after = db.getComicDownload(download.id)!;
    assert.strictEqual(after.state, 'queued');
    assert.strictEqual(after.attempts, 0);
    assert.strictEqual(after.progress, 0);
    assert.strictEqual(after.error, null);
  });
});

describe('Comic download persistence', () => {
  before(async () => {
    if (!db) {
      dataDir = `/tmp/shelvarr-comic-retry-db-${Date.now()}`;
      process.env['DATA_DIR'] = dataDir;
      process.env['DB_PATH'] = join(dataDir, 'test.db');
      mkdirSync(dataDir, { recursive: true });
      db = await import('../../lib/db/index.js');
      db.initDatabase();
    }
  });

  beforeEach(() => {
    db.getDb().exec('DELETE FROM comic_downloads; DELETE FROM comic_issues; DELETE FROM comics;');
    db.upsertComicDetail(makeVolume());
  });

  it('round-trips alternate links, and treats a row without them as having none', () => {
    const withAlternates = db.addComicDownload({
      volumeId: 501,
      host: 'getcomics',
      downloadLink: LINK_A,
      alternateLinks: [
        { host: 'getcomics', link: LINK_B },
        { host: 'pixeldrain', link: 'https://pixeldrain.com/u/xyz' },
      ],
    });
    const without = db.addComicDownload({
      volumeId: 501,
      host: 'getcomics',
      downloadLink: 'https://getcomics.org/dls/CCC',
    });

    assert.strictEqual(db.getComicDownload(withAlternates.id)!.alternateLinks.length, 2);
    assert.deepStrictEqual(db.getComicDownload(without.id)!.alternateLinks, []);
  });

  it('counts attempts, defers without ending the download, and switches links', () => {
    const download = db.addComicDownload({
      volumeId: 501,
      host: 'getcomics',
      downloadLink: LINK_A,
      alternateLinks: [{ host: 'pixeldrain', link: 'https://pixeldrain.com/u/xyz' }],
    });

    assert.strictEqual(db.startComicDownloadAttempt(download.id), 1);
    assert.strictEqual(db.startComicDownloadAttempt(download.id), 2);
    assert.strictEqual(db.getComicDownload(download.id)!.state, 'downloading');

    db.deferComicDownload(download.id, 'rate limited');
    const deferred = db.getComicDownload(download.id)!;
    assert.strictEqual(deferred.state, 'queued');
    assert.strictEqual(deferred.attempts, 2, 'a deferral keeps the attempts already spent');
    assert.strictEqual(deferred.completedAt, null);

    db.switchComicDownloadLink(download.id, { host: 'pixeldrain', link: 'https://pixeldrain.com/u/xyz' }, []);
    const switched = db.getComicDownload(download.id)!;
    assert.strictEqual(switched.host, 'pixeldrain');
    assert.strictEqual(switched.downloadLink, 'https://pixeldrain.com/u/xyz');
    assert.deepStrictEqual(switched.alternateLinks, []);
    assert.strictEqual(switched.progress, 0, 'a different link is a different file');
  });
});
