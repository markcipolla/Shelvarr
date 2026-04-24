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
});
