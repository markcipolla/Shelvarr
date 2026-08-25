/**
 * Unit tests for the /api/comics/[id] route handler.
 *
 * Volumes Shelvarr manages are served from its own tables. A volume that has
 * not been migrated yet is still readable from the cached mirror data, so the
 * reader keeps working during a migration.
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import type { ComicVolumeDetail } from '@shelvarr/types';

let authResult = true;
const deleteVolumeMock = mock.fn<(id: number, options: object) => Promise<void>>(async () => {});
const getCachedComicDetailMock = mock.fn<(id: number) => ComicVolumeDetail | null>(() => null);
const getManagedComicDetailMock = mock.fn<(id: number) => ComicVolumeDetail | null>(() => null);

mock.module('@shelvarr/services', {
  namedExports: {
    validateApiAuth: () => authResult,
    comicLibrary: {
      deleteVolume: (...args: unknown[]) => deleteVolumeMock(...(args as [number, object])),
    },
  },
});

mock.module('@/lib/config', { namedExports: {} });

mock.module('@/lib/db', {
  namedExports: {
    getCachedComicDetail: (id: number) => getCachedComicDetailMock(id),
    getManagedComicDetail: (id: number) => getManagedComicDetailMock(id),
  },
});

function makeDetail(overrides: Partial<ComicVolumeDetail> = {}): ComicVolumeDetail {
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

function makeRequest(search = ''): any {
  return {
    headers: new Headers(),
    nextUrl: { searchParams: new URLSearchParams(search) },
  };
}

const { GET, DELETE } = await import('../../app/api/comics/[id]/route.js');

describe('GET /api/comics/[id]', () => {
  beforeEach(() => {
    authResult = true;
    getCachedComicDetailMock.mock.resetCalls();
    getManagedComicDetailMock.mock.resetCalls();
    getCachedComicDetailMock.mock.mockImplementation(() => null);
    getManagedComicDetailMock.mock.mockImplementation(() => null);
  });

  it('returns 401 when auth fails', async () => {
    authResult = false;
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: '101' }) });
    assert.strictEqual(res.status, 401);
  });

  it('returns 400 for a non-numeric id', async () => {
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'abc' }) });
    assert.strictEqual(res.status, 400);
  });

  it('serves a managed volume and says so', async () => {
    getManagedComicDetailMock.mock.mockImplementation(() => makeDetail({ title: 'Owned Saga' }));

    const body = await (
      await GET(makeRequest(), { params: Promise.resolve({ id: '101' }) })
    ).json();

    assert.strictEqual(body.managed, true);
    assert.strictEqual(body.volume.title, 'Owned Saga');
  });

  it('falls back to mirrored data for a volume that has not been migrated', async () => {
    getCachedComicDetailMock.mock.mockImplementation(() => makeDetail({ title: 'Not Migrated' }));

    const body = await (
      await GET(makeRequest(), { params: Promise.resolve({ id: '101' }) })
    ).json();

    assert.strictEqual(body.managed, false);
    assert.strictEqual(body.volume.title, 'Not Migrated');
  });

  it('404s when the volume is unknown', async () => {
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: '999' }) });
    assert.strictEqual(res.status, 404);
  });
});

describe('DELETE /api/comics/[id]', () => {
  beforeEach(() => {
    authResult = true;
    deleteVolumeMock.mock.resetCalls();
    deleteVolumeMock.mock.mockImplementation(async () => {});
  });

  it('keeps the files unless asked otherwise', async () => {
    const body = await (
      await DELETE(makeRequest(), { params: Promise.resolve({ id: '101' }) })
    ).json();

    assert.strictEqual(body.deleted, true);
    assert.deepStrictEqual(deleteVolumeMock.mock.calls[0]!.arguments[1], { deleteFiles: false });
  });

  it('deletes the files when asked', async () => {
    await DELETE(makeRequest('deleteFiles=true'), {
      params: Promise.resolve({ id: '101' }),
    });

    assert.deepStrictEqual(deleteVolumeMock.mock.calls[0]!.arguments[1], { deleteFiles: true });
  });

  it('reports a missing volume as 404', async () => {
    deleteVolumeMock.mock.mockImplementation(async () => {
      throw new Error('Comic volume 999 not found');
    });

    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: '999' }) });
    assert.strictEqual(res.status, 404);
  });
});
