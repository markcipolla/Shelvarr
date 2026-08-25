/**
 * Unit tests for the /api/comics route handler.
 *
 * The library is read from the database; there is no upstream to consult.
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import type { ComicVolumeSummary } from '@shelvarr/types';

type ListedVolume = ComicVolumeSummary & { managed: boolean };
type ListOptions = { search?: string; sort?: string };

let authResult = true;
const listComicVolumesMock = mock.fn<(options: ListOptions) => ListedVolume[]>(() => []);

mock.module('@shelvarr/services', {
  namedExports: {
    validateApiAuth: () => authResult,
  },
});

mock.module('@/lib/config', { namedExports: {} });

mock.module('@/lib/db', {
  namedExports: {
    listComicVolumes: (options: ListOptions) => listComicVolumesMock(options),
  },
});

function makeVolume(overrides: Partial<ListedVolume> = {}): ListedVolume {
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
    managed: true,
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
    listComicVolumesMock.mock.resetCalls();
    listComicVolumesMock.mock.mockImplementation(() => []);
  });

  it('returns 401 when auth validation fails', async () => {
    authResult = false;
    const res = await GET(makeRequest('http://host/api/comics'));
    assert.strictEqual(res.status, 401);
    assert.strictEqual((await res.json()).error, 'Unauthorized');
  });

  it('serves the library from the database', async () => {
    listComicVolumesMock.mock.mockImplementation(() => [makeVolume({ title: 'Saga' })]);

    const res = await GET(makeRequest('http://host/api/comics'));
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.volumes.length, 1);
    assert.strictEqual(body.volumes[0].title, 'Saga');
  });

  it('passes search and sort straight through', async () => {
    await GET(makeRequest('http://host/api/comics?search=batman&sort=year'));

    const options = listComicVolumesMock.mock.calls[0]!.arguments[0];
    assert.strictEqual(options.search, 'batman');
    assert.strictEqual(options.sort, 'year');
  });

  it('ignores an unknown sort value', async () => {
    await GET(makeRequest('http://host/api/comics?sort=notreal'));
    assert.strictEqual(listComicVolumesMock.mock.calls[0]!.arguments[0].sort, undefined);
  });

  it('omits both keys when neither was given', async () => {
    await GET(makeRequest('http://host/api/comics'));
    assert.deepStrictEqual(listComicVolumesMock.mock.calls[0]!.arguments[0], {});
  });

  it('returns an empty list rather than an error for an empty library', async () => {
    const res = await GET(makeRequest('http://host/api/comics'));
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual((await res.json()).volumes, []);
  });
});
