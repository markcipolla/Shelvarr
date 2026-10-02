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

/**
 * A PNG header declaring a given size. Only the signature and the IHDR
 * chunk are real, which is all the dimension reader looks at — writing a
 * genuinely encodable image would mean pulling in an encoder to test a
 * header parser.
 */
function makePngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set(new TextEncoder().encode('IHDR'), 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8; // bit depth
  bytes[25] = 6; // colour type
  return bytes;
}

/** Build a CBZ whose pages are real PNG headers at the given sizes. */
function makeSizedCbzFixture(name: string, sizes: Array<[number, number]>): string {
  const entries: Record<string, Uint8Array> = {};
  sizes.forEach(([width, height], index) => {
    entries[`page${String(index + 1).padStart(3, '0')}.png`] = makePngBytes(width, height);
  });
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

    const result = await pages.ensureIssuePagesExtracted(1, archivePath);

    assert.equal(result.files.length, 3);
    assert.ok(existsSync(result.dir));
  });

  it('does not re-extract on a second request for the same issue', async () => {
    const archivePath = makeCbzFixture('issue-2.cbz', 2);

    await pages.ensureIssuePagesExtracted(2, archivePath);
    await pages.ensureIssuePagesExtracted(2, archivePath);

    assert.equal(unzipSyncSpy.mock.calls.length, 1);
  });

  it('rejects PDFs, deferring to the whole-file route', async () => {
    const pdfPath = join(root, 'issue-pdf.pdf');
    writeFileSync(pdfPath, 'not really a pdf, just bytes');

    await assert.rejects(
      () => pages.ensureIssuePagesExtracted(3, pdfPath),
      (error: unknown) => error instanceof pages.PdfNotPaginatedError
    );
  });

  it('evicts cache directories older than a week when a new one is created', async () => {
    const staleDir = join(cacheRootDir(), 'issue-999-stale');
    mkdirSync(staleDir, { recursive: true });
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    utimesSync(staleDir, eightDaysAgo, eightDaysAgo);

    const archivePath = makeCbzFixture('issue-5.cbz', 1);
    const result = await pages.ensureIssuePagesExtracted(5, archivePath);

    assert.ok(!existsSync(staleDir), 'stale cache dir should have been evicted');
    assert.ok(existsSync(result.dir), 'the freshly created cache dir should survive its own eviction pass');
  });

  it('keeps a recent cache directory around during eviction', async () => {
    const archivePath = makeCbzFixture('issue-6.cbz', 1);
    const first = await pages.ensureIssuePagesExtracted(6, archivePath);

    const archivePath2 = makeCbzFixture('issue-7.cbz', 1);
    await pages.ensureIssuePagesExtracted(7, archivePath2);

    assert.ok(existsSync(first.dir), 'a recently created cache dir should not be evicted');
  });
});

describe('page dimensions', () => {
  it('records each page\'s size during extraction', async () => {
    const archivePath = makeSizedCbzFixture('sized-1.cbz', [[1200, 1800], [2400, 1800]]);

    const result = await pages.ensureIssuePagesExtracted(101, archivePath);

    assert.deepEqual(result.pages, [
      { n: 1, w: 1200, h: 1800 },
      { n: 2, w: 2400, h: 1800 },
    ]);
  });

  it('reports nulls for a page whose header cannot be read, rather than failing', async () => {
    // The plain-text fixtures are not images at all, which is the same thing
    // to a reader as a corrupt page: show it whole and do not guess.
    const archivePath = makeCbzFixture('unreadable-1.cbz', 2);

    const result = await pages.ensureIssuePagesExtracted(102, archivePath);

    assert.equal(result.files.length, 2);
    assert.deepEqual(result.pages, [
      { n: 1, w: null, h: null },
      { n: 2, w: null, h: null },
    ]);
  });

  it('serves the sizes back from cache without re-extracting', async () => {
    const archivePath = makeSizedCbzFixture('sized-2.cbz', [[1000, 1500]]);

    await pages.ensureIssuePagesExtracted(103, archivePath);
    unzipSyncSpy.mock.resetCalls();
    const second = await pages.ensureIssuePagesExtracted(103, archivePath);

    assert.equal(unzipSyncSpy.mock.calls.length, 0);
    assert.deepEqual(second.pages, [{ n: 1, w: 1000, h: 1500 }]);
  });

  it('does not count the sizes sidecar as a page', async () => {
    const archivePath = makeSizedCbzFixture('sized-3.cbz', [[800, 1200], [800, 1200]]);

    const result = await pages.ensureIssuePagesExtracted(104, archivePath);

    assert.equal(result.files.length, 2);
    assert.ok(existsSync(join(result.dir, 'dimensions.json')));
    assert.ok(!result.files.some((file) => file.includes('dimensions')));
  });

  it('backfills a cache directory extracted before sizes were recorded', async () => {
    const archivePath = makeSizedCbzFixture('sized-4.cbz', [[1600, 2400]]);
    const first = await pages.ensureIssuePagesExtracted(105, archivePath);

    // Simulate a cache directory written by an older build.
    rmSync(join(first.dir, 'dimensions.json'));
    unzipSyncSpy.mock.resetCalls();

    const second = await pages.ensureIssuePagesExtracted(105, archivePath);

    assert.equal(unzipSyncSpy.mock.calls.length, 0, 'backfill must not re-extract the archive');
    assert.deepEqual(second.pages, [{ n: 1, w: 1600, h: 2400 }]);
    assert.ok(existsSync(join(first.dir, 'dimensions.json')), 'the backfill should be written out');
  });

  it('ignores a sidecar that no longer describes the pages on disk', async () => {
    const archivePath = makeSizedCbzFixture('sized-5.cbz', [[900, 1400], [900, 1400]]);
    const first = await pages.ensureIssuePagesExtracted(106, archivePath);

    writeFileSync(join(first.dir, 'dimensions.json'), JSON.stringify([{ n: 1, w: 1, h: 1 }]));

    const second = await pages.ensureIssuePagesExtracted(106, archivePath);

    assert.deepEqual(second.pages, [
      { n: 1, w: 900, h: 1400 },
      { n: 2, w: 900, h: 1400 },
    ]);
  });
});

describe('getIssuePagePath', () => {
  it("serves a specific page's bytes, 1-indexed", async () => {
    const archivePath = makeCbzFixture('issue-8.cbz', 3);

    const pagePath = await pages.getIssuePagePath(8, archivePath, 2);

    assert.ok(pagePath);
    assert.equal(readFileSync(pagePath!, 'utf-8'), 'page-2');
  });

  it('returns null for an out-of-range page number', async () => {
    const archivePath = makeCbzFixture('issue-9.cbz', 2);

    assert.equal(await pages.getIssuePagePath(9, archivePath, 99), null);
    assert.equal(await pages.getIssuePagePath(9, archivePath, 0), null);
  });

  it('serves from the cache on a second call without re-extracting', async () => {
    const archivePath = makeCbzFixture('issue-10.cbz', 2);

    await pages.getIssuePagePath(10, archivePath, 1);
    unzipSyncSpy.mock.resetCalls();
    const pagePath = await pages.getIssuePagePath(10, archivePath, 2);

    assert.ok(pagePath);
    assert.equal(readFileSync(pagePath!, 'utf-8'), 'page-2');
    assert.equal(unzipSyncSpy.mock.calls.length, 0);
  });
});
