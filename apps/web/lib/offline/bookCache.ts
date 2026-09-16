/**
 * A small, reader-agnostic offline cache for the bytes a reader needs to
 * render without a network connection: a whole EPUB file, or an individual
 * book/comic page image.
 *
 * Backed by IndexedDB rather than the HTTP cache — the HTTP cache isn't
 * durable enough to promise "come back later, offline, and this still
 * works", and Next's own fetch-caching semantics aren't something to build
 * that promise on either.
 *
 * This deliberately does not implement a service worker or offline
 * navigation to a book's page from a cold load with zero connectivity —
 * that's a materially larger feature (see the E3-6 card). What this gives
 * a reader that's already loaded in the browser is: reopen something you
 * opened before, offline, and it still works.
 *
 * Values are stored as a `{ type, data }` record (a MIME type string plus
 * an ArrayBuffer) rather than as a raw Blob. Storing Blobs directly in
 * IndexedDB has a history of being unreliable across browsers (notably an
 * old WebKit bug that silently dropped them), so round-tripping through an
 * ArrayBuffer — which every implementation structured-clones correctly —
 * is the safer bet, and the Blob is reconstructed on read.
 */

const DB_NAME = 'shelvarr-offline-cache';
const DB_VERSION = 1;
const STORE_NAME = 'blobs';

interface StoredBlob {
  type: string;
  data: ArrayBuffer;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open offline cache database'));
  });
}

/**
 * Looks up a cached blob by key. Resolves to `null` on a genuine miss, and
 * also on any failure to read it (a corrupt or unavailable cache should
 * fall back to the network, not break the caller).
 */
export async function getCachedBlob(key: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    try {
      const record = await new Promise<StoredBlob | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result as StoredBlob | undefined);
        req.onerror = () => reject(req.error ?? new Error('Failed to read from offline cache'));
      });
      if (!record) return null;
      return new Blob([record.data], { type: record.type });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/**
 * Stores a blob under a key, overwriting whatever was there before. Fails
 * silently — losing a cache write just means the next open falls back to
 * the network again, which is not worth interrupting a reading session over.
 */
export async function putCachedBlob(key: string, blob: Blob): Promise<void> {
  try {
    const data = await blob.arrayBuffer();
    const record: StoredBlob = { type: blob.type, data };
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(record, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? new Error('Failed to write to offline cache'));
      });
    } finally {
      db.close();
    }
  } catch {
    // Non-critical: see doc comment above.
  }
}

/** Key for a whole EPUB file, cached wholesale the way the reader fetches it. */
export function epubCacheKey(bookId: number | string): string {
  return `epub:${bookId}`;
}

/**
 * Key for a single rendered page image, from either a book or comic reader.
 * `kind` keeps a book's page 3 and a comic's page 3 from colliding.
 */
export function pageCacheKey(kind: 'book' | 'comic', id: number | string, page: number): string {
  return `page:${kind}:${id}:${page}`;
}

/**
 * Whether the browser currently believes it has no network connection.
 * `navigator.onLine` is not a perfect signal (it can be true on a dead
 * connection), but it's good enough to decide whether attempting a
 * background refresh fetch is worth it at all.
 */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}
