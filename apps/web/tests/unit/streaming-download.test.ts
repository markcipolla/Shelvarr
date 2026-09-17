/**
 * The shared streaming primitive both comics and books download through
 * (E2-2 pulled it out of the comics-only `clients/direct.ts` into
 * `utils/streaming-download.ts` so LibGen could reuse it).
 *
 * `downloadToFile` used to only be exercised indirectly, through comic
 * download tests that mocked it away. This file tests the real function:
 * resume from a partial file, falling back to a fresh download when the
 * server won't honour Range, and the error types the mirror-walking logic in
 * both callers depends on.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { createHash } from 'crypto';

import {
  DownloadLimitReachedError,
  FileVerificationError,
  LinkBrokenError,
  downloadToFile,
  type ResolvedDownload,
} from '@shelvarr/services/utils/streaming-download';

const realFetch = globalThis.fetch;

let requests: Array<{ url: string; headers: Record<string, string> }> = [];
let responses: Response[] = [];
let workDir: string;

function queueResponse(body: string, init: ResponseInit = {}): void {
  responses.push(new Response(body, init));
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'shelvarr-streaming-download-'));
  requests = [];
  responses = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    if (init?.headers) {
      for (const [key, value] of Object.entries(init.headers as Record<string, string>)) {
        headers[key] = value;
      }
    }
    requests.push({ url: String(input), headers });
    const next = responses.shift();
    if (!next) throw new Error(`Unexpected fetch to ${String(input)}`);
    return next;
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  rmSync(workDir, { recursive: true, force: true });
});

function resolved(overrides: Partial<ResolvedDownload> = {}): ResolvedDownload {
  return {
    url: 'https://example.com/get.php?md5=abc&key=xyz',
    filename: 'book.epub',
    size: null,
    supportsRange: false,
    contentType: 'application/epub+zip',
    ...overrides,
  };
}

describe('downloadToFile', () => {
  it('streams a fresh download to a new file, reporting cumulative progress', async () => {
    queueResponse('hello world', { status: 200 });
    const destination = join(workDir, 'book.epub');

    const progress: Array<[number, number | null]> = [];
    const result = await downloadToFile(resolved({ size: 11 }), destination, {
      onProgress: (bytes, total) => progress.push([bytes, total]),
    });

    assert.strictEqual(result.bytes, 11);
    assert.strictEqual(readFileSync(destination, 'utf8'), 'hello world');
    assert.ok(progress.length > 0);
    assert.strictEqual(progress[progress.length - 1]![0], 11);
  });

  it('resumes from an existing partial file when the server supports range', async () => {
    const destination = join(workDir, 'book.epub');
    writeFileSync(destination, 'hello ');

    // A range-capable server answers the resumed request with 206 and only
    // the remaining bytes.
    queueResponse('world', { status: 206, headers: { 'content-range': 'bytes 6-10/11' } });

    const result = await downloadToFile(resolved({ size: 11, supportsRange: true }), destination);

    assert.strictEqual(readFileSync(destination, 'utf8'), 'hello world');
    assert.strictEqual(result.bytes, 11);

    const rangeHeader = requests[0]?.headers['Range'];
    assert.strictEqual(rangeHeader, 'bytes=6-');
  });

  it('restarts from scratch when the server ignores the Range header', async () => {
    const destination = join(workDir, 'book.epub');
    writeFileSync(destination, 'stale partial data');

    // The mirror answers 200 (not 206), meaning it sent the whole file back
    // despite the Range request — downloadToFile must not append to the
    // stale partial in that case.
    queueResponse('a fresh full file', { status: 200 });

    const result = await downloadToFile(resolved({ size: null, supportsRange: true }), destination);

    assert.strictEqual(readFileSync(destination, 'utf8'), 'a fresh full file');
    assert.strictEqual(result.bytes, 'a fresh full file'.length);
  });

  it('does no network work when the partial file is already the full size', async () => {
    const destination = join(workDir, 'book.epub');
    writeFileSync(destination, 'already complete!!');

    const result = await downloadToFile(
      resolved({ size: 'already complete!!'.length, supportsRange: true }),
      destination
    );

    assert.strictEqual(result.bytes, 'already complete!!'.length);
    assert.strictEqual(requests.length, 0);
  });

  it('discards an over-long partial file and starts again', async () => {
    const destination = join(workDir, 'book.epub');
    writeFileSync(destination, 'this partial is somehow longer than the real file');
    queueResponse('short file', { status: 200 });

    const result = await downloadToFile(resolved({ size: 10, supportsRange: true }), destination);

    assert.strictEqual(readFileSync(destination, 'utf8'), 'short file');
    assert.strictEqual(result.bytes, 10);
  });

  it('throws DownloadLimitReachedError on a 429', async () => {
    queueResponse('', { status: 429 });
    const destination = join(workDir, 'book.epub');

    await assert.rejects(
      () => downloadToFile(resolved(), destination),
      (error: unknown) => error instanceof DownloadLimitReachedError
    );
  });

  it('carries the Retry-After the host asked for, so the source can be deferred for that long', async () => {
    queueResponse('', { status: 429, headers: { 'Retry-After': '3600' } });
    const destination = join(workDir, 'book.epub');

    await assert.rejects(
      () => downloadToFile(resolved(), destination),
      (error: unknown) =>
        error instanceof DownloadLimitReachedError && error.retryAfterMs === 3_600_000
    );
  });

  it('reports no Retry-After rather than inventing one, leaving the wait to the source policy', async () => {
    queueResponse('', { status: 429 });
    const destination = join(workDir, 'book.epub');

    await assert.rejects(
      () => downloadToFile(resolved(), destination),
      (error: unknown) =>
        error instanceof DownloadLimitReachedError && error.retryAfterMs === null
    );
  });

  it('throws LinkBrokenError when the server refuses the request', async () => {
    queueResponse('', { status: 404 });
    const destination = join(workDir, 'book.epub');

    await assert.rejects(
      () => downloadToFile(resolved(), destination),
      (error: unknown) => error instanceof LinkBrokenError
    );
    assert.strictEqual(existsSync(destination), false);
  });
});

/**
 * E1-5: every LibGen and Anna's result carries an md5, and until now nothing
 * checked it. These cover the three ways a mirror can hand back bytes that
 * are not the file — short, wrong-typed, or simply a different file — plus
 * the comic pipeline's unchanged path through the same function.
 */
describe('downloadToFile verification (E1-5)', () => {
  /** A minimal but plausible epub: a ZIP container's magic bytes and a body. */
  const EPUB = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('epub payload')]);
  const EPUB_MD5 = createHash('md5').update(EPUB).digest('hex');

  function queueBytes(body: Buffer, init: ResponseInit = {}): void {
    responses.push(new Response(new Uint8Array(body), init));
  }

  it('accepts a file whose md5 and magic bytes both match', async () => {
    queueBytes(EPUB, { status: 200 });
    const destination = join(workDir, 'book.epub');

    const result = await downloadToFile(resolved({ size: EPUB.length }), destination, {
      verify: { md5: EPUB_MD5, extension: 'epub' },
    });

    assert.strictEqual(result.bytes, EPUB.length);
    assert.deepStrictEqual(readFileSync(destination), EPUB);
  });

  it('matches an md5 case-insensitively, and tolerates surrounding whitespace', async () => {
    queueBytes(EPUB, { status: 200 });
    const destination = join(workDir, 'book.epub');

    await downloadToFile(resolved({ size: EPUB.length }), destination, {
      verify: { md5: `  ${EPUB_MD5.toUpperCase()} `, extension: 'epub' },
    });

    assert.deepStrictEqual(readFileSync(destination), EPUB);
  });

  it('rejects a truncated stream and leaves nothing behind to import', async () => {
    // The mirror promises a whole book and hangs up a few bytes in — the
    // failure the card is written against.
    queueBytes(EPUB.subarray(0, 6), { status: 200 });
    const destination = join(workDir, 'book.epub');

    await assert.rejects(
      () =>
        downloadToFile(resolved({ size: EPUB.length }), destination, {
          verify: { md5: EPUB_MD5, extension: 'epub' },
        }),
      (error: unknown) => error instanceof FileVerificationError && error.reason === 'truncated'
    );
    assert.strictEqual(existsSync(destination), false);
  });

  it('rejects a full-length file that hashes to something else', async () => {
    const impostor = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('other book!!'),
    ]);
    assert.strictEqual(impostor.length, EPUB.length, 'same length, different bytes');
    queueBytes(impostor, { status: 200 });
    const destination = join(workDir, 'book.epub');

    await assert.rejects(
      () =>
        downloadToFile(resolved({ size: EPUB.length }), destination, {
          verify: { md5: EPUB_MD5, extension: 'epub' },
        }),
      (error: unknown) => error instanceof FileVerificationError && error.reason === 'md5-mismatch'
    );
    assert.strictEqual(existsSync(destination), false);
  });

  it('rejects an error page dressed up as an epub, without hashing it first', async () => {
    const page = Buffer.from('<!DOCTYPE html><html><body>Too many requests</body></html>');
    queueBytes(page, { status: 200 });
    const destination = join(workDir, 'book.epub');

    await assert.rejects(
      () =>
        downloadToFile(resolved({ size: page.length }), destination, {
          verify: { md5: EPUB_MD5, extension: 'epub' },
        }),
      (error: unknown) => error instanceof FileVerificationError && error.reason === 'wrong-file-type'
    );
    assert.strictEqual(existsSync(destination), false);
  });

  it('sniffs %PDF for a pdf, and takes a real one', async () => {
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('body')]);
    queueBytes(pdf, { status: 200 });

    const result = await downloadToFile(
      resolved({ size: pdf.length }),
      join(workDir, 'book.pdf'),
      { verify: { extension: 'pdf' } }
    );
    assert.strictEqual(result.bytes, pdf.length);

    // ...and refuses a zip wearing a .pdf name.
    queueBytes(EPUB, { status: 200 });
    await assert.rejects(
      () =>
        downloadToFile(resolved({ size: EPUB.length }), join(workDir, 'other.pdf'), {
          verify: { extension: 'pdf' },
        }),
      (error: unknown) => error instanceof FileVerificationError && error.reason === 'wrong-file-type'
    );
  });

  it('rejects a file too short to carry a signature at all', async () => {
    queueBytes(Buffer.from('PK'), { status: 200 });
    const destination = join(workDir, 'book.epub');

    await assert.rejects(
      () => downloadToFile(resolved({ size: 2 }), destination, { verify: { extension: 'epub' } }),
      (error: unknown) => error instanceof FileVerificationError && error.reason === 'wrong-file-type'
    );
  });

  it('leaves an unknown extension unsniffed rather than guessing', async () => {
    const mobi = Buffer.from('BOOKMOBI and then some');
    queueBytes(mobi, { status: 200 });

    const result = await downloadToFile(
      resolved({ size: mobi.length }),
      join(workDir, 'book.mobi'),
      { verify: { extension: 'mobi' } }
    );
    assert.strictEqual(result.bytes, mobi.length);
  });

  it('verifies nothing at all when the caller asks for nothing — the comic path', async () => {
    // Comics resolve from GetComics posts that carry no hash, so they pass no
    // `verify` and must behave exactly as they did before E1-5: a short read
    // is still a successful download here.
    queueBytes(EPUB.subarray(0, 6), { status: 200 });
    const destination = join(workDir, 'comic.cbz');

    const result = await downloadToFile(resolved({ size: EPUB.length }), destination);

    assert.strictEqual(result.bytes, 6);
    assert.strictEqual(existsSync(destination), true);
  });

  it('hashes the bytes already on disk when resuming, not just the tail', async () => {
    const destination = join(workDir, 'book.epub');
    writeFileSync(destination, EPUB.subarray(0, 6));
    queueBytes(EPUB.subarray(6), {
      status: 206,
      headers: { 'content-range': `bytes 6-${EPUB.length - 1}/${EPUB.length}` },
    });

    const result = await downloadToFile(
      resolved({ size: EPUB.length, supportsRange: true }),
      destination,
      { verify: { md5: EPUB_MD5, extension: 'epub' } }
    );

    assert.strictEqual(result.bytes, EPUB.length);
    assert.deepStrictEqual(readFileSync(destination), EPUB);
  });

  it('checks a partial that is already the full size instead of trusting it', async () => {
    // Nothing goes over the wire in this branch, so before E1-5 a
    // complete-length but corrupt partial would have been imported as-is.
    const destination = join(workDir, 'book.epub');
    writeFileSync(destination, Buffer.alloc(EPUB.length)); // zero padding from a dead mirror

    await assert.rejects(
      () =>
        downloadToFile(resolved({ size: EPUB.length, supportsRange: true }), destination, {
          verify: { md5: EPUB_MD5, extension: 'epub' },
        }),
      (error: unknown) => error instanceof FileVerificationError && error.reason === 'wrong-file-type'
    );
    assert.strictEqual(existsSync(destination), false);
    assert.strictEqual(requests.length, 0, 'no network work for a file already on disk');
  });

  it('accepts a complete partial that does check out, still without a request', async () => {
    const destination = join(workDir, 'book.epub');
    writeFileSync(destination, EPUB);

    const result = await downloadToFile(
      resolved({ size: EPUB.length, supportsRange: true }),
      destination,
      { verify: { md5: EPUB_MD5, extension: 'epub' } }
    );

    assert.strictEqual(result.bytes, EPUB.length);
    assert.strictEqual(requests.length, 0);
  });
});
