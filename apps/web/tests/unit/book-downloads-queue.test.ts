/**
 * The actions backing /downloads (E2-5): getBookDownloadQueue,
 * cancelBookDownload, retryBookDownload, unblockBookLink in
 * lib/actions/downloads.ts. Mirrors the real-database style
 * book-acquisition.test.ts already uses, since these actions are thin
 * wrappers around the book_downloads/book_blocklist helpers tested there.
 */

import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';

// Actions call revalidatePath, which throws outside a real Next.js request.
mock.module('next/cache', {
  namedExports: {
    revalidatePath: () => {},
    revalidateTag: () => {},
  },
});

let db: typeof import('../../lib/db/index.js');
let actions: typeof import('../../lib/actions/downloads.js');
let dataDir: string;

describe('Book download queue actions', () => {
  before(async () => {
    dataDir = '/tmp/shelvarr-book-downloads-queue-test-' + Date.now();
    process.env['DATA_DIR'] = dataDir;
    process.env['DB_PATH'] = join(dataDir, 'test.db');
    mkdirSync(dataDir, { recursive: true });

    db = await import('../../lib/db/index.js');
    db.initDatabase();
    actions = await import('../../lib/actions/downloads.js');
  });

  after(() => {
    if (db) db.closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    db.getDb().exec(
      'DELETE FROM book_downloads; DELETE FROM book_blocklist; DELETE FROM book_download_history; DELETE FROM tasks; DELETE FROM books; DELETE FROM libraries;'
    );
    db.getDb()
      .prepare('INSERT INTO libraries (id, name, path, type) VALUES (?, ?, ?, ?)')
      .run(701, 'Test Library', '/books-source', 'book');
  });

  describe('getBookDownloadQueue', () => {
    it('shapes the queue, history and blocklist for the page', async () => {
      const created = db.addBookDownload({
        libraryId: 701,
        source: 'libgen',
        title: 'The Fifth Season',
        author: 'N.K. Jemisin',
        extension: 'epub',
        downloadUrl: 'libgen:abc123',
        md5: 'abc123',
        alternateLinks: [
          {
            url: 'https://mirror2.example/get.php?md5=abc123',
            filename: 'the-fifth-season.epub',
            size: 1024,
            supportsRange: false,
            contentType: 'application/epub+zip',
          },
        ],
      });
      db.updateBookDownloadProgress(created.id, 500, 1000);

      db.addBookDownloadHistory({
        libraryId: 701,
        source: 'libgen',
        title: 'Old Book',
        author: 'Someone',
        downloadUrl: 'libgen:old',
        success: true,
      });

      db.addToBookBlocklist({
        downloadUrl: 'libgen:dead',
        reason: 'link-broken',
        title: 'Dead Book',
      });

      const view = await actions.getBookDownloadQueue();

      assert.strictEqual(view.downloads.length, 1);
      const download = view.downloads[0]!;
      assert.strictEqual(download.title, 'The Fifth Season');
      assert.strictEqual(download.author, 'N.K. Jemisin');
      assert.strictEqual(download.source, 'libgen');
      assert.strictEqual(download.state, 'queued');
      assert.strictEqual(download.progress, 500);
      assert.strictEqual(download.size, 1000);
      assert.strictEqual(download.alternates, 1);
      assert.strictEqual(download.libraryId, 701);
      assert.strictEqual(download.libraryName, 'Test Library');

      assert.strictEqual(view.history.length, 1);
      assert.strictEqual(view.history[0]!.title, 'Old Book');
      assert.strictEqual(view.history[0]!.success, true);

      assert.strictEqual(view.blocklist.length, 1);
      assert.strictEqual(view.blocklist[0]!.title, 'Dead Book');
      assert.strictEqual(view.blocklist[0]!.reason, 'link-broken');
    });

    it('resolves each download against its own library', async () => {
      db.getDb()
        .prepare('INSERT INTO libraries (id, name, path, type) VALUES (?, ?, ?, ?)')
        .run(702, 'Second Library', '/other-source', 'book');
      db.addBookDownload({
        libraryId: 701,
        source: 'libgen',
        title: 'First Book',
        author: null,
        extension: 'epub',
        downloadUrl: 'libgen:first',
        md5: 'first',
      });
      db.addBookDownload({
        libraryId: 702,
        source: 'libgen',
        title: 'Second Book',
        author: null,
        extension: 'epub',
        downloadUrl: 'libgen:second',
        md5: 'second',
      });

      const view = await actions.getBookDownloadQueue();
      const byTitle = new Map(view.downloads.map((d) => [d.title, d.libraryName]));
      assert.strictEqual(byTitle.get('First Book'), 'Test Library');
      assert.strictEqual(byTitle.get('Second Book'), 'Second Library');
    });
  });

  describe('cancelBookDownload', () => {
    it('marks an active download cancelled rather than deleting it', async () => {
      const created = db.addBookDownload({
        libraryId: 701,
        source: 'libgen',
        title: 'A Book',
        author: null,
        extension: 'epub',
        downloadUrl: 'libgen:active',
        md5: 'active',
      });
      db.setBookDownloadState(created.id, 'downloading');

      const result = await actions.cancelBookDownload(created.id);
      assert.strictEqual(result.success, true);

      const row = db.getBookDownload(created.id);
      assert.strictEqual(row?.state, 'cancelled');
    });

    it('deletes a terminal download outright', async () => {
      const created = db.addBookDownload({
        libraryId: 701,
        source: 'libgen',
        title: 'A Book',
        author: null,
        extension: 'epub',
        downloadUrl: 'libgen:done',
        md5: 'done',
      });
      db.setBookDownloadState(created.id, 'completed', { filePath: '/x/y.epub' });

      const result = await actions.cancelBookDownload(created.id);
      assert.strictEqual(result.success, true);
      assert.strictEqual(db.getBookDownload(created.id), null);
    });

    it('reports an error for a download that does not exist', async () => {
      const result = await actions.cancelBookDownload(999999);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Download not found');
    });
  });

  describe('retryBookDownload', () => {
    it('refuses to retry a download that is already active', async () => {
      const created = db.addBookDownload({
        libraryId: 701,
        source: 'libgen',
        title: 'A Book',
        author: null,
        extension: 'epub',
        downloadUrl: 'libgen:running',
        md5: 'running',
      });
      db.setBookDownloadState(created.id, 'downloading');

      const result = await actions.retryBookDownload(created.id);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Download is already downloading');
    });

    it('reports an error for a download that does not exist', async () => {
      const result = await actions.retryBookDownload(999999);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Download not found');
    });

    it('resets a failed download and enqueues a fresh download task', async () => {
      const created = db.addBookDownload({
        libraryId: 701,
        source: 'libgen',
        title: 'A Book',
        author: 'An Author',
        extension: 'epub',
        downloadUrl: 'libgen:retry-me',
        md5: 'retry-me',
      });
      db.updateBookDownloadProgress(created.id, 500, 1000);
      db.setBookDownloadState(created.id, 'failed', { error: 'All LibGen mirrors failed' });

      const result = await actions.retryBookDownload(created.id);
      assert.strictEqual(result.success, true);

      const row = db.getBookDownload(created.id)!;
      assert.strictEqual(row.state, 'queued');
      assert.strictEqual(row.progress, 0);
      assert.strictEqual(row.error, null);

      const task = db.queryOne<{ type: string; result: string }>(
        'SELECT type, result FROM tasks ORDER BY id DESC LIMIT 1'
      );
      assert.strictEqual(task?.type, 'download');
      const data = JSON.parse(task!.result);
      assert.strictEqual(data.bookDownloadId, created.id);
      assert.strictEqual(data.source, 'libgen');
      assert.strictEqual(data.md5, 'retry-me');
      assert.strictEqual(data.title, 'A Book');
      assert.strictEqual(data.author, 'An Author');
      assert.strictEqual(data.extension, 'epub');
      assert.strictEqual(data.libraryId, 701);
    });
  });

  describe('unblockBookLink', () => {
    it('removes a blocklist entry', async () => {
      db.addToBookBlocklist({ downloadUrl: 'libgen:blocked', reason: 'link-broken' });
      const [entry] = db.getBookBlocklist();

      const result = await actions.unblockBookLink(entry!.id);
      assert.strictEqual(result.success, true);
      assert.strictEqual(db.getBookBlocklist().length, 0);
    });
  });
});
