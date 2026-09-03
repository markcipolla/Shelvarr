/**
 * Unit tests for the comic issue progress API routes.
 * Tests GET and PATCH /api/comics/issues/[id]/progress
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { cleanup } from '@testing-library/react';

let authResult = true;
let readingUserId = 5;

const getComicReadProgressMock =
  mock.fn<(userId: number, issueId: number) => object | null>(() => null);
const upsertComicReadProgressMock = mock.fn<(userId: number, issueId: number, page: number, completed: boolean, total?: number | null) => void>(() => {});

mock.module('@shelvarr/services', {
  namedExports: {
    validateApiAuth: () => authResult,
    getReadingUserId: () => readingUserId,
    openComicArchive: async () => ({ contentType: 'application/x-cbz', body: Buffer.from(''), filename: 'test.cbz' }),
  },
});

mock.module('@/lib/config', {
  namedExports: {},
});

mock.module('@/lib/db', {
  namedExports: {
    getComicReadProgress: (userId: number, id: number) => getComicReadProgressMock(userId, id),
    upsertComicReadProgress: (...args: Parameters<typeof upsertComicReadProgressMock>) => upsertComicReadProgressMock(...args),
  },
});

const { GET, PATCH } = await import('@/app/api/comics/issues/[id]/progress/route');

function makeRequest(method: string, body?: object): Request {
  return new Request('http://localhost/api/comics/issues/1/progress', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const params = Promise.resolve({ id: '1' });

describe('GET /api/comics/issues/[id]/progress', () => {
  beforeEach(() => {
    getComicReadProgressMock.mock.resetCalls();
    authResult = true;
    readingUserId = 5;
  });
  afterEach(cleanup);

  it('returns 401 when auth fails', async () => {
    authResult = false;
    const res = await GET(makeRequest('GET') as any, { params });
    assert.equal(res.status, 401);
  });

  it('returns null when no progress exists', async () => {
    getComicReadProgressMock.mock.mockImplementationOnce(() => null);
    const res = await GET(makeRequest('GET') as any, { params });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body, null);
  });

  it('returns the progress row when it exists', async () => {
    const row = { id: 1, issue_id: 1, page: 5, completed: 0, total: 24, created_at: '2024-01-01', updated_at: '2024-01-01' };
    getComicReadProgressMock.mock.mockImplementationOnce(() => row);
    const res = await GET(makeRequest('GET') as any, { params });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, row);
  });

  it('returns 400 for invalid id', async () => {
    const res = await GET(makeRequest('GET') as any, { params: Promise.resolve({ id: 'notanumber' }) });
    assert.equal(res.status, 400);
  });

  it("reads the calling reader's progress, not everyone's", async () => {
    readingUserId = 42;
    await GET(makeRequest('GET') as any, { params });
    assert.equal(getComicReadProgressMock.mock.calls[0].arguments[0], 42);
  });
});

describe('PATCH /api/comics/issues/[id]/progress', () => {
  beforeEach(() => {
    upsertComicReadProgressMock.mock.resetCalls();
    getComicReadProgressMock.mock.resetCalls();
    authResult = true;
    readingUserId = 5;
  });
  afterEach(cleanup);

  it('returns 401 when auth fails', async () => {
    authResult = false;
    const res = await PATCH(makeRequest('PATCH', { page: 3, completed: false }) as any, { params });
    assert.equal(res.status, 401);
  });

  it('upserts progress and returns the saved row', async () => {
    const savedRow = { id: 1, issue_id: 1, page: 3, completed: 0, total: null, created_at: '2024-01-01', updated_at: '2024-01-01' };
    getComicReadProgressMock.mock.mockImplementation(() => savedRow);

    const res = await PATCH(makeRequest('PATCH', { page: 3, completed: false }) as any, { params });
    assert.equal(res.status, 200);

    assert.equal(upsertComicReadProgressMock.mock.calls.length, 1);
    const [userId, issueId, page, completed, total] =
      upsertComicReadProgressMock.mock.calls[0].arguments;
    assert.equal(userId, 5);
    assert.equal(issueId, 1);
    assert.equal(page, 3);
    assert.equal(completed, false);
    assert.equal(total, null);

    const body = await res.json();
    assert.deepEqual(body, savedRow);
  });

  it('passes total when provided', async () => {
    getComicReadProgressMock.mock.mockImplementation(() => ({ id: 1, issue_id: 1, page: 5, completed: 0, total: 24 }));
    await PATCH(makeRequest('PATCH', { page: 5, completed: false, total: 24 }) as any, { params });

    const [, , , , total] = upsertComicReadProgressMock.mock.calls[0].arguments;
    assert.equal(total, 24);
  });

  it("writes to the calling reader's shelf", async () => {
    readingUserId = 42;
    getComicReadProgressMock.mock.mockImplementation(() => null);
    await PATCH(makeRequest('PATCH', { page: 3, completed: false }) as any, { params });

    assert.equal(upsertComicReadProgressMock.mock.calls[0].arguments[0], 42);
    assert.equal(getComicReadProgressMock.mock.calls[0].arguments[0], 42);
  });
});
