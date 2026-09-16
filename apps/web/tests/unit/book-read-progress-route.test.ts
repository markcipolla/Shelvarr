/**
 * Unit tests for PATCH /api/books/[id]/read-progress.
 *
 * A client can mark a book read without knowing what page the reader stopped
 * on — the tick on the home shelf, the phone's detail screen. The saved page
 * has to survive that, or marking the book unread again would reopen it at the
 * start.
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

let authResult = true;
let readingUserId = 5;
let savedProgress: { page: number; completed: number } | null = null;

const upsertReadProgressMock =
  mock.fn<(userId: number, bookId: number, page: number, completed: boolean) => void>(() => {});

mock.module('@shelvarr/services', {
  namedExports: {
    validateApiAuth: () => authResult,
    getReadingUserId: () => readingUserId,
  },
});

mock.module('@/lib/config', { namedExports: {} });

mock.module('@/lib/db', {
  namedExports: {
    queryOne: () => ({ id: 1, metadata_id: null, metadata_source: null }),
    getReadProgress: () => savedProgress,
    upsertReadProgress: (...args: Parameters<typeof upsertReadProgressMock>) =>
      upsertReadProgressMock(...args),
    deleteReadProgress: () => true,
  },
});

mock.module('@/lib/services/metadata/hardcover', {
  namedExports: { upsertReadingStatus: async () => {} },
});

const { PATCH } = await import('@/app/api/books/[id]/read-progress/route');

function patch(body: object): Request {
  return new Request('http://localhost/api/books/1/read-progress', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: '1' });

describe('PATCH /api/books/[id]/read-progress', () => {
  beforeEach(() => {
    upsertReadProgressMock.mock.resetCalls();
    authResult = true;
    readingUserId = 5;
    savedProgress = { page: 137, completed: 0 };
  });

  it('returns 401 when auth fails', async () => {
    authResult = false;
    const res = await PATCH(patch({ completed: true }), { params });
    assert.equal(res.status, 401);
  });

  it('keeps the saved page when the client only says completed', async () => {
    await PATCH(patch({ completed: true }), { params });

    assert.deepEqual(upsertReadProgressMock.mock.calls[0].arguments, [5, 1, 137, true]);
  });

  it('records page 0 for a book that was never opened', async () => {
    savedProgress = null;
    await PATCH(patch({ completed: true }), { params });

    assert.deepEqual(upsertReadProgressMock.mock.calls[0].arguments, [5, 1, 0, true]);
  });

  it('takes the page the client sends over the saved one', async () => {
    await PATCH(patch({ page: 42, completed: false }), { params });

    assert.deepEqual(upsertReadProgressMock.mock.calls[0].arguments, [5, 1, 42, false]);
  });

  it('honours an explicit page 0 rather than reviving the saved page', async () => {
    await PATCH(patch({ page: 0, completed: false }), { params });

    assert.deepEqual(upsertReadProgressMock.mock.calls[0].arguments, [5, 1, 0, false]);
  });
});
