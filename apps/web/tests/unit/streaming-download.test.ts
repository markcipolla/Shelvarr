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

import {
  DownloadLimitReachedError,
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
