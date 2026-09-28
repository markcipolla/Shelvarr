/**
 * Bookmarks and highlights: the storage layer against a real SQLite file, and
 * the route that fronts it against a stubbed one.
 *
 * The storage half is tested for real because the interesting behaviour is in
 * the schema — the UNIQUE key that turns "bookmarked this twice" from an error
 * into a no-op, the user_id that keeps two people on one server out of each
 * other's margins, and the cascade that stops a deleted book leaving orphaned
 * marks behind. None of that is visible through a mock.
 */

import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ---- Route half: a stubbed store, so only the route's own rules are on trial.

let authResult = true;
let readingUserId = 5;
let bookExists = true;
let nextId = 1;
type StoredAnnotation = {
  id: number;
  book_id: number;
  user_id: number;
  kind: string;
  cfi: string;
  text: string | null;
  colour: string | null;
  created_at: string;
};
let fakeRows: StoredAnnotation[] = [];

mock.module('@shelvarr/services', {
  namedExports: {
    validateApiAuth: () => authResult,
    getReadingUserId: () => readingUserId,
  },
});

mock.module('@/lib/config', { namedExports: {} });

mock.module('@/lib/db', {
  namedExports: {
    queryOne: () => (bookExists ? { id: 1 } : null),
    sqlTimeToIso: (value: string) => value,
    getReaderAnnotations: (userId: number, bookId: number) =>
      fakeRows.filter((r) => r.user_id === userId && r.book_id === bookId),
    addReaderAnnotation: (
      userId: number,
      bookId: number,
      kind: string,
      cfi: string,
      text: string | null,
      colour: string | null
    ) => {
      const existing = fakeRows.find(
        (r) => r.user_id === userId && r.book_id === bookId && r.kind === kind && r.cfi === cfi
      );
      if (existing) return existing;
      const row: StoredAnnotation = {
        id: nextId++,
        book_id: bookId,
        user_id: userId,
        kind,
        cfi,
        text,
        colour,
        created_at: '2026-09-17 10:00:00',
      };
      fakeRows.push(row);
      return row;
    },
    deleteReaderAnnotation: (userId: number, bookId: number, id: number) => {
      const before = fakeRows.length;
      fakeRows = fakeRows.filter(
        (r) => !(r.id === id && r.user_id === userId && r.book_id === bookId)
      );
      return fakeRows.length < before;
    },
  },
});

const { GET, POST, DELETE } = await import('@/app/api/books/[id]/annotations/route');

const params = Promise.resolve({ id: '1' });

function post(body: unknown): Request {
  return new Request('http://localhost/api/books/1/annotations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/books/[id]/annotations', () => {
  beforeEach(() => {
    authResult = true;
    readingUserId = 5;
    bookExists = true;
    fakeRows = [];
    nextId = 1;
  });

  it('turns away a request that has not said who it is', async () => {
    authResult = false;
    assert.equal((await GET(new Request('http://localhost/x'), { params })).status, 401);
    assert.equal((await POST(post({ kind: 'bookmark', cfi: 'a' }), { params })).status, 401);
  });

  it('saves a bookmark and lists it back', async () => {
    const created = await POST(post({ kind: 'bookmark', cfi: 'epubcfi(/6/2!/4)' }), { params });
    assert.strictEqual(created.status, 201);

    const listed = await (await GET(new Request('http://localhost/x'), { params })).json();
    assert.strictEqual(listed.length, 1);
    assert.strictEqual(listed[0].kind, 'bookmark');
    assert.strictEqual(listed[0].cfi, 'epubcfi(/6/2!/4)');
  });

  it('refuses a kind it does not recognise', async () => {
    const response = await POST(post({ kind: 'doodle', cfi: 'a' }), { params });
    assert.strictEqual(response.status, 400);
  });

  it('refuses an annotation with nowhere to point', async () => {
    const response = await POST(post({ kind: 'highlight' }), { params });
    assert.strictEqual(response.status, 400);
  });

  it('refuses to mark a book that is not there', async () => {
    bookExists = false;
    const response = await POST(post({ kind: 'bookmark', cfi: 'a' }), { params });
    assert.strictEqual(response.status, 404);
  });

  it('keeps one person’s marks away from another’s', async () => {
    await POST(post({ kind: 'highlight', cfi: 'a', text: 'mine' }), { params });

    readingUserId = 6;
    const theirs = await (await GET(new Request('http://localhost/x'), { params })).json();
    assert.deepStrictEqual(theirs, []);
  });

  it('removes a mark, and says so when there was nothing to remove', async () => {
    const created = await (await POST(post({ kind: 'bookmark', cfi: 'a' }), { params })).json();

    const gone = await DELETE(
      new Request(`http://localhost/api/books/1/annotations?annotationId=${created.id}`, {
        method: 'DELETE',
      }),
      { params }
    );
    assert.strictEqual(gone.status, 200);

    const again = await DELETE(
      new Request(`http://localhost/api/books/1/annotations?annotationId=${created.id}`, {
        method: 'DELETE',
      }),
      { params }
    );
    assert.strictEqual(again.status, 404);
  });

  it('will not delete by id alone — it has to be yours', async () => {
    const created = await (await POST(post({ kind: 'bookmark', cfi: 'a' }), { params })).json();

    readingUserId = 6;
    const response = await DELETE(
      new Request(`http://localhost/api/books/1/annotations?annotationId=${created.id}`, {
        method: 'DELETE',
      }),
      { params }
    );
    assert.strictEqual(response.status, 404);
  });
});

// ---- Storage half: a real database file.

describe('reader annotation storage', () => {
  let db: typeof import('@shelvarr/db');
  let root: string;
  let bookId: number;

  const READER = 7;
  const OTHER_READER = 8;

  before(async () => {
    root = mkdtempSync(join(tmpdir(), 'shelvarr-reader-annotations-'));
    process.env['DATA_DIR'] = root;
    process.env['DB_PATH'] = join(root, 'test.db');
    db = await import('@shelvarr/db');
    db.initDatabase(join(root, 'test.db'));
  });

  after(() => {
    if (db) db.closeDatabase();
    rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    db.getDb().exec(
      'DELETE FROM reader_annotations; DELETE FROM reader_preferences; DELETE FROM books; DELETE FROM libraries;'
    );
    const libraryId = Number(
      db.execute('INSERT INTO libraries (name, path) VALUES (?, ?)', ['Lib', '/tmp/lib'])
        .lastInsertRowid
    );
    bookId = Number(
      db.execute('INSERT INTO books (library_id, title, file_path) VALUES (?, ?, ?)', [
        libraryId,
        'The Final Empire',
        '/tmp/lib/final-empire.epub',
      ]).lastInsertRowid
    );
  });

  it('keeps preferences per person and nothing else', () => {
    db.setReaderPreferences(READER, JSON.stringify({ theme: 'dark' }));
    db.setReaderPreferences(OTHER_READER, JSON.stringify({ theme: 'sepia' }));

    assert.strictEqual(JSON.parse(db.getReaderPreferences(READER)!.preferences).theme, 'dark');
    assert.strictEqual(JSON.parse(db.getReaderPreferences(OTHER_READER)!.preferences).theme, 'sepia');
  });

  it('replaces preferences rather than piling up rows', () => {
    db.setReaderPreferences(READER, JSON.stringify({ theme: 'dark' }));
    db.setReaderPreferences(READER, JSON.stringify({ theme: 'light' }));

    const count = db.queryOne<{ n: number }>(
      'SELECT COUNT(*) AS n FROM reader_preferences WHERE user_id = ?',
      [READER]
    );
    assert.strictEqual(count?.n, 1);
    assert.strictEqual(JSON.parse(db.getReaderPreferences(READER)!.preferences).theme, 'light');
  });

  it('treats bookmarking the same spot twice as a slip, not an error', () => {
    const first = db.addReaderAnnotation(READER, bookId, 'bookmark', 'cfi-a', 'Chapter 1', null);
    const second = db.addReaderAnnotation(READER, bookId, 'bookmark', 'cfi-a', 'Chapter 1', null);

    assert.ok(first);
    assert.strictEqual(second?.id, first.id);
    assert.strictEqual(db.getReaderAnnotations(READER, bookId).length, 1);
  });

  it('tells a bookmark and a highlight at the same spot apart', () => {
    db.addReaderAnnotation(READER, bookId, 'bookmark', 'cfi-a', null, null);
    db.addReaderAnnotation(READER, bookId, 'highlight', 'cfi-a', 'a passage', null);
    assert.strictEqual(db.getReaderAnnotations(READER, bookId).length, 2);
  });

  it('keeps two readers of the same book out of each other’s margins', () => {
    db.addReaderAnnotation(READER, bookId, 'highlight', 'cfi-a', 'mine', null);
    db.addReaderAnnotation(OTHER_READER, bookId, 'highlight', 'cfi-b', 'theirs', null);

    assert.deepStrictEqual(
      db.getReaderAnnotations(READER, bookId).map((a) => a.text),
      ['mine']
    );
    assert.deepStrictEqual(
      db.getReaderAnnotations(OTHER_READER, bookId).map((a) => a.text),
      ['theirs']
    );
  });

  it('deletes only the asking reader’s own mark', () => {
    const mine = db.addReaderAnnotation(READER, bookId, 'bookmark', 'cfi-a', null, null)!;

    assert.strictEqual(db.deleteReaderAnnotation(OTHER_READER, bookId, mine.id), false);
    assert.strictEqual(db.getReaderAnnotations(READER, bookId).length, 1);

    assert.strictEqual(db.deleteReaderAnnotation(READER, bookId, mine.id), true);
    assert.strictEqual(db.getReaderAnnotations(READER, bookId).length, 0);
  });

  it('takes the marks with the book when the book goes', () => {
    db.addReaderAnnotation(READER, bookId, 'bookmark', 'cfi-a', null, null);
    db.execute('DELETE FROM books WHERE id = ?', [bookId]);
    assert.strictEqual(db.getReaderAnnotations(READER, bookId).length, 0);
  });
});
