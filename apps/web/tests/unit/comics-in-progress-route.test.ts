/**
 * Unit tests for the comic progress read APIs:
 *   GET /api/comics/in-progress      (volumes in progress)
 *   GET /api/comics/next-up          (next unread issue per volume)
 *   GET /api/comics/[id]/progress    (per-issue progress for a volume)
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { cleanup } from '@testing-library/react';

let authResult = true;

const getInProgressComicsMock = mock.fn<(limit: number) => unknown[]>(() => []);
const getNextUpComicsMock = mock.fn<(limit: number) => unknown[]>(() => []);
const getComicReadProgressForVolumeMock = mock.fn<(volumeId: number) => unknown[]>(() => []);

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
    getInProgressComics: (limit: number) => getInProgressComicsMock(limit),
    getNextUpComics: (limit: number) => getNextUpComicsMock(limit),
    getComicReadProgressForVolume: (volumeId: number) => getComicReadProgressForVolumeMock(volumeId),
  },
});

const inProgress = await import('@/app/api/comics/in-progress/route');
const nextUp = await import('@/app/api/comics/next-up/route');
const volumeProgress = await import('@/app/api/comics/[id]/progress/route');

describe('GET /api/comics/in-progress', () => {
  beforeEach(() => {
    getInProgressComicsMock.mock.resetCalls();
    getInProgressComicsMock.mock.mockImplementation(() => []);
    authResult = true;
  });
  afterEach(cleanup);

  function req(url = 'http://localhost/api/comics/in-progress') {
    return new Request(url, { method: 'GET' });
  }

  it('returns 401 when auth fails', async () => {
    authResult = false;
    const res = await inProgress.GET(req() as any);
    assert.equal(res.status, 401);
  });

  it('returns the in-progress comics list', async () => {
    const comics = [{ volume: { id: 101 }, issueId: 1, issueNumber: '3', page: 7, total: 22, updatedAt: 'x' }];
    getInProgressComicsMock.mock.mockImplementation(() => comics);
    const res = await inProgress.GET(req() as any);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { comics });
  });

  it('defaults the limit when none is supplied', async () => {
    await inProgress.GET(req() as any);
    assert.equal(getInProgressComicsMock.mock.calls[0].arguments[0], 20);
  });

  it('honors the limit query param', async () => {
    await inProgress.GET(req('http://localhost/api/comics/in-progress?limit=5') as any);
    assert.equal(getInProgressComicsMock.mock.calls[0].arguments[0], 5);
  });

  it('falls back to default for a non-numeric limit', async () => {
    await inProgress.GET(req('http://localhost/api/comics/in-progress?limit=abc') as any);
    assert.equal(getInProgressComicsMock.mock.calls[0].arguments[0], 20);
  });
});

describe('GET /api/comics/next-up', () => {
  beforeEach(() => {
    getNextUpComicsMock.mock.resetCalls();
    getNextUpComicsMock.mock.mockImplementation(() => []);
    authResult = true;
  });
  afterEach(cleanup);

  function req(url = 'http://localhost/api/comics/next-up') {
    return new Request(url, { method: 'GET' });
  }

  it('returns 401 when auth fails', async () => {
    authResult = false;
    const res = await nextUp.GET(req() as any);
    assert.equal(res.status, 401);
  });

  it('returns the next-up comics list', async () => {
    const comics = [{ volume: { id: 101 }, issueId: 2, issueNumber: '2', updatedAt: 'x' }];
    getNextUpComicsMock.mock.mockImplementation(() => comics);
    const res = await nextUp.GET(req() as any);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { comics });
  });

  it('defaults the limit when none is supplied', async () => {
    await nextUp.GET(req() as any);
    assert.equal(getNextUpComicsMock.mock.calls[0].arguments[0], 20);
  });

  it('honors the limit query param', async () => {
    await nextUp.GET(req('http://localhost/api/comics/next-up?limit=5') as any);
    assert.equal(getNextUpComicsMock.mock.calls[0].arguments[0], 5);
  });
});

describe('GET /api/comics/[id]/progress', () => {
  beforeEach(() => {
    getComicReadProgressForVolumeMock.mock.resetCalls();
    getComicReadProgressForVolumeMock.mock.mockImplementation(() => []);
    authResult = true;
  });
  afterEach(cleanup);

  function req() {
    return new Request('http://localhost/api/comics/101/progress', { method: 'GET' });
  }

  it('returns 401 when auth fails', async () => {
    authResult = false;
    const res = await volumeProgress.GET(req() as any, { params: Promise.resolve({ id: '101' }) });
    assert.equal(res.status, 401);
  });

  it('returns 400 for an invalid id', async () => {
    const res = await volumeProgress.GET(req() as any, { params: Promise.resolve({ id: 'nope' }) });
    assert.equal(res.status, 400);
  });

  it('returns per-issue progress for the volume', async () => {
    const progress = [{ issueId: 1, page: 5, completed: false, total: 20, updatedAt: 'x' }];
    getComicReadProgressForVolumeMock.mock.mockImplementation(() => progress);
    const res = await volumeProgress.GET(req() as any, { params: Promise.resolve({ id: '101' }) });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { progress });
    assert.equal(getComicReadProgressForVolumeMock.mock.calls[0].arguments[0], 101);
  });
});
