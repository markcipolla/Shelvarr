/**
 * Book acquisition persistence: the book_downloads queue, history, and
 * blocklist added in E2-1, mirroring the comic acquisition tables covered
 * by comics-acquisition.test.ts.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';

let db: typeof import('../../lib/db/index.js');
let dataDir: string;

describe('Book acquisition', () => {
  before(async () => {
    dataDir = '/tmp/shelvarr-book-acq-test-' + Date.now();
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
      'DELETE FROM book_downloads; DELETE FROM book_blocklist; DELETE FROM book_download_history; DELETE FROM books; DELETE FROM libraries;'
    );
    db.getDb()
      .prepare('INSERT INTO libraries (id, name, path, type) VALUES (?, ?, ?, ?)')
      .run(701, 'Test Library', '/books-source', 'book');
  });

  describe('download queue', () => {
    it('queues a download and reads it back', () => {
      const created = db.addBookDownload({
        libraryId: 701,
        source: 'libgen',
        title: 'The Fifth Season',
        author: 'N.K. Jemisin',
        extension: 'epub',
        downloadUrl: 'libgen:abc123',
        md5: 'abc123',
      });

      assert.strictEqual(created.state, 'queued');
      assert.strictEqual(created.bookId, null);
      assert.strictEqual(created.attempts, 0);

      const fetched = db.getBookDownload(created.id);
      assert.strictEqual(fetched?.title, 'The Fifth Season');
      assert.strictEqual(fetched?.source, 'libgen');
      assert.strictEqual(fetched?.md5, 'abc123');
    });

    it('records progress and a completion timestamp', () => {
      const created = db.addBookDownload({
        libraryId: 701,
        source: 'libgen',
        title: 'A Book',
        author: 'An Author',
        extension: 'epub',
        downloadUrl: 'libgen:def456',
        md5: 'def456',
      });

      db.updateBookDownloadProgress(created.id, 1_048_576, 1_048_576);
      let row = db.getBookDownload(created.id)!;
      assert.strictEqual(row.progress, 1_048_576);
      assert.strictEqual(row.size, 1_048_576);
      assert.strictEqual(row.completedAt, null);

      db.getDb()
        .prepare('INSERT INTO books (id, library_id, file_path, title) VALUES (?, ?, ?, ?)')
        .run(42, 701, '/books-source/a-book.epub', 'A Book');
      db.setBookDownloadState(created.id, 'completed', { filePath: '/books-source/a-book.epub', bookId: 42 });
      row = db.getBookDownload(created.id)!;
      assert.strictEqual(row.state, 'completed');
      assert.strictEqual(row.filePath, '/books-source/a-book.epub');
      assert.strictEqual(row.bookId, 42);
      assert.ok(row.completedAt);
    });

    it('keeps the size when a later progress update does not know it', () => {
      const created = db.addBookDownload({
        libraryId: 701,
        source: 'libgen',
        title: 'A Book',
        author: null,
        extension: 'epub',
        downloadUrl: 'libgen:ghi789',
        md5: 'ghi789',
      });
      db.updateBookDownloadProgress(created.id, 10, 500);
      db.updateBookDownloadProgress(created.id, 20, null);
      assert.strictEqual(db.getBookDownload(created.id)?.size, 500);
    });

    it('records an error on failure without touching the file path', () => {
      const created = db.addBookDownload({
        libraryId: 701,
        source: 'libgen',
        title: 'A Book',
        author: null,
        extension: 'epub',
        downloadUrl: 'libgen:jkl012',
        md5: 'jkl012',
      });
      db.setBookDownloadState(created.id, 'failed', { error: 'All LibGen mirrors failed' });

      const row = db.getBookDownload(created.id)!;
      assert.strictEqual(row.state, 'failed');
      assert.strictEqual(row.error, 'All LibGen mirrors failed');
      assert.strictEqual(row.filePath, null);
      assert.ok(row.completedAt);
    });

    it('stores and round-trips alternate mirrors (E2-3)', () => {
      const alternateLinks = [
        {
          url: 'https://libgen2.example/get.php?md5=abc123&key=two',
          filename: 'the-fifth-season.epub',
          size: 1024,
          supportsRange: false,
          contentType: 'application/epub+zip',
        },
        {
          url: 'https://libgen3.example/get.php?md5=abc123&key=three',
          filename: 'the-fifth-season.epub',
          size: 1024,
          supportsRange: false,
          contentType: 'application/epub+zip',
        },
      ];
      const created = db.addBookDownload({
        libraryId: 701,
        source: 'libgen',
        title: 'The Fifth Season',
        author: 'N.K. Jemisin',
        extension: 'epub',
        downloadUrl: 'libgen:abc123',
        md5: 'abc123',
        alternateLinks,
      });

      assert.deepStrictEqual(created.alternateLinks, alternateLinks);
      assert.deepStrictEqual(db.getBookDownload(created.id)?.alternateLinks, alternateLinks);
    });

    it('defaults to no alternates when none are given', () => {
      const created = db.addBookDownload({
        libraryId: 701,
        source: 'libgen',
        title: 'A Book',
        author: null,
        extension: 'epub',
        downloadUrl: 'libgen:noalts',
        md5: 'noalts',
      });
      assert.deepStrictEqual(created.alternateLinks, []);
    });

    it('switchBookDownloadLink replaces the remaining alternates and resets progress/size', () => {
      const alternateLinks = [
        { url: 'https://libgen2.example/get.php?md5=x&key=two', filename: 'a.epub', size: 500, supportsRange: false, contentType: 'application/epub+zip' },
        { url: 'https://libgen3.example/get.php?md5=x&key=three', filename: 'a.epub', size: 500, supportsRange: false, contentType: 'application/epub+zip' },
      ];
      const created = db.addBookDownload({
        libraryId: 701,
        source: 'libgen',
        title: 'A Book',
        author: null,
        extension: 'epub',
        downloadUrl: 'libgen:x',
        md5: 'x',
        alternateLinks,
      });
      db.updateBookDownloadProgress(created.id, 400, 500);

      // The first mirror died; fall through to the second, dropping it from
      // the remaining pool.
      db.switchBookDownloadLink(created.id, [alternateLinks[1]!]);

      const row = db.getBookDownload(created.id)!;
      assert.deepStrictEqual(row.alternateLinks, [alternateLinks[1]]);
      assert.strictEqual(row.progress, 0);
      assert.strictEqual(row.size, null);

      // Exhausting the pool clears the column rather than storing `[]`.
      db.switchBookDownloadLink(created.id, []);
      assert.deepStrictEqual(db.getBookDownload(created.id)?.alternateLinks, []);
    });

    it('filters the queue by state and library', () => {
      const a = db.addBookDownload({
        libraryId: 701,
        source: 'libgen',
        title: 'Book A',
        author: null,
        extension: 'epub',
        downloadUrl: 'libgen:a',
        md5: 'a',
      });
      db.addBookDownload({
        libraryId: 701,
        source: 'libgen',
        title: 'Book B',
        author: null,
        extension: 'epub',
        downloadUrl: 'libgen:b',
        md5: 'b',
      });
      db.setBookDownloadState(a.id, 'failed', { error: 'nope' });

      assert.strictEqual(db.getBookDownloads({ state: 'queued' }).length, 1);
      assert.strictEqual(db.getBookDownloads({ state: 'failed' }).length, 1);
      assert.strictEqual(db.getBookDownloads({ libraryId: 701 }).length, 2);
      assert.strictEqual(db.getBookDownloads({ libraryId: 999 }).length, 0);
    });
  });

  describe('blocklist', () => {
    it('records and finds a blocked link', () => {
      db.addToBookBlocklist({
        downloadUrl: 'libgen:dead',
        reason: 'link-broken',
      });
      assert.ok(db.bookBlocklistContains('libgen:dead'));
      assert.ok(!db.bookBlocklistContains('libgen:alive'));
    });

    it('updates rather than duplicates on re-block', () => {
      db.addToBookBlocklist({ downloadUrl: 'libgen:dupe', reason: 'link-broken' });
      db.addToBookBlocklist({ downloadUrl: 'libgen:dupe', reason: 'added-by-user' });

      const count = db.getDb().prepare('SELECT COUNT(*) as c FROM book_blocklist').get() as { c: number };
      assert.strictEqual(count.c, 1);

      const row = db.getDb().prepare('SELECT reason FROM book_blocklist WHERE download_url = ?').get('libgen:dupe') as { reason: string };
      assert.strictEqual(row.reason, 'added-by-user');
    });

    it('lists blocklist entries newest-first (E2-5)', () => {
      db.addToBookBlocklist({ downloadUrl: 'libgen:one', reason: 'link-broken', title: 'One' });
      db.addToBookBlocklist({ downloadUrl: 'libgen:two', reason: 'no-working-links', title: 'Two' });

      const entries = db.getBookBlocklist();
      assert.strictEqual(entries.length, 2);
      assert.strictEqual(entries[0]!.downloadUrl, 'libgen:two');
      assert.strictEqual(entries[0]!.title, 'Two');
      assert.strictEqual(entries[1]!.downloadUrl, 'libgen:one');
    });

    it('removes one entry, leaving the rest (E2-5)', () => {
      db.addToBookBlocklist({ downloadUrl: 'libgen:one', reason: 'link-broken' });
      db.addToBookBlocklist({ downloadUrl: 'libgen:two', reason: 'link-broken' });

      const [first] = db.getBookBlocklist().sort((a, b) => a.id - b.id);
      assert.ok(db.removeFromBookBlocklist(first!.id));
      assert.strictEqual(db.getBookBlocklist().length, 1);
      assert.strictEqual(db.removeFromBookBlocklist(999999), false);
    });
  });

  describe('history', () => {
    it('records successes and failures', () => {
      db.addBookDownloadHistory({
        libraryId: 701,
        source: 'libgen',
        title: 'A Book',
        author: 'An Author',
        downloadUrl: 'libgen:abc',
        success: true,
      });
      db.addBookDownloadHistory({
        libraryId: 701,
        source: 'libgen',
        title: 'Another Book',
        downloadUrl: 'libgen:def',
        success: false,
      });

      const rows = db.query<{ success: number }>('SELECT success FROM book_download_history ORDER BY id ASC', []);
      assert.strictEqual(rows.length, 2);
      assert.strictEqual(rows[0]!.success, 1);
      assert.strictEqual(rows[1]!.success, 0);
    });

    it('filters by library, newest first (E2-5)', () => {
      db.getDb()
        .prepare('INSERT INTO libraries (id, name, path, type) VALUES (?, ?, ?, ?)')
        .run(702, 'Other Library', '/other-source', 'book');

      db.addBookDownloadHistory({
        libraryId: 701,
        source: 'libgen',
        title: 'Library 701 Book',
        downloadUrl: 'libgen:l1',
        success: true,
      });
      db.addBookDownloadHistory({
        libraryId: 702,
        source: 'libgen',
        title: 'Library 702 Book',
        downloadUrl: 'libgen:l2',
        success: true,
      });

      const history = db.getBookDownloadHistory(10, 701) as Array<{ title: string }>;
      assert.strictEqual(history.length, 1);
      assert.strictEqual(history[0]!.title, 'Library 701 Book');
      assert.strictEqual(db.getBookDownloadHistory(10, 999999).length, 0);
    });
  });

  describe('retry and deletion (E2-5)', () => {
    it('resetBookDownloadForRetry clears progress, attempts and error, and re-queues', () => {
      const created = db.addBookDownload({
        libraryId: 701,
        source: 'libgen',
        title: 'A Book',
        author: null,
        extension: 'epub',
        downloadUrl: 'libgen:retry',
        md5: 'retry',
      });
      db.updateBookDownloadProgress(created.id, 500, 1000);
      db.setBookDownloadState(created.id, 'failed', { error: 'All LibGen mirrors failed' });

      db.resetBookDownloadForRetry(created.id);

      const row = db.getBookDownload(created.id)!;
      assert.strictEqual(row.state, 'queued');
      assert.strictEqual(row.progress, 0);
      assert.strictEqual(row.attempts, 0);
      assert.strictEqual(row.error, null);
      assert.strictEqual(row.filePath, null);
      assert.strictEqual(row.completedAt, null);
    });

    it('deleteBookDownload removes the row', () => {
      const created = db.addBookDownload({
        libraryId: 701,
        source: 'libgen',
        title: 'A Book',
        author: null,
        extension: 'epub',
        downloadUrl: 'libgen:del',
        md5: 'del',
      });
      assert.ok(db.deleteBookDownload(created.id));
      assert.strictEqual(db.getBookDownload(created.id), null);
      assert.strictEqual(db.deleteBookDownload(created.id), false);
    });
  });
});
