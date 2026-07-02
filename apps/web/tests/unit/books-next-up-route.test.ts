/**
 * Unit tests for GET /api/books/next-up — the next unread book in each series
 * the user is partway through, shaped as a Komga paged response.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { cleanup } from '@testing-library/react';

let authResult = true;

const getNextUpBooksMock = mock.fn<(size: number, offset: number) => unknown[]>(() => []);
const countNextUpBooksMock = mock.fn<() => number>(() => 0);

mock.module('@shelvarr/services', {
  namedExports: {
    validateApiAuth: () => authResult,
  },
});

mock.module('@shelvarr/services/komga-response', {
  namedExports: {
    toKomgaBook: (row: { id: number }) => ({ id: String(row.id) }),
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
    countNextUpBooks: () => countNextUpBooksMock(),
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
    countNextUpBooksMock.mock.resetCalls();
    countNextUpBooksMock.mock.mockImplementation(() => 0);
    authResult = true;
  });
  afterEach(cleanup);

  it('returns 401 when auth fails', () => {
    authResult = false;
    const res = GET(req() as any);
    assert.equal(res.status, 401);
  });

  it('returns the next-up books as a paged response', async () => {
    getNextUpBooksMock.mock.mockImplementation(() => [{ id: 7 }, { id: 8 }]);
    countNextUpBooksMock.mock.mockImplementation(() => 2);
    const res = GET(req() as any);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.content, [{ id: '7' }, { id: '8' }]);
    assert.equal(body.totalElements, 2);
  });

  it('passes size and computed offset through to the query', () => {
    GET(req('http://localhost/api/books/next-up?page=2&size=5') as any);
    assert.deepEqual(getNextUpBooksMock.mock.calls[0].arguments, [5, 10]);
  });
});
