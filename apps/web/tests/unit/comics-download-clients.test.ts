/**
 * Resolving a GetComics button link into something streamable.
 *
 * Every case here turns on where a redirect *ends*, which the button's label
 * cannot tell us — GetComics proxies several hosts through its own `/dls/`
 * URLs — so `fetch` is stubbed to control the final URL and headers.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import {
  LinkBrokenError,
  resolvePixeldrain,
} from '@shelvarr/services/comics/getcomics/clients/index';

const realFetch = globalThis.fetch;

/** Requests the resolver made, in order. */
let requested: string[] = [];
/** Responses to hand back, one per request. */
let responses: Response[] = [];

/**
 * A response pretending to be the end of a redirect chain. `url` is read-only
 * on a constructed Response, and it is the whole point of these tests.
 */
function landsOn(url: string, headers: Record<string, string> = {}): Response {
  const response = new Response('x', {
    status: 206,
    headers: { 'content-type': 'application/zip', ...headers },
  });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

beforeEach(() => {
  requested = [];
  responses = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requested.push(String(input));
    const next = responses.shift();
    if (!next) throw new Error(`Unexpected request to ${String(input)}`);
    return next;
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('resolvePixeldrain', () => {
  it('rewrites a share link straight to the API, without loading the page', async () => {
    responses = [landsOn('https://pixeldrain.com/api/file/abc123?download')];

    const resolved = await resolvePixeldrain('https://pixeldrain.com/u/abc123');

    assert.deepStrictEqual(requested, [
      'https://pixeldrain.com/api/file/abc123?download',
    ]);
    assert.strictEqual(resolved.url, 'https://pixeldrain.com/api/file/abc123?download');
  });

  it('follows a GetComics link that lands on a share page', async () => {
    responses = [
      // The share page itself: HTML, and not a file.
      landsOn('https://pixeldrain.com/u/xyz789', { 'content-type': 'text/html' }),
      landsOn('https://pixeldrain.com/api/file/xyz789?download'),
    ];

    const resolved = await resolvePixeldrain('https://getcomics.org/dls/TOKEN');

    assert.deepStrictEqual(requested, [
      'https://getcomics.org/dls/TOKEN',
      'https://pixeldrain.com/api/file/xyz789?download',
    ]);
    assert.strictEqual(resolved.url, 'https://pixeldrain.com/api/file/xyz789?download');
  });

  it('takes the file when a Pixeldrain button is really served by GetComics', async () => {
    responses = [
      landsOn('https://getcomics.org/dlds/Phoenix-001.cbz', {
        'content-disposition': 'attachment; filename="Phoenix 001.cbz"',
      }),
    ];

    const resolved = await resolvePixeldrain('https://getcomics.org/dls/TOKEN');

    assert.strictEqual(resolved.url, 'https://getcomics.org/dlds/Phoenix-001.cbz');
    assert.strictEqual(resolved.filename, 'Phoenix 001.cbz');
  });

  it('rejects a link that only ever reaches a web page', async () => {
    responses = [landsOn('https://getcomics.org/some-article/', { 'content-type': 'text/html' })];

    await assert.rejects(
      () => resolvePixeldrain('https://getcomics.org/dls/TOKEN'),
      (error: Error) => {
        assert.ok(error instanceof LinkBrokenError);
        assert.match(error.message, /web page, not a file/);
        return true;
      }
    );
  });

  it('refuses a folder without asking the server', async () => {
    await assert.rejects(
      () => resolvePixeldrain('https://pixeldrain.com/l/folder1'),
      /folder links are not supported/
    );
    assert.deepStrictEqual(requested, []);
  });

  it('refuses a folder the redirect leads to', async () => {
    responses = [landsOn('https://pixeldrain.com/l/folder2', { 'content-type': 'text/html' })];

    await assert.rejects(
      () => resolvePixeldrain('https://getcomics.org/dls/TOKEN'),
      /folder links are not supported/
    );
  });

  it('reports a dead link rather than guessing', async () => {
    responses = [
      Object.defineProperty(new Response('', { status: 404 }), 'url', {
        value: 'https://pixeldrain.com/u/gone',
      }),
    ];

    await assert.rejects(
      () => resolvePixeldrain('https://getcomics.org/dls/TOKEN'),
      /Server returned 404/
    );
  });
});
