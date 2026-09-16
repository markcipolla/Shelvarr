/**
 * Unit tests for POST /api/wanted/[id]/import (E4-3) — the manual "I already
 * have this file" upload route. Modelled on wanted-downloads-routes.test.ts:
 * every dependency is mocked, so this only exercises the route's own
 * validation and its call into the task queue.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let authResult = true;
let scratchRoot: string;

mock.module('@/lib/config', { namedExports: {} });

// --- @shelvarr/services ---
mock.module('@shelvarr/services', {
  namedExports: {
    validateApiAuth: () => authResult,
    getServiceConfig: () => ({
      dataDir: scratchRoot,
      supportedExtensions: ['.epub', '.pdf', '.mobi', '.azw', '.azw3'],
    }),
  },
});

// --- @/lib/db ---
const getWantedBookByIdMock = mock.fn<(id: number) => any>(() => null);
mock.module('@/lib/db', {
  namedExports: {
    getWantedBookById: (id: number) => getWantedBookByIdMock(id),
  },
});

// --- @/lib/services/library ---
const getLibraryByIdMock = mock.fn<(id: number) => Promise<any>>(async () => null);
mock.module('@/lib/services/library', {
  namedExports: {
    getLibraryById: (id: number) => getLibraryByIdMock(id),
  },
});

// --- @/lib/services/queue ---
const enqueueTaskMock = mock.fn<(type: string, data: any) => any>(() => ({ id: 42 }));
mock.module('@/lib/services/queue', {
  namedExports: {
    enqueueTask: (type: string, data: any) => enqueueTaskMock(type, data),
  },
});

const { POST: importPOST } = await import('../../app/api/wanted/[id]/import/route.js');

function makeRequest(formData: FormData | null, opts: { badForm?: boolean } = {}): any {
  return {
    headers: new Headers(),
    formData: async () => {
      if (opts.badForm) throw new Error('bad form data');
      return formData;
    },
  };
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

const wantedBook = { id: 1, title: 'Dune', author: 'Frank Herbert', hardcover_id: null };
const library = { id: 3, name: 'Books', path: '/libraries/books' };

describe('POST /api/wanted/[id]/import', () => {
  beforeEach(() => {
    scratchRoot = mkdtempSync(join(tmpdir(), 'shelvarr-import-route-'));

    authResult = true;
    getWantedBookByIdMock.mock.resetCalls();
    getLibraryByIdMock.mock.resetCalls();
    enqueueTaskMock.mock.resetCalls();
    getWantedBookByIdMock.mock.mockImplementation(() => wantedBook);
    getLibraryByIdMock.mock.mockImplementation(async () => library);
    enqueueTaskMock.mock.mockImplementation(() => ({ id: 42 }));
  });

  afterEach(() => {
    if (existsSync(scratchRoot)) {
      rmSync(scratchRoot, { recursive: true, force: true });
    }
  });

  it('returns 401 when unauthorized', async () => {
    authResult = false;
    const res = await importPOST(makeRequest(null), paramsFor('1'));
    assert.strictEqual(res.status, 401);
  });

  it('rejects a non-numeric id', async () => {
    const res = await importPOST(makeRequest(null), paramsFor('abc'));
    assert.strictEqual(res.status, 400);
  });

  it('returns 404 when the wanted book does not exist', async () => {
    getWantedBookByIdMock.mock.mockImplementation(() => null);
    const res = await importPOST(makeRequest(null), paramsFor('1'));
    assert.strictEqual(res.status, 404);
  });

  it('returns 400 when the form data cannot be parsed', async () => {
    const res = await importPOST(makeRequest(null, { badForm: true }), paramsFor('1'));
    assert.strictEqual(res.status, 400);
  });

  it('requires a file', async () => {
    const formData = new FormData();
    formData.append('libraryId', '3');
    const res = await importPOST(makeRequest(formData), paramsFor('1'));
    assert.strictEqual(res.status, 400);
  });

  it('requires a libraryId', async () => {
    const formData = new FormData();
    formData.append('file', new File(['content'], 'book.epub'));
    const res = await importPOST(makeRequest(formData), paramsFor('1'));
    assert.strictEqual(res.status, 400);
  });

  it('rejects an unsupported file extension', async () => {
    const formData = new FormData();
    formData.append('file', new File(['content'], 'book.exe'));
    formData.append('libraryId', '3');
    const res = await importPOST(makeRequest(formData), paramsFor('1'));
    assert.strictEqual(res.status, 400);
    assert.strictEqual(enqueueTaskMock.mock.callCount(), 0);
  });

  it('returns 404 when the target library does not exist', async () => {
    getLibraryByIdMock.mock.mockImplementation(async () => null);
    const formData = new FormData();
    formData.append('file', new File(['content'], 'book.epub'));
    formData.append('libraryId', '999');
    const res = await importPOST(makeRequest(formData), paramsFor('1'));
    assert.strictEqual(res.status, 404);
  });

  it('saves the upload to scratch and enqueues a book_import task', async () => {
    const formData = new FormData();
    formData.append('file', new File(['epub bytes'], 'My Book.epub'));
    formData.append('libraryId', '3');

    const res = await importPOST(makeRequest(formData), paramsFor('1'));
    const body = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.taskId, 42);

    assert.strictEqual(enqueueTaskMock.mock.callCount(), 1);
    const [type, data] = enqueueTaskMock.mock.calls[0].arguments;
    assert.strictEqual(type, 'book_import');
    assert.strictEqual(data.libraryId, 3);
    assert.strictEqual(data.wantedBookId, 1);
    assert.strictEqual(data.title, 'Dune');
    assert.strictEqual(data.author, 'Frank Herbert');
    assert.strictEqual(data.extension, 'epub');
    assert.strictEqual(data.originalFilename, 'My Book.epub');
    assert.ok(typeof data.filePath === 'string' && data.filePath.length > 0);

    // The file actually landed on disk before the task was enqueued — the
    // route has to save it synchronously, since the task only gets a path.
    const scratchDir = join(scratchRoot, 'import-scratch');
    assert.ok(existsSync(scratchDir));
    assert.ok(readdirSync(scratchDir).length > 0);
  });
});
