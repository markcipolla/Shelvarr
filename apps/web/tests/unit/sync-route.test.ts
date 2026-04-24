/**
 * Unit tests for the /api/sync route handler.
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

let authResult = true;
const syncMock = mock.fn<(since: string | null) => unknown>(() => ({
  comics: [],
  comic_issues: [],
  books: [],
  now: '2026-04-23T00:00:00.000Z',
}));

mock.module('@shelvarr/services', {
  namedExports: {
    validateApiAuth: () => authResult,
  },
});

mock.module('@/lib/config', {
  namedExports: {},
});

mock.module('@/lib/db', {
  namedExports: {
    getSyncChangesSince: (since: string | null) => syncMock(since),
  },
});

function makeRequest(url: string): any {
  const parsed = new URL(url);
  return {
    headers: new Headers(),
    nextUrl: { searchParams: parsed.searchParams },
  };
}

const { GET } = await import('../../app/api/sync/route.js');

describe('GET /api/sync', () => {
  beforeEach(() => {
    authResult = true;
    syncMock.mock.resetCalls();
  });

  it('returns 401 on auth failure', async () => {
    authResult = false;
    const res = await GET(makeRequest('http://h/api/sync'));
    assert.strictEqual(res.status, 401);
  });

  it('returns full snapshot when no `since` param is given', async () => {
    const res = await GET(makeRequest('http://h/api/sync'));
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok('comics' in body);
    assert.ok('comic_issues' in body);
    assert.ok('books' in body);
    assert.ok('now' in body);
    assert.strictEqual(syncMock.mock.callCount(), 1);
    assert.strictEqual(syncMock.mock.calls[0].arguments[0], null);
  });

  it('forwards ISO `since` to the DB layer', async () => {
    const since = '2026-04-22T12:00:00.000Z';
    await GET(makeRequest(`http://h/api/sync?since=${encodeURIComponent(since)}`));
    assert.strictEqual(syncMock.mock.calls[0].arguments[0], since);
  });

  it('accepts space-separated SQLite-style timestamps', async () => {
    const since = '2026-04-22 12:00:00';
    const res = await GET(makeRequest(`http://h/api/sync?since=${encodeURIComponent(since)}`));
    assert.strictEqual(res.status, 200);
  });

  it('rejects malformed `since` with 400', async () => {
    const res = await GET(makeRequest('http://h/api/sync?since=not-a-date'));
    assert.strictEqual(res.status, 400);
  });

  it('treats empty `since` as null', async () => {
    await GET(makeRequest('http://h/api/sync?since='));
    assert.strictEqual(syncMock.mock.calls[0].arguments[0], null);
  });
});
