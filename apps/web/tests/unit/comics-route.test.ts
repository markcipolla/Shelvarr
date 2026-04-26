/**
 * Unit tests for the /api/comics route handler.
 * Mocks the Kapowarr client, auth, and DB cache layer.
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import type { KapowarrVolume } from '@shelvarr/types';

let authResult = true;
let configuredResult = true;
const getVolumesMock = mock.fn<(params?: { query?: string; sort?: string }) => Promise<KapowarrVolume[]>>(
  async () => []
);
const configureMock = mock.fn<() => Promise<boolean>>(async () => configuredResult);
const getCachedComicsMock = mock.fn<() => KapowarrVolume[]>(() => []);
const upsertComicVolumesMock = mock.fn<(v: KapowarrVolume[]) => void>(() => {});

mock.module('@shelvarr/services', {
  namedExports: {
    validateApiAuth: () => authResult,
  },
});

mock.module('@/lib/services/kapowarr', {
  namedExports: {
    kapowarrClient: {
      getVolumes: (...args: any[]) => getVolumesMock(...args),
    },
    configureKapowarrFromDb: () => configureMock(),
  },
});

mock.module('@/lib/config', {
  namedExports: {},
});

mock.module('@/lib/db', {
  namedExports: {
    getCachedComics: () => getCachedComicsMock(),
    upsertComicVolumes: (v: KapowarrVolume[]) => upsertComicVolumesMock(v),
  },
});

function makeVolume(overrides: Partial<KapowarrVolume> = {}): KapowarrVolume {
  return {
    id: 1,
    comicvine_id: 100,
    title: 'Volume 1',
    year: 2020,
    publisher: 'Acme',
    volume_number: 1,
    description: '',
    monitored: true,
    monitor_new_issues: false,
    folder: '/c',
    issue_count: 10,
    issue_count_monitored: 10,
    issues_downloaded: 5,
    issues_downloaded_monitored: 5,
    total_size: 1024,
    ...overrides,
  };
}

function makeRequest(url: string): any {
  const parsed = new URL(url);
  return {
    headers: new Headers(),
    nextUrl: { searchParams: parsed.searchParams },
  };
}

const { GET } = await import('../../app/api/comics/route.js');

describe('GET /api/comics', () => {
  beforeEach(() => {
    authResult = true;
    configuredResult = true;
    getVolumesMock.mock.resetCalls();
    configureMock.mock.resetCalls();
    getCachedComicsMock.mock.resetCalls();
    upsertComicVolumesMock.mock.resetCalls();
    getVolumesMock.mock.mockImplementation(async () => []);
    getCachedComicsMock.mock.mockImplementation(() => []);
  });

  it('returns 401 when auth validation fails', async () => {
    authResult = false;
    const res = await GET(makeRequest('http://host/api/comics'));
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.error, 'Unauthorized');
  });

  it('returns configured:false with empty cache when Kapowarr is not configured', async () => {
    configuredResult = false;
    const res = await GET(makeRequest('http://host/api/comics'));
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.configured, false);
    assert.deepStrictEqual(body.volumes, []);
    assert.strictEqual(body.cached, false);
    assert.strictEqual(getVolumesMock.mock.callCount(), 0);
  });

  it('serves cached volumes when Kapowarr is not configured but cache has data', async () => {
    configuredResult = false;
    const cached = [makeVolume({ id: 1, title: 'Cached A' })];
    getCachedComicsMock.mock.mockImplementation(() => cached);
    const res = await GET(makeRequest('http://host/api/comics'));
    const body = await res.json();
    assert.strictEqual(body.configured, false);
    assert.strictEqual(body.cached, true);
    assert.strictEqual(body.volumes.length, 1);
    assert.strictEqual(body.volumes[0].title, 'Cached A');
  });

  it('returns volumes and persists them when Kapowarr is configured', async () => {
    const volumes = [makeVolume({ id: 1, title: 'A' }), makeVolume({ id: 2, title: 'B' })];
    getVolumesMock.mock.mockImplementation(async () => volumes);

    const res = await GET(makeRequest('http://host/api/comics'));
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.configured, true);
    assert.strictEqual(body.volumes.length, 2);
    assert.strictEqual(upsertComicVolumesMock.mock.callCount(), 1);
    assert.strictEqual((upsertComicVolumesMock.mock.calls[0].arguments[0] as KapowarrVolume[]).length, 2);
  });

  it('does not persist when a search or sort is applied (result is filtered)', async () => {
    getVolumesMock.mock.mockImplementation(async () => [makeVolume()]);
    await GET(makeRequest('http://host/api/comics?search=batman'));
    assert.strictEqual(upsertComicVolumesMock.mock.callCount(), 0);
  });

  it('forwards search param to Kapowarr client', async () => {
    await GET(makeRequest('http://host/api/comics?search=batman'));
    assert.strictEqual(getVolumesMock.mock.callCount(), 1);
    const call = getVolumesMock.mock.calls[0];
    assert.strictEqual(call.arguments[0]?.query, 'batman');
  });

  it('forwards valid sort param to Kapowarr client', async () => {
    await GET(makeRequest('http://host/api/comics?sort=title'));
    const call = getVolumesMock.mock.calls[0];
    assert.strictEqual(call.arguments[0]?.sort, 'title');
  });

  it('ignores unknown sort values', async () => {
    await GET(makeRequest('http://host/api/comics?sort=notreal'));
    const call = getVolumesMock.mock.calls[0];
    assert.strictEqual(call.arguments[0]?.sort, undefined);
  });

  it('falls back to cache when Kapowarr call throws', async () => {
    const cached = [makeVolume({ id: 7, title: 'Cached Fallback' })];
    getCachedComicsMock.mock.mockImplementation(() => cached);
    getVolumesMock.mock.mockImplementation(async () => {
      throw new Error('Kapowarr offline');
    });

    const res = await GET(makeRequest('http://host/api/comics'));
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.configured, true);
    assert.strictEqual(body.cached, true);
    assert.strictEqual(body.volumes.length, 1);
    assert.strictEqual(body.volumes[0].title, 'Cached Fallback');
    assert.strictEqual(body.error, 'Kapowarr offline');
  });

  it('returns empty list with error when Kapowarr throws and no cache available', async () => {
    getVolumesMock.mock.mockImplementation(async () => {
      throw new Error('Kapowarr offline');
    });
    const res = await GET(makeRequest('http://host/api/comics'));
    const body = await res.json();
    assert.strictEqual(body.cached, false);
    assert.deepStrictEqual(body.volumes, []);
    assert.strictEqual(body.error, 'Kapowarr offline');
  });

  it('returns generic error message for non-Error rejections', async () => {
    getVolumesMock.mock.mockImplementation(async () => {
      throw 'string reason';
    });

    const res = await GET(makeRequest('http://host/api/comics'));
    const body = await res.json();
    assert.strictEqual(body.error, 'Failed to load comics');
  });
});
