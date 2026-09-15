/**
 * The demo server's network guard: tests/no-network.mjs, with cover art let
 * through.
 *
 * Some pages render covers with next/image, whose optimiser fetches the image
 * on the server — so the test guard, which blocks everything, leaves those
 * pages with broken images. Everything else stays blocked, for the same
 * reasons as in the tests: the demo's download queue points at links that do
 * not exist, and the metadata settings would otherwise probe real services.
 */

// OpenLibrary serves most covers by redirecting into archive.org.
function allowed(hostname) {
  return (
    ['localhost', '127.0.0.1', '::1', '[::1]', 'covers.openlibrary.org', 'archive.org'].includes(
      hostname
    ) || hostname.endsWith('.archive.org')
  );
}

/* global URL */
const realFetch = globalThis.fetch;

globalThis.fetch = async function fetch(input, init) {
  let url;
  try {
    url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  } catch {
    return realFetch(input, init);
  }
  if (!/^https?:$/.test(url.protocol) || allowed(url.hostname)) {
    return realFetch(input, init);
  }
  throw new TypeError(`Demo server: blocked network request to ${url.origin}${url.pathname}`);
};
