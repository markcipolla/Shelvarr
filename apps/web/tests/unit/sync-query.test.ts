/**
 * Tests for getSyncChangesSince — the DB layer that powers /api/sync.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';

let db: typeof import('../../lib/db/index.js');

describe('getSyncChangesSince', () => {
  before(async () => {
    process.env['DATA_DIR'] = '/tmp/shelvarr-sync-test-' + Date.now();
    process.env['DB_PATH'] = process.env['DATA_DIR'] + '/test.db';
    const fs = await import('fs');
    fs.mkdirSync(process.env['DATA_DIR']!, { recursive: true });
    db = await import('../../lib/db/index.js');
    db.initDatabase();
  });

  after(async () => {
    if (db) db.closeDatabase();
    const fs = await import('fs');
    if (process.env['DATA_DIR']) {
      fs.rmSync(process.env['DATA_DIR'], { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    const database = db.getDb();
    database.exec(`
      DELETE FROM comic_issues;
      DELETE FROM comics;
      DELETE FROM books;
      DELETE FROM libraries;
    `);
  });

  it('returns all rows when since is null', () => {
    db.execute(
      `INSERT INTO libraries (name, path) VALUES ('L', '/l')`
    );
    db.execute(
      `INSERT INTO comics (id, title) VALUES (1, 'A')`
    );
    db.execute(
      `INSERT INTO books (library_id, file_path, title) VALUES (1, '/b.epub', 'B')`
    );

    const changes = db.getSyncChangesSince(null);
    assert.strictEqual(changes.comics.length, 1);
    assert.strictEqual(changes.books.length, 1);
    assert.strictEqual(typeof changes.now, 'string');
    assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(changes.now));
  });

  it('filters rows by updated_at', () => {
    db.execute(
      `INSERT INTO comics (id, title, updated_at) VALUES (1, 'Old', '2020-01-01T00:00:00.000Z')`
    );
    db.execute(
      `INSERT INTO comics (id, title, updated_at) VALUES (2, 'New', '2030-01-01T00:00:00.000Z')`
    );
    const changes = db.getSyncChangesSince('2025-01-01T00:00:00.000Z');
    assert.strictEqual(changes.comics.length, 1);
    assert.strictEqual((changes.comics[0] as { title: string }).title, 'New');
  });

  it('orders rows by updated_at ascending', () => {
    db.execute(
      `INSERT INTO comics (id, title, updated_at) VALUES (1, 'B', '2025-02-01T00:00:00.000Z')`
    );
    db.execute(
      `INSERT INTO comics (id, title, updated_at) VALUES (2, 'A', '2025-01-01T00:00:00.000Z')`
    );
    const changes = db.getSyncChangesSince(null);
    const titles = (changes.comics as { title: string }[]).map((r) => r.title);
    assert.deepStrictEqual(titles, ['A', 'B']);
  });

  it('includes soft-deleted rows (tombstones)', () => {
    db.execute(
      `INSERT INTO comics (id, title, updated_at, deleted_at) VALUES (1, 'Gone', '2030-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z')`
    );
    const changes = db.getSyncChangesSince(null);
    assert.strictEqual(changes.comics.length, 1);
    assert.ok((changes.comics[0] as { deleted_at: string | null }).deleted_at);
  });

  it('returns empty arrays when nothing matches', () => {
    const changes = db.getSyncChangesSince('2099-01-01T00:00:00.000Z');
    assert.deepStrictEqual(changes.comics, []);
    assert.deepStrictEqual(changes.comic_issues, []);
    assert.deepStrictEqual(changes.books, []);
  });

  it('returns a `now` timestamp that is later than any returned row', () => {
    db.execute(
      `INSERT INTO comics (id, title, updated_at) VALUES (1, 'A', '2025-01-01T00:00:00.000Z')`
    );
    const changes = db.getSyncChangesSince(null);
    assert.ok(changes.now > '2025-01-01T00:00:00.000Z');
  });

  // The cursor we hand out is ISO; the rows it is compared against are written
  // by CURRENT_TIMESTAMP and so are naked UTC. Compared as strings, 'T' sorts
  // above ' ', so an ISO cursor used verbatim is greater than every naked row
  // stamped that same day — the client would sync once and then see nothing.
  describe('the cursor it hands out is comparable to the rows it stores', () => {
    it('finds a row written after an ISO cursor from the same day', () => {
      db.execute(
        `INSERT INTO comics (id, title, updated_at) VALUES (1, 'Before', '2026-09-16 01:00:00')`
      );
      const first = db.getSyncChangesSince(null);
      assert.strictEqual(first.comics.length, 1);

      // A change lands after the client's cursor, on the same date.
      db.execute(
        `INSERT INTO comics (id, title, updated_at) VALUES (2, 'After', '2026-09-16 23:59:59')`
      );

      const second = db.getSyncChangesSince(first.now);
      const titles = second.comics.map((c) => (c as { title: string }).title);
      assert.deepStrictEqual(titles, ['After']);
    });

    // The cursor is taken to the millisecond; CURRENT_TIMESTAMP only records
    // whole seconds. A row written later in the cursor's own second stores a
    // value equal to the floored cursor, and a strict `>` would lose it.
    it('does not lose a row written in the same second as the cursor', () => {
      const first = db.getSyncChangesSince(null);

      // `now` is mid-second; this row lands in that same second.
      const sameSecond = first.now.slice(0, 19).replace('T', ' ');
      db.execute(
        `INSERT INTO comics (id, title, updated_at) VALUES (1, 'Raced', ?)`,
        [sameSecond]
      );

      const second = db.getSyncChangesSince(first.now);
      const titles = second.comics.map((c) => (c as { title: string }).title);
      assert.deepStrictEqual(titles, ['Raced']);
    });

    it('still accepts a cursor already in the stored format', () => {
      db.execute(
        `INSERT INTO comics (id, title, updated_at) VALUES (1, 'Old', '2026-09-16 01:00:00')`
      );
      db.execute(
        `INSERT INTO comics (id, title, updated_at) VALUES (2, 'New', '2026-09-16 02:00:00')`
      );

      const changes = db.getSyncChangesSince('2026-09-16 01:30:00');
      const titles = changes.comics.map((c) => (c as { title: string }).title);
      assert.deepStrictEqual(titles, ['New']);
    });
  });
});
