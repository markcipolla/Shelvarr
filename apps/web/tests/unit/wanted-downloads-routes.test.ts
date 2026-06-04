/**
 * Unit tests for the wanted-list and download route handlers that the
 * native app calls: GET /api/wanted, DELETE/PATCH /api/wanted/[id],
 * GET /api/downloads/search and POST /api/downloads/queue.
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

let authResult = true;

// --- @shelvarr/services (auth) ---
mock.module('@shelvarr/services', {
  namedExports: {
    validateApiAuth: () => authResult,
  },
});

mock.module('@/lib/config', { namedExports: {} });

// --- @/lib/db ---
const getWantedBooksMock = mock.fn<(status?: string) => any[]>(() => []);
const addWantedBookMock = mock.fn<(data: any) => any>(() => ({ id: 1 }));
const isBookWantedMock = mock.fn<() => boolean>(() => false);
const deleteWantedBookMock = mock.fn<(id: number) => boolean>(() => true);
const updateWantedBookMock = mock.fn<(id: number, data: any) => boolean>(() => true);
const getWantedBookByIdMock = mock.fn<(id: number) => any>(() => ({ id: 1, status: 'searching' }));

mock.module('@/lib/db', {
  namedExports: {
    getWantedBooks: (status?: string) => getWantedBooksMock(status),
    addWantedBook: (data: any) => addWantedBookMock(data),
    isBookWanted: () => isBookWantedMock(),
    deleteWantedBook: (id: number) => deleteWantedBookMock(id),
    updateWantedBook: (id: number, data: any) => updateWantedBookMock(id, data),
    getWantedBookById: (id: number) => getWantedBookByIdMock(id),
  },
});

// --- @/lib/services/downloads ---
const searchAllSourcesMock = mock.fn<(q: string, opts?: any) => Promise<any[]>>(async () => []);
const getSearchLinksMock = mock.fn<(q: string) => any>(() => ({
  zlibrary: 'z',
  annas: 'a',
  libgen: 'l',
}));

mock.module('@/lib/services/downloads', {
  namedExports: {
    searchAllSources: (q: string, opts?: any) => searchAllSourcesMock(q, opts),
    getSearchLinks: (q: string) => getSearchLinksMock(q),
    getSourceStatuses: async () => [],
  },
});

// --- @/lib/services/queue ---
const enqueueTaskMock = mock.fn<(type: string, data: any) => any>(() => ({ id: 42 }));
mock.module('@/lib/services/queue', {
  namedExports: {
    enqueueTask: (type: string, data: any) => enqueueTaskMock(type, data),
  },
});

function makeGet(url: string): any {
  const parsed = new URL(url);
  return {
    headers: new Headers(),
    nextUrl: { searchParams: parsed.searchParams },
  };
}

function makeBodyRequest(body: any, opts: { badJson?: boolean } = {}): any {
  return {
    headers: new Headers(),
    json: async () => {
      if (opts.badJson) throw new Error('bad json');
      return body;
    },
  };
}

const { GET: wantedGET } = await import('../../app/api/wanted/route.js');
const { DELETE: wantedDelete, PATCH: wantedPatch } = await import(
  '../../app/api/wanted/[id]/route.js'
);
const { GET: downloadsSearch } = await import('../../app/api/downloads/search/route.js');
const { POST: downloadsQueue } = await import('../../app/api/downloads/queue/route.js');

beforeEach(() => {
  authResult = true;
  getWantedBooksMock.mock.resetCalls();
  deleteWantedBookMock.mock.resetCalls();
  updateWantedBookMock.mock.resetCalls();
  searchAllSourcesMock.mock.resetCalls();
  enqueueTaskMock.mock.resetCalls();
  getWantedBooksMock.mock.mockImplementation(() => []);
  deleteWantedBookMock.mock.mockImplementation(() => true);
  updateWantedBookMock.mock.mockImplementation(() => true);
  searchAllSourcesMock.mock.mockImplementation(async () => []);
  enqueueTaskMock.mock.mockImplementation(() => ({ id: 42 }));
});

describe('GET /api/wanted', () => {
  it('returns 401 when unauthorized', async () => {
    authResult = false;
    const res = await wantedGET(makeGet('http://h/api/wanted'));
    assert.strictEqual(res.status, 401);
  });

  it('returns the wanted books list', async () => {
    getWantedBooksMock.mock.mockImplementation(() => [{ id: 1, title: 'A' }]);
    const res = await wantedGET(makeGet('http://h/api/wanted'));
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.books.length, 1);
    assert.strictEqual(body.books[0].title, 'A');
  });

  it('forwards the status filter', async () => {
    await wantedGET(makeGet('http://h/api/wanted?status=searching'));
    assert.strictEqual(getWantedBooksMock.mock.calls[0].arguments[0], 'searching');
  });
});

describe('DELETE /api/wanted/[id]', () => {
  it('returns 401 when unauthorized', async () => {
    authResult = false;
    const res = await wantedDelete(makeBodyRequest({}), { params: Promise.resolve({ id: '1' }) });
    assert.strictEqual(res.status, 401);
  });

  it('rejects a non-numeric id', async () => {
    const res = await wantedDelete(makeBodyRequest({}), {
      params: Promise.resolve({ id: 'abc' }),
    });
    assert.strictEqual(res.status, 400);
  });

  it('removes an existing wanted book', async () => {
    const res = await wantedDelete(makeBodyRequest({}), { params: Promise.resolve({ id: '5' }) });
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(deleteWantedBookMock.mock.calls[0].arguments[0], 5);
  });

  it('returns 404 when the book does not exist', async () => {
    deleteWantedBookMock.mock.mockImplementation(() => false);
    const res = await wantedDelete(makeBodyRequest({}), { params: Promise.resolve({ id: '5' }) });
    assert.strictEqual(res.status, 404);
  });
});

describe('PATCH /api/wanted/[id]', () => {
  it('rejects an invalid status', async () => {
    const res = await wantedPatch(makeBodyRequest({ status: 'nope' }), {
      params: Promise.resolve({ id: '1' }),
    });
    assert.strictEqual(res.status, 400);
  });

  it('updates status and returns the refreshed book', async () => {
    const res = await wantedPatch(makeBodyRequest({ status: 'searching' }), {
      params: Promise.resolve({ id: '1' }),
    });
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.deepStrictEqual(updateWantedBookMock.mock.calls[0].arguments[1], {
      status: 'searching',
      priority: undefined,
      notes: undefined,
    });
    assert.strictEqual(body.book.status, 'searching');
  });

  it('returns 404 when there is nothing to update', async () => {
    updateWantedBookMock.mock.mockImplementation(() => false);
    const res = await wantedPatch(makeBodyRequest({ priority: 1 }), {
      params: Promise.resolve({ id: '1' }),
    });
    assert.strictEqual(res.status, 404);
  });
});

describe('GET /api/downloads/search', () => {
  it('returns 401 when unauthorized', async () => {
    authResult = false;
    const res = await downloadsSearch(makeGet('http://h/api/downloads/search?q=dune'));
    assert.strictEqual(res.status, 401);
  });

  it('returns empty results with links for a blank query', async () => {
    const res = await downloadsSearch(makeGet('http://h/api/downloads/search'));
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.deepStrictEqual(body.results, []);
    assert.strictEqual(searchAllSourcesMock.mock.callCount(), 0);
  });

  it('searches all sources and forwards the isbn', async () => {
    searchAllSourcesMock.mock.mockImplementation(async () => [
      { id: 'x', source: 'libgen', title: 'Dune' },
    ]);
    const res = await downloadsSearch(
      makeGet('http://h/api/downloads/search?q=dune&isbn=123')
    );
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.results.length, 1);
    assert.strictEqual(searchAllSourcesMock.mock.calls[0].arguments[0], 'dune');
    assert.deepStrictEqual(searchAllSourcesMock.mock.calls[0].arguments[1], { isbn: '123' });
  });

  it('returns success:false with links when the search throws', async () => {
    searchAllSourcesMock.mock.mockImplementation(async () => {
      throw new Error('source down');
    });
    const res = await downloadsSearch(makeGet('http://h/api/downloads/search?q=dune'));
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error, 'source down');
    assert.ok(body.links);
  });
});

describe('POST /api/downloads/queue', () => {
  it('returns 401 when unauthorized', async () => {
    authResult = false;
    const res = await downloadsQueue(makeBodyRequest({}));
    assert.strictEqual(res.status, 401);
  });

  it('rejects an invalid JSON body', async () => {
    const res = await downloadsQueue(makeBodyRequest(null, { badJson: true }));
    assert.strictEqual(res.status, 400);
  });

  it('requires source, md5 and libraryId', async () => {
    const res = await downloadsQueue(makeBodyRequest({ source: 'libgen' }));
    assert.strictEqual(res.status, 400);
  });

  it('enqueues a download task and returns the task id', async () => {
    const res = await downloadsQueue(
      makeBodyRequest({
        source: 'libgen',
        md5: 'abc',
        title: 'Dune',
        author: 'Herbert',
        extension: 'epub',
        libraryId: 3,
        wantedBookId: 7,
      })
    );
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.taskId, 42);
    const [type, data] = enqueueTaskMock.mock.calls[0].arguments;
    assert.strictEqual(type, 'download');
    assert.strictEqual(data.libraryId, 3);
    assert.strictEqual(data.wantedBookId, 7);
  });
});
