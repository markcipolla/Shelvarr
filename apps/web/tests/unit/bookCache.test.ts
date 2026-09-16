/**
 * Unit tests for the offline reader cache (lib/offline/bookCache.ts).
 *
 * Backed by fake-indexeddb so these run under plain Node, with no browser.
 * Each test gets its own key so it doesn't collide with the effects of tests
 * that ran before it against the same in-memory database — the fake persists
 * for the lifetime of this process (this file), not per-test.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import 'fake-indexeddb/auto';

const { getCachedBlob, putCachedBlob, epubCacheKey, pageCacheKey, isOffline } = await import(
  '../../lib/offline/bookCache.js'
);

let keyCounter = 0;
function uniqueKey(prefix: string): string {
  keyCounter += 1;
  return `${prefix}:${keyCounter}`;
}

describe('bookCache', () => {
  it('returns null for a key that was never cached', async () => {
    const result = await getCachedBlob(uniqueKey('miss'));
    assert.strictEqual(result, null);
  });

  it('round-trips a blob through put and get', async () => {
    const key = uniqueKey('roundtrip');
    const original = new Blob(['hello offline world'], { type: 'text/plain' });

    await putCachedBlob(key, original);
    const cached = await getCachedBlob(key);

    assert.ok(cached);
    assert.strictEqual(cached!.type, 'text/plain');
    const text = await cached!.text();
    assert.strictEqual(text, 'hello offline world');
  });

  it('overwrites a previous value stored under the same key', async () => {
    const key = uniqueKey('overwrite');

    await putCachedBlob(key, new Blob(['first'], { type: 'text/plain' }));
    await putCachedBlob(key, new Blob(['second'], { type: 'text/plain' }));

    const cached = await getCachedBlob(key);
    const text = await cached!.text();
    assert.strictEqual(text, 'second');
  });

  it('keeps epub and page keys distinct even with overlapping ids', async () => {
    // A book id and a page number can coincidentally be the same number —
    // the key scheme must not let those collide.
    const epubKey = epubCacheKey(42);
    const pageKey = pageCacheKey('book', 42, 1);
    assert.notStrictEqual(epubKey, pageKey);

    await putCachedBlob(epubKey, new Blob(['epub bytes']));
    await putCachedBlob(pageKey, new Blob(['page bytes']));

    assert.strictEqual(await (await getCachedBlob(epubKey))!.text(), 'epub bytes');
    assert.strictEqual(await (await getCachedBlob(pageKey))!.text(), 'page bytes');
  });

  it('keeps a book page and a comic page with the same id/page distinct', async () => {
    const bookPageKey = pageCacheKey('book', 5, 3);
    const comicPageKey = pageCacheKey('comic', 5, 3);
    assert.notStrictEqual(bookPageKey, comicPageKey);

    await putCachedBlob(bookPageKey, new Blob(['book page']));
    await putCachedBlob(comicPageKey, new Blob(['comic page']));

    assert.strictEqual(await (await getCachedBlob(bookPageKey))!.text(), 'book page');
    assert.strictEqual(await (await getCachedBlob(comicPageKey))!.text(), 'comic page');
  });

  it('reports offline based on navigator.onLine', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'onLine');
    Object.defineProperty(globalThis.navigator, 'onLine', {
      value: false,
      configurable: true,
    });
    try {
      assert.strictEqual(isOffline(), true);
    } finally {
      if (original) Object.defineProperty(globalThis.navigator, 'onLine', original);
    }
  });

  it('reports online when navigator.onLine is true', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'onLine');
    Object.defineProperty(globalThis.navigator, 'onLine', {
      value: true,
      configurable: true,
    });
    try {
      assert.strictEqual(isOffline(), false);
    } finally {
      if (original) Object.defineProperty(globalThis.navigator, 'onLine', original);
    }
  });
});
