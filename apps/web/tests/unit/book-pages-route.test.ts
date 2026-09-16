/**
 * Unit tests for the book page-serving API routes:
 *   GET /api/books/[id]/pages
 *   GET /api/books/[id]/pages/[n]
 *
 * Mirrors comics-pages-route.test.ts: the extraction/caching logic itself is
 * covered against real archives in comics-pages-cache.test.ts (shared by
 * both comics and books, distinguished only by cache namespace), so
 * `@shelvarr/services` is mocked here and these tests are about route wiring
 * — auth, id parsing, the book-row lookup, the EPUB short-circuit, and how
 * errors map to status codes.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { cleanup } from '@testing-library/react';

let authResult = true;
let bookRow: { file_path: string; extension: string | null } | null = {
  file_path: '/books/some-comic.cbz',
  extension: 'cbz',
};

class FakePdfNotPaginatedError extends Error {
  constructor() {
    super('PDF issues are not paginated by this API; use the whole-file route instead.');
    this.name = 'PdfNotPaginatedError';
  }
}

const ensureIssuePagesExtractedMock = mock.fn<
  (
    id: number,
    filepath: string,
    options?: { remap?: boolean; namespace?: string }
  ) => Promise<{ dir: string; files: string[] }>
>(async () => ({ dir: '/cache/1', files: ['00001.jpg', '00002.jpg'] }));

const getIssuePagePathMock = mock.fn<
  (
    id: number,
    filepath: string,
    pageNumber: number,
    options?: { remap?: boolean; namespace?: string }
  ) => Promise<string | null>
>(async () => null);

mock.module('@shelvarr/services', {
  namedExports: {
    validateApiAuth: () => authResult,
    ensureIssuePagesExtracted: (...args: Parameters<typeof ensureIssuePagesExtractedMock>) =>
      ensureIssuePagesExtractedMock(...args),
    getIssuePagePath: (...args: Parameters<typeof getIssuePagePathMock>) => getIssuePagePathMock(...args),
    PdfNotPaginatedError: FakePdfNotPaginatedError,
  },
});

mock.module('@/lib/config', { namedExports: {} });

mock.module('@/lib/db', {
  namedExports: {
    queryOne: (_sql: string, params: unknown[]) => (params[0] === 404 ? null : bookRow),
  },
});

const { GET: getPages } = await import('@/app/api/books/[id]/pages/route');
const { GET: getPage } = await import('@/app/api/books/[id]/pages/[n]/route');

function pagesRequest(id: string): Request {
  return new Request(`http://localhost/api/books/${id}/pages`);
}

function pageRequest(id: string, n: string): Request {
  return new Request(`http://localhost/api/books/${id}/pages/${n}`);
}

describe('GET /api/books/[id]/pages', () => {
  beforeEach(() => {
    ensureIssuePagesExtractedMock.mock.resetCalls();
    authResult = true;
    bookRow = { file_path: '/books/some-comic.cbz', extension: 'cbz' };
  });
  afterEach(cleanup);

  it('returns 401 when auth fails', async () => {
    authResult = false;
    const res = await getPages(pagesRequest('1') as any, { params: Promise.resolve({ id: '1' }) });
    assert.equal(res.status, 401);
  });

  it('returns 400 for an invalid id', async () => {
    const res = await getPages(pagesRequest('nope') as any, { params: Promise.resolve({ id: 'nope' }) });
    assert.equal(res.status, 400);
  });

  it('returns 404 when the book does not exist', async () => {
    const res = await getPages(pagesRequest('404') as any, { params: Promise.resolve({ id: '404' }) });
    assert.equal(res.status, 404);
  });

  it('returns the page count and a 1-indexed page list', async () => {
    ensureIssuePagesExtractedMock.mock.mockImplementationOnce(async () => ({
      dir: '/cache/1',
      files: ['00001.jpg', '00002.jpg', '00003.jpg'],
    }));

    const res = await getPages(pagesRequest('1') as any, { params: Promise.resolve({ id: '1' }) });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { count: 3, pages: [{ n: 1 }, { n: 2 }, { n: 3 }] });
  });

  it('extracts under the book cache namespace with remap disabled', async () => {
    await getPages(pagesRequest('1') as any, { params: Promise.resolve({ id: '1' }) });

    const [, filepath, options] = ensureIssuePagesExtractedMock.mock.calls[0].arguments;
    assert.equal(filepath, '/books/some-comic.cbz');
    assert.deepEqual(options, { remap: false, namespace: 'book' });
  });

  it('returns a distinct 400 for an EPUB without attempting extraction', async () => {
    bookRow = { file_path: '/books/a-novel.epub', extension: 'epub' };

    const res = await getPages(pagesRequest('1') as any, { params: Promise.resolve({ id: '1' }) });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /EPUB/);
    assert.equal(ensureIssuePagesExtractedMock.mock.calls.length, 0);
  });

  it('falls back to the file extension when the extension column is null', async () => {
    bookRow = { file_path: '/books/a-novel.epub', extension: null };

    const res = await getPages(pagesRequest('1') as any, { params: Promise.resolve({ id: '1' }) });
    assert.equal(res.status, 400);
  });

  it('returns 400 for a PDF book, pointing at the whole-file route', async () => {
    ensureIssuePagesExtractedMock.mock.mockImplementationOnce(async () => {
      throw new FakePdfNotPaginatedError();
    });

    const res = await getPages(pagesRequest('1') as any, { params: Promise.resolve({ id: '1' }) });
    assert.equal(res.status, 400);
  });

  it('returns 404 when extraction fails for another reason', async () => {
    ensureIssuePagesExtractedMock.mock.mockImplementationOnce(async () => {
      throw new Error('ENOENT: no such file');
    });

    const res = await getPages(pagesRequest('1') as any, { params: Promise.resolve({ id: '1' }) });
    assert.equal(res.status, 404);
  });
});

describe('GET /api/books/[id]/pages/[n]', () => {
  beforeEach(() => {
    getIssuePagePathMock.mock.resetCalls();
    authResult = true;
    bookRow = { file_path: '/books/some-comic.cbz', extension: 'cbz' };
  });
  afterEach(cleanup);

  it('returns 401 when auth fails', async () => {
    authResult = false;
    const res = await getPage(pageRequest('1', '1') as any, { params: Promise.resolve({ id: '1', n: '1' }) });
    assert.equal(res.status, 401);
  });

  it('returns 400 for an invalid page number', async () => {
    const res = await getPage(pageRequest('1', 'nope') as any, { params: Promise.resolve({ id: '1', n: 'nope' }) });
    assert.equal(res.status, 400);
  });

  it('returns 404 when the book does not exist', async () => {
    const res = await getPage(pageRequest('404', '1') as any, { params: Promise.resolve({ id: '404', n: '1' }) });
    assert.equal(res.status, 404);
  });

  it('returns a distinct 400 for an EPUB without attempting extraction', async () => {
    bookRow = { file_path: '/books/a-novel.epub', extension: 'epub' };

    const res = await getPage(pageRequest('1', '1') as any, { params: Promise.resolve({ id: '1', n: '1' }) });
    assert.equal(res.status, 400);
    assert.equal(getIssuePagePathMock.mock.calls.length, 0);
  });

  it('returns 404 for an out-of-range page', async () => {
    getIssuePagePathMock.mock.mockImplementationOnce(async () => null);

    const res = await getPage(pageRequest('1', '999') as any, { params: Promise.resolve({ id: '1', n: '999' }) });
    assert.equal(res.status, 404);
  });

  it('streams the page bytes with an inferred content type', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shelvarr-book-pages-route-'));
    const pagePath = join(dir, '00001.png');
    writeFileSync(pagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    try {
      getIssuePagePathMock.mock.mockImplementationOnce(async () => pagePath);

      const res = await getPage(pageRequest('1', '1') as any, { params: Promise.resolve({ id: '1', n: '1' }) });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('Content-Type'), 'image/png');
      const bytes = new Uint8Array(await res.arrayBuffer());
      assert.deepEqual(Array.from(bytes), [0x89, 0x50, 0x4e, 0x47]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('extracts under the book cache namespace with remap disabled', async () => {
    await getPage(pageRequest('1', '1') as any, { params: Promise.resolve({ id: '1', n: '1' }) });

    const [, filepath, , options] = getIssuePagePathMock.mock.calls[0].arguments;
    assert.equal(filepath, '/books/some-comic.cbz');
    assert.deepEqual(options, { remap: false, namespace: 'book' });
  });

  it('returns 400 for a PDF book', async () => {
    getIssuePagePathMock.mock.mockImplementationOnce(async () => {
      throw new FakePdfNotPaginatedError();
    });

    const res = await getPage(pageRequest('1', '1') as any, { params: Promise.resolve({ id: '1', n: '1' }) });
    assert.equal(res.status, 400);
  });
});
