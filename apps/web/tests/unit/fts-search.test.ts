/**
 * Tests for FTS5 full-text search helpers.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';

let db: typeof import('../../lib/db/index.js');

describe('buildFtsQuery', () => {
  before(async () => {
    process.env['DATA_DIR'] = '/tmp/shelvarr-fts-build-test-' + Date.now();
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

  it('returns empty string for empty input', () => {
    assert.strictEqual(db.buildFtsQuery(''), '');
    assert.strictEqual(db.buildFtsQuery('   '), '');
  });

  it('wraps a single token and appends a prefix wildcard', () => {
    assert.strictEqual(db.buildFtsQuery('batman'), '"batman"*');
  });

  it('joins multiple tokens with spaces', () => {
    assert.strictEqual(db.buildFtsQuery('dark knight returns'), '"dark"* "knight"* "returns"*');
  });

  it('strips embedded quotes to neutralize FTS5 syntax', () => {
    assert.strictEqual(db.buildFtsQuery('bob"s burgers'), '"bobs"* "burgers"*');
  });

  it('collapses runs of whitespace', () => {
    assert.strictEqual(db.buildFtsQuery('a   b'), '"a"* "b"*');
  });
});

describe('searchBooksFts', () => {
  before(async () => {
    process.env['DATA_DIR'] = '/tmp/shelvarr-books-fts-test-' + Date.now();
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
    database.exec(`DELETE FROM books; DELETE FROM libraries;`);
    db.execute(`INSERT INTO libraries (id, name, path) VALUES (1, 'L', '/l')`);
  });

  it('returns empty array for empty input', () => {
    assert.deepStrictEqual(db.searchBooksFts(''), []);
  });

  it('finds books by title', () => {
    db.execute(
      `INSERT INTO books (library_id, file_path, title) VALUES (1, '/a.epub', 'The Hobbit')`
    );
    db.execute(
      `INSERT INTO books (library_id, file_path, title) VALUES (1, '/b.epub', 'Jurassic Park')`
    );
    const results = db.searchBooksFts('hobbit');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0]?.title, 'The Hobbit');
  });

  it('finds books by author (JSON blob)', () => {
    db.execute(
      `INSERT INTO books (library_id, file_path, title, authors) VALUES (1, '/a.epub', 'Foundation', '["Isaac Asimov"]')`
    );
    const results = db.searchBooksFts('asimov');
    assert.strictEqual(results.length, 1);
  });

  it('finds books by partial prefix', () => {
    db.execute(
      `INSERT INTO books (library_id, file_path, title) VALUES (1, '/a.epub', 'Superman: Red Son')`
    );
    const results = db.searchBooksFts('sup');
    assert.strictEqual(results.length, 1);
  });

  it('finds books by series name', () => {
    db.execute(
      `INSERT INTO books (library_id, file_path, title, series_name) VALUES (1, '/a.epub', 'Book 1', 'Wheel of Time')`
    );
    const results = db.searchBooksFts('wheel');
    assert.strictEqual(results.length, 1);
  });

  it('excludes soft-deleted books', () => {
    db.execute(
      `INSERT INTO books (library_id, file_path, title, deleted_at) VALUES (1, '/a.epub', 'Gone', '2026-04-23T00:00:00.000Z')`
    );
    const results = db.searchBooksFts('gone');
    assert.strictEqual(results.length, 0);
  });

  it('respects the limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      db.execute(
        `INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)`,
        [1, `/x${i}.epub`, `Match ${i}`]
      );
    }
    const results = db.searchBooksFts('match', 3);
    assert.strictEqual(results.length, 3);
  });

  it('reflects updates via triggers', () => {
    const result = db.execute(
      `INSERT INTO books (library_id, file_path, title) VALUES (1, '/a.epub', 'Original')`
    );
    db.execute(`UPDATE books SET title = 'Renamed' WHERE id = ?`, [result.lastInsertRowid]);
    assert.strictEqual(db.searchBooksFts('original').length, 0);
    assert.strictEqual(db.searchBooksFts('renamed').length, 1);
  });

  it('removes rows from the index on delete', () => {
    const result = db.execute(
      `INSERT INTO books (library_id, file_path, title) VALUES (1, '/a.epub', 'ToDelete')`
    );
    db.execute(`DELETE FROM books WHERE id = ?`, [result.lastInsertRowid]);
    assert.strictEqual(db.searchBooksFts('todelete').length, 0);
  });
});

describe('searchComicsFts', () => {
  before(async () => {
    process.env['DATA_DIR'] = '/tmp/shelvarr-comics-fts-test-' + Date.now();
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
    database.exec(`DELETE FROM comic_issues; DELETE FROM comics;`);
  });

  it('returns empty array for empty input', () => {
    assert.deepStrictEqual(db.searchComicsFts(''), []);
  });

  it('finds comics by title', () => {
    db.execute(
      `INSERT INTO comics (id, title) VALUES (1, 'Saga')`
    );
    const results = db.searchComicsFts('saga');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0]?.title, 'Saga');
  });

  it('finds comics by publisher', () => {
    db.execute(
      `INSERT INTO comics (id, title, publisher) VALUES (1, 'Something', 'Image Comics')`
    );
    const results = db.searchComicsFts('image');
    assert.strictEqual(results.length, 1);
  });

  it('finds comics by description', () => {
    db.execute(
      `INSERT INTO comics (id, title, description) VALUES (1, 'T', 'a space opera with alien romance')`
    );
    const results = db.searchComicsFts('opera');
    assert.strictEqual(results.length, 1);
  });

  it('excludes soft-deleted comics', () => {
    db.execute(
      `INSERT INTO comics (id, title, deleted_at) VALUES (1, 'Gone', '2026-04-23T00:00:00.000Z')`
    );
    const results = db.searchComicsFts('gone');
    assert.strictEqual(results.length, 0);
  });

  it('respects the limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      db.execute(
        `INSERT INTO comics (id, title) VALUES (?, ?)`,
        [i + 1, `Match ${i}`]
      );
    }
    const results = db.searchComicsFts('match', 2);
    assert.strictEqual(results.length, 2);
  });

  it('reflects updates via triggers', () => {
    db.execute(`INSERT INTO comics (id, title) VALUES (1, 'Original Name')`);
    db.execute(`UPDATE comics SET title = 'Renamed Volume' WHERE id = 1`);
    assert.strictEqual(db.searchComicsFts('original').length, 0);
    assert.strictEqual(db.searchComicsFts('renamed').length, 1);
  });
});
