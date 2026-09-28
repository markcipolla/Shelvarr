/**
 * The counts behind the download indicators on /books and /comics: a per-volume
 * tally for the grid's badge, and the totals for each index header.
 *
 * Only downloads still on their way count. A finished, failed or cancelled one
 * is history, and a volume with nothing in flight must not be marked.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';

let db: typeof import('../../lib/db/index.js');
let dataDir: string;

/** Queue a comic download and leave it in `state`. */
function comicDownload(volumeId: number, link: string, state?: 'completed' | 'failed' | 'cancelled') {
  const download = db.addComicDownload({
    volumeId,
    host: 'getcomics',
    downloadLink: link,
  });
  if (state) db.setComicDownloadState(download.id, state);
  return download;
}

describe('Download indicator counts', () => {
  before(async () => {
    dataDir = '/tmp/shelvarr-download-indicators-test-' + Date.now();
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
      'DELETE FROM comic_downloads; DELETE FROM book_downloads; DELETE FROM comics; DELETE FROM libraries;'
    );
    db.getDb()
      .prepare('INSERT INTO comics (id, title) VALUES (?, ?), (?, ?), (?, ?)')
      .run(801, 'Immortal Hulk', 802, 'Saga', 803, 'Paper Girls');
    db.getDb()
      .prepare('INSERT INTO libraries (id, name, path, type) VALUES (?, ?, ?, ?)')
      .run(801, 'Books', '/books', 'book');
  });

  describe('getActiveComicDownloadCounts', () => {
    it('counts only what is still on its way, per volume', () => {
      comicDownload(801, 'https://example.test/a');
      comicDownload(801, 'https://example.test/b');
      db.setComicDownloadState(comicDownload(801, 'https://example.test/c').id, 'downloading');
      comicDownload(801, 'https://example.test/done', 'completed');
      comicDownload(802, 'https://example.test/d');
      comicDownload(803, 'https://example.test/gone', 'failed');
      comicDownload(803, 'https://example.test/stop', 'cancelled');

      const counts = db.getActiveComicDownloadCounts([801, 802, 803]);
      assert.strictEqual(counts.get(801), 3, 'two queued plus one downloading');
      assert.strictEqual(counts.get(802), 1);
      assert.strictEqual(counts.get(803), undefined, 'nothing in flight, so no entry');
    });

    it('only reports the volumes it was asked about, and handles an empty page', () => {
      comicDownload(801, 'https://example.test/a');
      comicDownload(802, 'https://example.test/b');

      assert.deepStrictEqual([...db.getActiveComicDownloadCounts([802]).keys()], [802]);
      assert.strictEqual(db.getActiveComicDownloadCounts([]).size, 0);
    });
  });

  describe('countActiveDownloads', () => {
    it('totals books and comics separately, ignoring finished work', () => {
      comicDownload(801, 'https://example.test/a');
      comicDownload(802, 'https://example.test/b');
      comicDownload(803, 'https://example.test/old', 'completed');

      const queued = db.addBookDownload({
        libraryId: 801,
        source: 'libgen',
        title: 'The Fifth Season',
        extension: 'epub',
        downloadUrl: 'libgen:one',
      });
      db.setBookDownloadState(queued.id, 'importing');
      db.addBookDownload({
        libraryId: 801,
        source: 'libgen',
        title: 'The Obelisk Gate',
        extension: 'epub',
        downloadUrl: 'libgen:two',
      });
      const finished = db.addBookDownload({
        libraryId: 801,
        source: 'libgen',
        title: 'The Stone Sky',
        extension: 'epub',
        downloadUrl: 'libgen:three',
      });
      db.setBookDownloadState(finished.id, 'completed');

      assert.deepStrictEqual(db.countActiveDownloads(), { books: 2, comics: 2 });
    });

    it('is zero on a quiet server', () => {
      assert.deepStrictEqual(db.countActiveDownloads(), { books: 0, comics: 0 });
    });
  });
});
