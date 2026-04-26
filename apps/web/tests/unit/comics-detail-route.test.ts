/**
 * Unit tests for the /api/comics/[id] route handler (cache-through detail).
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import type { KapowarrVolumeDetail } from '@shelvarr/types';

let authResult = true;
let configuredResult = true;
const getVolumeMock = mock.fn<(id: number) => Promise<KapowarrVolumeDetail>>();
const configureMock = mock.fn<() => Promise<boolean>>(async () => configuredResult);
const getCachedComicDetailMock = mock.fn<(id: number) => KapowarrVolumeDetail | null>(() => null);
const upsertComicDetailMock = mock.fn<(v: KapowarrVolumeDetail) => void>(() => {});

mock.module('@shelvarr/services', {
  namedExports: {
    validateApiAuth: () => authResult,
  },
});

mock.module('@/lib/services/kapowarr', {
  namedExports: {
    kapowarrClient: {
      getVolume: (id: number) => getVolumeMock(id),
    },
    configureKapowarrFromDb: () => configureMock(),
  },
});

mock.module('@/lib/config', {
  namedExports: {},
});

mock.module('@/lib/db', {
  namedExports: {
    getCachedComicDetail: (id: number) => getCachedComicDetailMock(id),
    upsertComicDetail: (v: KapowarrVolumeDetail) => upsertComicDetailMock(v),
  },
});

function makeDetail(overrides: Partial<KapowarrVolumeDetail> = {}): KapowarrVolumeDetail {
  return {
    id: 101,
    comicvine_id: 5001,
    title: 'Saga',
    year: 2012,
    publisher: 'Image',
    volume_number: 1,
    description: '',
    monitored: true,
    monitor_new_issues: false,
    folder: '/c/saga',
    issue_count: 10,
    issue_count_monitored: 10,
    issues_downloaded: 5,
    issues_downloaded_monitored: 5,
    total_size: 1024,
    special_version: null,
    special_version_locked: false,
    site_url: '',
    root_folder: 1,
    volume_folder: 'saga',
    issues: [],
    general_files: [],
    ...overrides,
  };
}

function makeRequest(): any {
  return { headers: new Headers() };
}

const { GET } = await import('../../app/api/comics/[id]/route.js');

describe('GET /api/comics/[id]', () => {
  beforeEach(() => {
    authResult = true;
    configuredResult = true;
    getVolumeMock.mock.resetCalls();
    configureMock.mock.resetCalls();
    getCachedComicDetailMock.mock.resetCalls();
    upsertComicDetailMock.mock.resetCalls();
    getCachedComicDetailMock.mock.mockImplementation(() => null);
    getVolumeMock.mock.mockImplementation(async () => makeDetail());
  });

  it('returns 401 when auth fails', async () => {
    authResult = false;
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: '101' }) });
    assert.strictEqual(res.status, 401);
  });

  it('returns 400 for non-numeric id', async () => {
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'abc' }) });
    assert.strictEqual(res.status, 400);
  });

  it('returns configured:false with no cache when Kapowarr is not configured and cache is empty', async () => {
    configuredResult = false;
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: '101' }) });
    const body = await res.json();
    assert.strictEqual(body.configured, false);
    assert.strictEqual(body.volume, undefined);
    assert.strictEqual(getVolumeMock.mock.callCount(), 0);
  });

  it('serves cached volume when Kapowarr is not configured but cache has the item', async () => {
    configuredResult = false;
    getCachedComicDetailMock.mock.mockImplementation(() => makeDetail({ id: 101, title: 'Cached Saga' }));
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: '101' }) });
    const body = await res.json();
    assert.strictEqual(body.configured, false);
    assert.strictEqual(body.cached, true);
    assert.strictEqual(body.volume.title, 'Cached Saga');
  });

  it('fetches from Kapowarr, persists detail, and returns fresh data', async () => {
    getVolumeMock.mock.mockImplementation(async () => makeDetail({ title: 'Fresh' }));
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: '101' }) });
    const body = await res.json();
    assert.strictEqual(body.configured, true);
    assert.strictEqual(body.cached, undefined);
    assert.strictEqual(body.volume.title, 'Fresh');
    assert.strictEqual(upsertComicDetailMock.mock.callCount(), 1);
    assert.strictEqual(getVolumeMock.mock.callCount(), 1);
    assert.strictEqual(getVolumeMock.mock.calls[0].arguments[0], 101);
  });

  it('falls back to cache on Kapowarr error', async () => {
    getCachedComicDetailMock.mock.mockImplementation(() => makeDetail({ id: 101, title: 'Stale' }));
    getVolumeMock.mock.mockImplementation(async () => {
      throw new Error('network fail');
    });
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: '101' }) });
    const body = await res.json();
    assert.strictEqual(body.configured, true);
    assert.strictEqual(body.cached, true);
    assert.strictEqual(body.volume.title, 'Stale');
    assert.strictEqual(body.error, 'network fail');
    assert.strictEqual(upsertComicDetailMock.mock.callCount(), 0);
  });

  it('returns error only when Kapowarr fails and cache is empty', async () => {
    getVolumeMock.mock.mockImplementation(async () => {
      throw new Error('network fail');
    });
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: '101' }) });
    const body = await res.json();
    assert.strictEqual(body.configured, true);
    assert.strictEqual(body.volume, undefined);
    assert.strictEqual(body.error, 'network fail');
  });
});
