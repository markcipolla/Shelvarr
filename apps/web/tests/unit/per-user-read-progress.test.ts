/**
 * Per-user read progress: the per-reader keys, the shared shelf a server
 * without accounts keeps using, and the handover to the first admin.
 *
 * The feature is meant to be additive — an install with no accounts must go on
 * behaving exactly as it did — so much of what is worth asserting here is that
 * nothing moved for the single-user case. The upgrade path itself is covered
 * in per-user-progress-migration.test.ts.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let db: typeof import('../../lib/db/index.js');
// The same module instance lib/db re-exports, for the account helpers the web
// app has no reason to re-export itself.
let accounts: typeof import('@shelvarr/db');
let root: string;

/** Column names of a table. */
function columns(table: string): string[] {
  return (db.getDb().prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (c) => c.name
  );
}

describe('Per-user read progress', () => {
  before(async () => {
    root = mkdtempSync(join(tmpdir(), 'shelvarr-per-user-progress-'));
    process.env['DATA_DIR'] = root;
    process.env['DB_PATH'] = join(root, 'test.db');

    db = await import('../../lib/db/index.js');
    db.initDatabase();
    accounts = await import('@shelvarr/db');
  });

  after(() => {
    if (db) db.closeDatabase();
    rmSync(root, { recursive: true, force: true });
  });

  const READER = 7;
  const OTHER_READER = 8;
  let libraryId: number;

  beforeEach(() => {
    db.getDb().exec(
      `DELETE FROM read_progress; DELETE FROM epub_progression;
       DELETE FROM comic_read_progress; DELETE FROM books; DELETE FROM libraries;
       DELETE FROM users;`
    );
    libraryId = Number(
      db.execute('INSERT INTO libraries (name, path) VALUES (?, ?)', ['Lib', '/tmp/lib'])
        .lastInsertRowid
    );
  });

  function addBook(title: string): number {
    return Number(
      db.execute('INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)', [
        libraryId,
        `/tmp/${title}.epub`,
        title,
      ]).lastInsertRowid
    );
  }

  describe('schema', () => {
    it('gives every progress table a user_id', () => {
      assert.ok(columns('read_progress').includes('user_id'));
      assert.ok(columns('comic_read_progress').includes('user_id'));
      assert.ok(columns('epub_progression').includes('user_id'));
    });

    it('lets two readers hold a row for the same book', () => {
      const book = addBook('Dune');
      db.upsertReadProgress(READER, book, 10, false);
      db.upsertReadProgress(OTHER_READER, book, 90, false);

      assert.strictEqual(db.getReadProgress(READER, book)?.page, 10);
      assert.strictEqual(db.getReadProgress(OTHER_READER, book)?.page, 90);
    });

    it('lets two readers hold a row for the same comic issue', () => {
      db.upsertComicReadProgress(READER, 4242, 3, false, 20);
      db.upsertComicReadProgress(OTHER_READER, 4242, 18, false, 20);

      assert.strictEqual(db.getComicReadProgress(READER, 4242)?.page, 3);
      assert.strictEqual(db.getComicReadProgress(OTHER_READER, 4242)?.page, 18);
    });

    it('keeps a device position per reader as well as per device', () => {
      const book = addBook('Dune');
      db.upsertEpubProgression(READER, book, 'phone', '{"cfi":"a"}', 0.1);
      db.upsertEpubProgression(READER, book, 'laptop', '{"cfi":"b"}', 0.2);
      db.upsertEpubProgression(OTHER_READER, book, 'phone', '{"cfi":"c"}', 0.9);

      assert.strictEqual(db.getEpubProgression(READER, book, 'phone')?.progression, 0.1);
      assert.strictEqual(db.getEpubProgression(OTHER_READER, book, 'phone')?.progression, 0.9);
      // Latest across a reader's own devices, never across readers.
      assert.strictEqual(db.getLatestEpubProgression(READER, book)?.device_id, 'laptop');
      assert.strictEqual(db.getLatestEpubProgression(OTHER_READER, book)?.device_id, 'phone');
    });
  });

  describe('the shared shelf', () => {
    it('is what an unattributed write lands on', () => {
      const book = addBook('Dune');
      db.upsertReadProgress(db.SHARED_USER_ID, book, 12, false);

      assert.strictEqual(db.getReadProgress(db.SHARED_USER_ID, book)?.page, 12);
      assert.strictEqual(db.getReadProgress(READER, book), null);
    });

    it('catches anything that is not a real account id', () => {
      // A caller with no identity, however it phrased that, reads the shared
      // shelf rather than silently getting its own private one.
      assert.strictEqual(db.progressUserId(null), db.SHARED_USER_ID);
      assert.strictEqual(db.progressUserId(undefined), db.SHARED_USER_ID);
      assert.strictEqual(db.progressUserId(0), db.SHARED_USER_ID);
      assert.strictEqual(db.progressUserId(-3), db.SHARED_USER_ID);
      assert.strictEqual(db.progressUserId(1.5), db.SHARED_USER_ID);
      assert.strictEqual(db.progressUserId(7), 7);
    });

    it('is read and written when a delete names no account', () => {
      const book = addBook('Dune');
      db.upsertReadProgress(db.SHARED_USER_ID, book, 12, false);

      assert.strictEqual(db.deleteReadProgress(READER, book), false, 'not this reader\'s row');
      assert.strictEqual(db.deleteReadProgress(db.SHARED_USER_ID, book), true);
      assert.strictEqual(db.getReadProgress(db.SHARED_USER_ID, book), null);
    });
  });

  describe('adoptSharedReadProgress', () => {
    it('hands the shared shelf to the first account', () => {
      const book = addBook('Dune');
      db.upsertReadProgress(db.SHARED_USER_ID, book, 40, false);
      db.upsertComicReadProgress(db.SHARED_USER_ID, 4242, 6, false, 20);
      db.upsertEpubProgression(db.SHARED_USER_ID, book, 'phone', '{"cfi":"a"}', 0.4);

      assert.strictEqual(db.adoptSharedReadProgress(READER), 3);

      assert.strictEqual(db.getReadProgress(READER, book)?.page, 40);
      assert.strictEqual(db.getComicReadProgress(READER, 4242)?.page, 6);
      assert.strictEqual(db.getEpubProgression(READER, book, 'phone')?.progression, 0.4);
      assert.strictEqual(db.getReadProgress(db.SHARED_USER_ID, book), null);
    });

    it('never overwrites progress the account already has', () => {
      const book = addBook('Dune');
      db.upsertReadProgress(db.SHARED_USER_ID, book, 40, false);
      db.upsertReadProgress(READER, book, 90, false);

      assert.strictEqual(db.adoptSharedReadProgress(READER), 0);
      assert.strictEqual(db.getReadProgress(READER, book)?.page, 90);
      assert.strictEqual(db.getReadProgress(db.SHARED_USER_ID, book)?.page, 40);
    });

    it('refuses to adopt the shared shelf onto itself', () => {
      const book = addBook('Dune');
      db.upsertReadProgress(db.SHARED_USER_ID, book, 40, false);

      assert.strictEqual(db.adoptSharedReadProgress(db.SHARED_USER_ID), 0);
      assert.strictEqual(db.getReadProgress(db.SHARED_USER_ID, book)?.page, 40);
    });

    it('runs when the setup wizard creates the first admin', async () => {
      const book = addBook('Dune');
      db.upsertReadProgress(db.SHARED_USER_ID, book, 40, false);

      const { auth } = await import('@shelvarr/services');
      const admin = auth.createFirstAdmin('first@example.com', 'First');

      assert.strictEqual(
        db.getReadProgress(admin.id, book)?.page,
        40,
        'turning accounts on must not look like losing your place'
      );

      // Everyone invited afterwards starts with an empty shelf.
      const second = auth.createAccount('second@example.com', 'Second');
      assert.strictEqual(db.getReadProgress(second.id, book), null);
    });
  });

  describe('deleting an account', () => {
    it('takes its reading with it and leaves everyone else alone', () => {
      const book = addBook('Dune');
      const user = accounts.createUser('gone@example.com', 'Gone', 'user');
      db.upsertReadProgress(user.id, book, 30, false);
      db.upsertComicReadProgress(user.id, 4242, 6, false, 20);
      db.upsertEpubProgression(user.id, book, 'phone', '{"cfi":"a"}', 0.3);
      db.upsertReadProgress(OTHER_READER, book, 70, false);
      db.upsertReadProgress(db.SHARED_USER_ID, book, 10, false);

      assert.strictEqual(accounts.deleteUser(user.id), true);

      assert.strictEqual(db.getReadProgress(user.id, book), null);
      assert.strictEqual(db.getComicReadProgress(user.id, 4242), null);
      assert.strictEqual(db.getEpubProgression(user.id, book, 'phone'), null);
      assert.strictEqual(db.getReadProgress(OTHER_READER, book)?.page, 70);
      assert.strictEqual(db.getReadProgress(db.SHARED_USER_ID, book)?.page, 10);
    });

    it('will not be talked into wiping the shared shelf', () => {
      const book = addBook('Dune');
      db.upsertReadProgress(db.SHARED_USER_ID, book, 10, false);

      assert.strictEqual(accounts.deleteUser(db.SHARED_USER_ID), false);
      assert.strictEqual(db.getReadProgress(db.SHARED_USER_ID, book)?.page, 10);
    });
  });
});
