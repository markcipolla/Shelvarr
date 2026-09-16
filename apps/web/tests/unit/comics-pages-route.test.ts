/**
 * Unit tests for the comic page-serving API routes:
 *   GET /api/comics/issues/[id]/pages
 *   GET /api/comics/issues/[id]/pages/[n]
 *
 * The extraction/caching logic itself is covered against real archives in
 * comics-pages-cache.test.ts; these tests are about route wiring — auth,
 * id parsing, the file-ref lookup, and how errors map to status codes — so
 * `@shelvarr/services` is mocked here.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { cleanup } from '@testing-library/react';

let authResult = true;
let fileRef: { filepath: string; size: number; needsRemap: boolean } | null = {
  filepath: '/comics/issue-1.cbz',
  size: 1024,
  needsRemap: false,
};

class FakePdfNotPaginatedError extends Error {
  constructor() {
    super('PDF issues are not paginated by this API; use the whole-file route instead.');
    this.name = 'PdfNotPaginatedError';
  }
}

const ensureIssuePagesExtractedMock = mock.fn<
  (issueId: number, filepath: string, options?: { remap?: boolean }) => Promise<{ dir: string; files: string[] }>
>(async () => ({ dir: '/cache/1', files: ['00001.jpg', '00002.jpg'] }));

const getIssuePagePathMock = mock.fn<
  (issueId: number, filepath: string, pageNumber: number, options?: { remap?: boolean }) => Promise<string | null>
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
    getComicIssueFileRef: (issueId: number) => (issueId === 404 ? null : fileRef),
  },
});

const { GET: getPages } = await import('@/app/api/comics/issues/[id]/pages/route');
const { GET: getPage } = await import('@/app/api/comics/issues/[id]/pages/[n]/route');

function pagesRequest(id: string): Request {
  return new Request(`http://localhost/api/comics/issues/${id}/pages`);
}

function pageRequest(id: string, n: string): Request {
  return new Request(`http://localhost/api/comics/issues/${id}/pages/${n}`);
}

describe('GET /api/comics/issues/[id]/pages', () => {
  beforeEach(() => {
    ensureIssuePagesExtractedMock.mock.resetCalls();
    authResult = true;
    fileRef = { filepath: '/comics/issue-1.cbz', size: 1024, needsRemap: false };
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

  it('returns 404 when the issue has no file', async () => {
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

  it('passes the needsRemap flag from the file ref through', async () => {
    fileRef = { filepath: '/legacy/issue-1.cbz', size: 1024, needsRemap: true };
    await getPages(pagesRequest('1') as any, { params: Promise.resolve({ id: '1' }) });

    const [, filepath, options] = ensureIssuePagesExtractedMock.mock.calls[0].arguments;
    assert.equal(filepath, '/legacy/issue-1.cbz');
    assert.equal(options?.remap, true);
  });

  it('returns 400 for a PDF issue, pointing at the whole-file route', async () => {
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

describe('GET /api/comics/issues/[id]/pages/[n]', () => {
  beforeEach(() => {
    getIssuePagePathMock.mock.resetCalls();
    authResult = true;
    fileRef = { filepath: '/comics/issue-1.cbz', size: 1024, needsRemap: false };
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

  it('returns 404 when the issue has no file', async () => {
    const res = await getPage(pageRequest('404', '1') as any, { params: Promise.resolve({ id: '404', n: '1' }) });
    assert.equal(res.status, 404);
  });

  it('returns 404 for an out-of-range page', async () => {
    getIssuePagePathMock.mock.mockImplementationOnce(async () => null);

    const res = await getPage(pageRequest('1', '999') as any, { params: Promise.resolve({ id: '1', n: '999' }) });
    assert.equal(res.status, 404);
  });

  it('streams the page bytes with an inferred content type', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shelvarr-pages-route-'));
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

  it('returns 400 for a PDF issue', async () => {
    getIssuePagePathMock.mock.mockImplementationOnce(async () => {
      throw new FakePdfNotPaginatedError();
    });

    const res = await getPage(pageRequest('1', '1') as any, { params: Promise.resolve({ id: '1', n: '1' }) });
    assert.equal(res.status, 400);
  });
});
