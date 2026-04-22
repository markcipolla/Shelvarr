/**
 * Unit tests for the /api/comics route handler.
 * Mocks the Kapowarr client + auth check so the test stays isolated from the DB.
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
    getVolumesMock.mock.mockImplementation(async () => []);
  });

  it('returns 401 when auth validation fails', async () => {
    authResult = false;
    const res = await GET(makeRequest('http://host/api/comics'));
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.error, 'Unauthorized');
  });

  it('returns configured:false when Kapowarr is not configured', async () => {
    configuredResult = false;
    const res = await GET(makeRequest('http://host/api/comics'));
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual(body, { configured: false, volumes: [] });
    assert.strictEqual(getVolumesMock.mock.callCount(), 0);
  });

  it('returns volumes when Kapowarr is configured', async () => {
    const volumes = [makeVolume({ id: 1, title: 'A' }), makeVolume({ id: 2, title: 'B' })];
    getVolumesMock.mock.mockImplementation(async () => volumes);

    const res = await GET(makeRequest('http://host/api/comics'));
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.configured, true);
    assert.strictEqual(body.volumes.length, 2);
    assert.strictEqual(body.volumes[0].title, 'A');
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

  it('returns error field when Kapowarr call throws', async () => {
    getVolumesMock.mock.mockImplementation(async () => {
      throw new Error('Kapowarr offline');
    });

    const res = await GET(makeRequest('http://host/api/comics'));
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.configured, true);
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
