/**
 * Unit tests for the comic page-extraction cache (`@shelvarr/services`'
 * `comics/pages.ts`).
 *
 * These exercise the real extraction path against small CBZ fixtures built
 * in-test with fflate, rather than mocking `@shelvarr/services` wholesale —
 * the thing under test *is* the extraction/caching logic, so replacing it
 * with a mock would test nothing. `fflate`'s `unzipSync` is wrapped (not
 * replaced) so calls can be counted while still doing a real unzip, which is
 * how "a second request does not re-extract" gets verified.
 */
import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { join } from 'path';
import { zipSync, unzipSync as realUnzipSync } from 'fflate';

const unzipSyncSpy = mock.fn((data: Uint8Array) => realUnzipSync(data));

mock.module('fflate', {
  namedExports: {
    unzipSync: (data: Uint8Array) => unzipSyncSpy(data),
    zipSync,
  },
});

let root: string;
let pages: typeof import('@shelvarr/services/comics/pages');

before(async () => {
  root = join('/tmp', `shelvarr-comic-pages-test-${Date.now()}`);
  mkdirSync(root, { recursive: true });
  process.env['DATA_DIR'] = root;

  const services = await import('@shelvarr/services');
  services.initServiceConfig(services.loadConfigFromEnv());

  pages = await import('@shelvarr/services/comics/pages');
});

after(() => {
  rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  unzipSyncSpy.mock.resetCalls();
});

/** Build a CBZ with `pageCount` numbered image entries, each holding a distinguishable marker. */
function makeCbzFixture(name: string, pageCount: number): string {
  const entries: Record<string, Uint8Array> = {};
  for (let i = 1; i <= pageCount; i++) {
    entries[`page${String(i).padStart(3, '0')}.jpg`] = new TextEncoder().encode(`page-${i}`);
  }
  const path = join(root, name);
  writeFileSync(path, zipSync(entries));
  return path;
}

function cacheRootDir(): string {
  return join(root, 'comic-pages-cache');
}

describe('ensureIssuePagesExtracted', () => {
  it('extracts every image from a multi-page CBZ and reports the page count', async () => {
    const archivePath = makeCbzFixture('issue-1.cbz', 3);

    const result = await pages.ensureIssuePagesExtracted(1, archivePath, { remap: false });

    assert.equal(result.files.length, 3);
    assert.ok(existsSync(result.dir));
  });

  it('does not re-extract on a second request for the same issue', async () => {
    const archivePath = makeCbzFixture('issue-2.cbz', 2);

    await pages.ensureIssuePagesExtracted(2, archivePath, { remap: false });
    await pages.ensureIssuePagesExtracted(2, archivePath, { remap: false });

    assert.equal(unzipSyncSpy.mock.calls.length, 1);
  });

  it('rejects PDFs, deferring to the whole-file route', async () => {
    const pdfPath = join(root, 'issue-pdf.pdf');
    writeFileSync(pdfPath, 'not really a pdf, just bytes');

    await assert.rejects(
      () => pages.ensureIssuePagesExtracted(3, pdfPath, { remap: false }),
      (error: unknown) => error instanceof pages.PdfNotPaginatedError
    );
  });

  it('evicts cache directories older than a week when a new one is created', async () => {
    const staleDir = join(cacheRootDir(), 'issue-999-stale');
    mkdirSync(staleDir, { recursive: true });
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    utimesSync(staleDir, eightDaysAgo, eightDaysAgo);

    const archivePath = makeCbzFixture('issue-5.cbz', 1);
    const result = await pages.ensureIssuePagesExtracted(5, archivePath, { remap: false });

    assert.ok(!existsSync(staleDir), 'stale cache dir should have been evicted');
    assert.ok(existsSync(result.dir), 'the freshly created cache dir should survive its own eviction pass');
  });

  it('keeps a recent cache directory around during eviction', async () => {
    const archivePath = makeCbzFixture('issue-6.cbz', 1);
    const first = await pages.ensureIssuePagesExtracted(6, archivePath, { remap: false });

    const archivePath2 = makeCbzFixture('issue-7.cbz', 1);
    await pages.ensureIssuePagesExtracted(7, archivePath2, { remap: false });

    assert.ok(existsSync(first.dir), 'a recently created cache dir should not be evicted');
  });
});

describe('getIssuePagePath', () => {
  it("serves a specific page's bytes, 1-indexed", async () => {
    const archivePath = makeCbzFixture('issue-8.cbz', 3);

    const pagePath = await pages.getIssuePagePath(8, archivePath, 2, { remap: false });

    assert.ok(pagePath);
    assert.equal(readFileSync(pagePath!, 'utf-8'), 'page-2');
  });

  it('returns null for an out-of-range page number', async () => {
    const archivePath = makeCbzFixture('issue-9.cbz', 2);

    assert.equal(await pages.getIssuePagePath(9, archivePath, 99, { remap: false }), null);
    assert.equal(await pages.getIssuePagePath(9, archivePath, 0, { remap: false }), null);
  });

  it('serves from the cache on a second call without re-extracting', async () => {
    const archivePath = makeCbzFixture('issue-10.cbz', 2);

    await pages.getIssuePagePath(10, archivePath, 1, { remap: false });
    unzipSyncSpy.mock.resetCalls();
    const pagePath = await pages.getIssuePagePath(10, archivePath, 2, { remap: false });

    assert.ok(pagePath);
    assert.equal(readFileSync(pagePath!, 'utf-8'), 'page-2');
    assert.equal(unzipSyncSpy.mock.calls.length, 0);
  });
});
