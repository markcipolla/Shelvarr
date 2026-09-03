/**
 * Unit tests for GET /api/books/next-up — the next unread book in each series
 * the user is partway through, merged with books marked "want to read" on
 * Hardcover, shaped as a paged response.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { cleanup } from '@testing-library/react';

let authResult = true;

const getNextUpBooksMock = mock.fn<(size: number, offset: number) => unknown[]>(() => []);
const getWantToReadBooksMock = mock.fn<(size: number, offset: number) => unknown[]>(() => []);

mock.module('@shelvarr/services', {
  namedExports: {
    validateApiAuth: () => authResult,
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
    getNextUpBooks: (size: number, offset: number) => getNextUpBooksMock(size, offset),
    getWantToReadBooks: (size: number, offset: number) => getWantToReadBooksMock(size, offset),
    getReadProgress: () => null,
  },
});

const { GET } = await import('@/app/api/books/next-up/route');

function req(url = 'http://localhost/api/books/next-up') {
  return new Request(url, { method: 'GET' });
}

describe('GET /api/books/next-up', () => {
  beforeEach(() => {
    getNextUpBooksMock.mock.resetCalls();
    getNextUpBooksMock.mock.mockImplementation(() => []);
    getWantToReadBooksMock.mock.resetCalls();
    getWantToReadBooksMock.mock.mockImplementation(() => []);
    authResult = true;
  });
  afterEach(cleanup);

  it('returns 401 when auth fails', () => {
    authResult = false;
    const res = GET(req() as any);
    assert.equal(res.status, 401);
  });

  it('merges series next-up with Hardcover want-to-read books', async () => {
    getNextUpBooksMock.mock.mockImplementation(() => [{ id: 7 }, { id: 8 }]);
    getWantToReadBooksMock.mock.mockImplementation(() => [{ id: 9 }]);
    const res = GET(req() as any);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.content, [{ id: '7' }, { id: '8' }, { id: '9' }]);
    assert.equal(body.totalElements, 3);
  });

  it('de-duplicates a book that is both next-up and want-to-read', async () => {
    getNextUpBooksMock.mock.mockImplementation(() => [{ id: 7 }]);
    getWantToReadBooksMock.mock.mockImplementation(() => [{ id: 7 }, { id: 9 }]);
    const res = GET(req() as any);
    const body = await res.json();
    assert.deepEqual(body.content, [{ id: '7' }, { id: '9' }]);
    assert.equal(body.totalElements, 2);
  });

  it('paginates the merged list with page and size', async () => {
    getNextUpBooksMock.mock.mockImplementation(() => [{ id: 1 }, { id: 2 }, { id: 3 }]);
    getWantToReadBooksMock.mock.mockImplementation(() => [{ id: 4 }, { id: 5 }]);
    const res = GET(req('http://localhost/api/books/next-up?page=1&size=2') as any);
    const body = await res.json();
    assert.deepEqual(body.content, [{ id: '3' }, { id: '4' }]);
    assert.equal(body.totalElements, 5);
  });
});
