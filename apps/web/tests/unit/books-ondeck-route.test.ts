/**
 * Unit tests for GET /api/books/ondeck — the caller's own in-progress books
 * merged with books marked "currently reading" on Hardcover, shaped as a
 * paged response.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { cleanup } from '@testing-library/react';

let authResult = true;
let readingUserId = 5;

const queryMock = mock.fn<(sql: string, params: unknown[]) => unknown[]>(() => []);
const getHardcoverReadingBooksMock =
  mock.fn<(userId: number, size: number, offset: number) => unknown[]>(() => []);

mock.module('@shelvarr/services', {
  namedExports: {
    validateApiAuth: () => authResult,
    getReadingUserId: () => readingUserId,
  },
});

mock.module('@shelvarr/services/api-response', {
  namedExports: {
    toApiBook: (row: { id: number }) => ({ id: String(row.id) }),
    toPagedResponse: (content: unknown[], page: number, size: number, totalElements: number) => ({
      content,
      number: page,
      size,
      totalElements,
    }),
  },
});

mock.module('@/lib/config', { namedExports: {} });

mock.module('@/lib/db', {
  namedExports: {
    query: (sql: string, params: unknown[]) => queryMock(sql, params),
    getReadProgress: () => null,
    getHardcoverReadingBooks: (userId: number, size: number, offset: number) =>
      getHardcoverReadingBooksMock(userId, size, offset),
  },
});

const { GET } = await import('@/app/api/books/ondeck/route');

function req(url = 'http://localhost/api/books/ondeck') {
  return new Request(url, { method: 'GET' });
}

describe('GET /api/books/ondeck', () => {
  beforeEach(() => {
    queryMock.mock.resetCalls();
    queryMock.mock.mockImplementation(() => []);
    getHardcoverReadingBooksMock.mock.resetCalls();
    getHardcoverReadingBooksMock.mock.mockImplementation(() => []);
    authResult = true;
    readingUserId = 5;
  });
  afterEach(cleanup);

  it('returns 401 when auth fails', () => {
    authResult = false;
    const res = GET(req() as any);
    assert.equal(res.status, 401);
  });

  it('merges local in-progress with Hardcover currently-reading books', async () => {
    queryMock.mock.mockImplementation(() => [{ id: 1 }, { id: 2 }]);
    getHardcoverReadingBooksMock.mock.mockImplementation(() => [{ id: 3 }]);
    const res = GET(req() as any);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.content, [{ id: '1' }, { id: '2' }, { id: '3' }]);
    assert.equal(body.totalElements, 3);
  });

  it('keeps the local entry when a book appears in both lists', async () => {
    queryMock.mock.mockImplementation(() => [{ id: 1 }]);
    getHardcoverReadingBooksMock.mock.mockImplementation(() => [{ id: 1 }, { id: 3 }]);
    const res = GET(req() as any);
    const body = await res.json();
    assert.deepEqual(body.content, [{ id: '1' }, { id: '3' }]);
    assert.equal(body.totalElements, 2);
  });

  it("looks up only the calling reader's progress", () => {
    readingUserId = 42;
    GET(req() as any);
    // The local half filters read_progress by user, the Hardcover half by the
    // progress it excludes — both need to know who is asking.
    assert.match(queryMock.mock.calls[0]?.arguments[0] ?? '', /rp\.user_id = \?/);
    assert.equal((queryMock.mock.calls[0]?.arguments[1] as unknown[])?.[0], 42);
    assert.equal(getHardcoverReadingBooksMock.mock.calls[0]?.arguments[0], 42);
  });

  it('paginates the merged list with page and size', async () => {
    queryMock.mock.mockImplementation(() => [{ id: 1 }, { id: 2 }, { id: 3 }]);
    getHardcoverReadingBooksMock.mock.mockImplementation(() => [{ id: 4 }]);
    const res = GET(req('http://localhost/api/books/ondeck?page=1&size=2') as any);
    const body = await res.json();
    assert.deepEqual(body.content, [{ id: '3' }, { id: '4' }]);
    assert.equal(body.totalElements, 4);
  });
});
