/**
 * COMIC_PATH_MAP is gone. A library adopted from another manager recorded its
 * folders as that manager's container saw them (`/data/Comics/Saga`), and that
 * used to be translated on every read by an env var every caller had to
 * remember — the scanner didn't, so it found an empty folder, decided the
 * volume had no files, and re-downloaded it on every sweep. The paths are
 * rewritten once at startup instead, against the library they belong to.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('comic path adoption migration', () => {
  let dir: string;
  let root: string;
  let db: typeof import('../../lib/db/index.js');

  const folder = (id: number) =>
    (
      db.getDb().prepare('SELECT folder AS f FROM comics WHERE id = ?').get(id) as {
        f: string | null;
      }
    ).f;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'shelvarr-comic-paths-'));
    process.env['DATA_DIR'] = dir;
    process.env['DB_PATH'] = join(dir, 'test.db');

    // The library as it is actually mounted here.
    root = join(dir, 'libraries', 'comics');
    mkdirSync(join(root, 'Saga'), { recursive: true });
    mkdirSync(join(root, 'Paper Girls', 'Volume 01 (2015)'), { recursive: true });
    writeFileSync(join(root, 'Saga', 'Saga (2012) Volume 01 Issue 001.cbz'), 'x');

    db = await import('../../lib/db/index.js');
    db.initDatabase();

    const raw = db.getDb();
    raw.prepare('INSERT INTO comic_root_folders (id, path) VALUES (9, ?)').run(root);
    // Flat layout, the way Kapowarr leaves it.
    raw
      .prepare("INSERT INTO comics (id, title, root_folder_id, folder) VALUES (1, 'Saga', 9, ?)")
      .run('/data/Comics/Saga');
    raw
      .prepare('INSERT INTO comic_files (id, volume_id, filepath, size) VALUES (1, 1, ?, 3)')
      .run('/data/Comics/Saga/Saga (2012) Volume 01 Issue 001.cbz');
    // Nested, so one trailing segment isn't enough to find it.
    raw
      .prepare(
        "INSERT INTO comics (id, title, root_folder_id, folder) VALUES (2, 'Paper Girls', 9, ?)"
      )
      .run('/data/Comics/Paper Girls/Volume 01 (2015)');
    // Already correct, and must be left exactly as it is.
    raw
      .prepare("INSERT INTO comics (id, title, root_folder_id, folder) VALUES (3, 'Done', 9, ?)")
      .run(join(root, 'Saga'));
    // Nothing on disk answers to this one.
    raw
      .prepare("INSERT INTO comics (id, title, root_folder_id, folder) VALUES (4, 'Absent', 9, ?)")
      .run('/data/Comics/Not Here');
    // The pre-comic-library mirror, which kept an issue's files as JSON.
    raw.prepare('INSERT INTO comic_issues (id, volume_id, issue_number, files) VALUES (1, 1, ?, ?)').run(
      '1',
      JSON.stringify([
        { id: 11, filepath: '/data/Comics/Saga/Saga (2012) Volume 01 Issue 001.cbz', size: 3 },
      ])
    );

    db.closeDatabase();
    db.initDatabase();
  });

  after(() => {
    db?.closeDatabase();
    rmSync(dir, { recursive: true, force: true });
  });

  it('re-roots a flat folder under the library it belongs to', () => {
    assert.strictEqual(folder(1), join(root, 'Saga'));
  });

  it('takes as many trailing segments as it needs for a nested one', () => {
    assert.strictEqual(folder(2), join(root, 'Paper Girls', 'Volume 01 (2015)'));
  });

  it('moves the volume files along with the folder', () => {
    assert.strictEqual(
      db.getComicFilesForVolume(1)[0]!.filepath,
      join(root, 'Saga', 'Saga (2012) Volume 01 Issue 001.cbz')
    );
  });

  it('rewrites the paths in the legacy per-issue files mirror', () => {
    const ref = db.getComicIssueFileRef(1);
    assert.strictEqual(
      JSON.parse(
        (
          db.getDb().prepare('SELECT files AS f FROM comic_issues WHERE id = 1').get() as {
            f: string;
          }
        ).f
      )[0].filepath,
      join(root, 'Saga', 'Saga (2012) Volume 01 Issue 001.cbz')
    );
    // The managed link wins when there is one, so this only proves the ref works.
    assert.ok(ref);
  });

  it('leaves a folder that is already right, and one nothing answers to', () => {
    assert.strictEqual(folder(3), join(root, 'Saga'));
    assert.strictEqual(folder(4), '/data/Comics/Not Here');
  });

  it('changes nothing on the next restart', () => {
    db.closeDatabase();
    db.initDatabase();
    assert.strictEqual(folder(1), join(root, 'Saga'));
    assert.strictEqual(folder(2), join(root, 'Paper Girls', 'Volume 01 (2015)'));
  });
});
