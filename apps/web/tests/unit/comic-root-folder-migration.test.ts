/**
 * Comic root folders became libraries. Existing installs keep their root
 * folder ids — comics.root_folder_id points at them — and gain a matching
 * library of type 'comic' so both kinds of library are managed in one place.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('comic root folder migration', () => {
  let dir: string;
  let db: typeof import('../../lib/db/index.js');

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'shelvarr-comic-root-'));
    process.env['DATA_DIR'] = dir;
    process.env['DB_PATH'] = join(dir, 'test.db');

    db = await import('../../lib/db/index.js');
    db.initDatabase();

    // Rewind to the pre-migration shape: a root folder with no library.
    const raw = db.getDb();
    raw.exec('DROP INDEX IF EXISTS idx_comic_root_folders_library');
    raw.exec('ALTER TABLE comic_root_folders DROP COLUMN library_id');
    raw.prepare("INSERT INTO comic_root_folders (id, path) VALUES (7, '/data/Comics')").run();
    raw.prepare("INSERT INTO comics (id, title, root_folder_id) VALUES (1, 'Saga', 7)").run();
    raw
      .prepare("INSERT INTO libraries (name, path, type) VALUES ('Ebooks', '/data/Books', 'book')")
      .run();
    db.closeDatabase();

    db.initDatabase();
  });

  after(() => {
    db?.closeDatabase();
    rmSync(dir, { recursive: true, force: true });
  });

  it('leaves the root folder id alone so volumes keep their files', () => {
    const root = db.getComicRootFolder(7);
    assert.ok(root);
    assert.strictEqual(root.path, '/data/Comics');
    assert.strictEqual(
      (db.getDb().prepare('SELECT root_folder_id AS r FROM comics WHERE id = 1').get() as
        { r: number }).r,
      7
    );
  });

  it('gives it a comic library named after the folder, alongside the book ones', () => {
    assert.deepStrictEqual(
      db.getDb().prepare('SELECT name, path, type FROM libraries ORDER BY path').all(),
      [
        { name: 'Ebooks', path: '/data/Books', type: 'book' },
        { name: 'Comics', path: '/data/Comics', type: 'comic' },
      ]
    );
    assert.strictEqual(db.getComicRootFolderForLibrary(db.getComicRootFolder(7)!.libraryId)?.id, 7);
  });

  it('does not mint a second library when the app restarts', () => {
    db.closeDatabase();
    db.initDatabase();
    assert.strictEqual(
      (db.getDb().prepare('SELECT COUNT(*) AS c FROM libraries').get() as { c: number }).c,
      2
    );
  });
});
