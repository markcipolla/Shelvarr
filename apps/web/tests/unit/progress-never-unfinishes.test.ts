/**
 * Removing a title from Currently Reading has to stick.
 *
 * Both shelves are "titles with progress that isn't finished", so the "×" on a
 * cover works by marking the thing read. Every other write to progress then has
 * to respect that: a reader saving its position is reporting where somebody is,
 * not claiming they haven't finished. When those saves defaulted `completed` to
 * false, a removed title climbed back onto the shelf the next time anything
 * touched it.
 *
 * Covers the two writes the per-route tests don't: the EPUB progression PUT,
 * and the read-status filter behind the phone's In Progress list.
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

let readingUserId = 5;
let savedProgress: { page: number; completed: number } | null = null;
let lastSql = '';
let lastParams: unknown[] = [];

const upsertReadProgressMock =
  mock.fn<(userId: number, bookId: number, page: number, completed: boolean) => void>(() => {});

mock.module('@shelvarr/services', {
  namedExports: {
    validateApiAuth: () => true,
    getReadingUserId: () => readingUserId,
  },
});

mock.module('@shelvarr/services/api-response', {
  namedExports: {
    toEpubProgression: (row: unknown) => row,
    toApiBook: (row: unknown) => row,
    toPagedResponse: (content: unknown[]) => ({ content }),
  },
});

mock.module('@/lib/config', { namedExports: {} });

mock.module('@/lib/db', {
  namedExports: {
    query: (sql: string, params: unknown[]) => {
      lastSql = sql;
      lastParams = params;
      return [];
    },
    queryOne: (sql: string, params: unknown[]) => {
      if (sql.includes('COUNT(*)')) {
        lastSql = sql;
        lastParams = params;
        return { count: 0 };
      }
      return { id: 1, metadata_id: null, metadata_source: null };
    },
    getReadProgress: () => savedProgress,
    getEpubProgression: () => ({ id: 1, book_id: 1, progression: 0.4 }),
    getLatestEpubProgression: () => null,
    upsertEpubProgression: () => {},
    upsertReadProgress: (...args: Parameters<typeof upsertReadProgressMock>) =>
      upsertReadProgressMock(...args),
  },
});

mock.module('@/lib/services/metadata/hardcover', {
  namedExports: { syncReadingProgress: async () => {} },
});

const { PUT } = await import('@/app/api/books/[id]/progression/route');
const { GET: listBooks } = await import('@/app/api/books/route');

const params = Promise.resolve({ id: '1' });

function put(progression: number): Request {
  return new Request('http://localhost/api/books/1/progression', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: 'web', progression, locator: 'epubcfi(/6/4)' }),
  });
}

describe('PUT /api/books/[id]/progression', () => {
  beforeEach(() => {
    upsertReadProgressMock.mock.resetCalls();
    readingUserId = 5;
    savedProgress = null;
  });

  it('mirrors an unfinished position into read_progress', async () => {
    await PUT(put(0.4), { params });
    assert.deepEqual(upsertReadProgressMock.mock.calls[0].arguments, [5, 1, 1, false]);
  });

  it('marks the book read once the position reaches the end', async () => {
    await PUT(put(0.99), { params });
    assert.deepEqual(upsertReadProgressMock.mock.calls[0].arguments, [5, 1, 0, true]);
  });

  it('does not un-finish a book that was marked read', async () => {
    savedProgress = { page: 0, completed: 1 };
    await PUT(put(0.4), { params });
    assert.deepEqual(upsertReadProgressMock.mock.calls[0].arguments, [5, 1, 0, true]);
  });
});

describe('GET /api/books?read_status=...', () => {
  beforeEach(() => {
    readingUserId = 7;
    lastSql = '';
    lastParams = [];
  });

  function list(readStatus: string): void {
    listBooks(
      { nextUrl: new URL(`http://localhost/api/books?read_status=${readStatus}`), headers: new Headers() } as never
    );
  }

  for (const status of ['IN_PROGRESS', 'UNREAD', 'READ']) {
    it(`scopes ${status} to the calling reader`, () => {
      list(status);
      assert.match(lastSql, /rp\.user_id = \?/);
      assert.ok(lastParams.includes(7), `expected user 7 in ${JSON.stringify(lastParams)}`);
    });
  }
});
