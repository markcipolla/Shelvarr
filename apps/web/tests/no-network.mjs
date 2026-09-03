/**
 * Blocks outbound network access during tests.
 *
 * Load this before anything else with `node --import ./tests/no-network.mjs`,
 * or via NODE_OPTIONS for processes we do not launch ourselves (the `next dev`
 * server Playwright starts). Plain .mjs rather than .ts so it works in both:
 * the dev server has no tsx loader.
 *
 * Real services get reached more easily than you would think. Rendering
 * /settings/downloads calls getSourceStatuses(), which probes every shadow
 * library we know of, so an e2e test that only looks at headings was making a
 * live request to each one. Everything external in this codebase goes through
 * fetch, so wrapping it is enough.
 *
 * Requests to localhost still go through: the e2e suite talks to its own
 * server, and unit tests spin up throwaway HTTP servers.
 */

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

/** Loopback, and anything under the reserved .localhost TLD. */
function isLocal(url) {
  const host = url.hostname;
  return LOCAL_HOSTNAMES.has(host) || host.endsWith('.localhost');
}

/**
 * The URL a fetch call is aimed at, or null when we cannot tell — a relative
 * specifier, say, which fetch will reject on its own terms anyway.
 */
function targetUrl(input) {
  try {
    if (typeof input === 'string') return new URL(input);
    if (input instanceof URL) return input;
    if (input && typeof input.url === 'string') return new URL(input.url);
  } catch {
    return null;
  }
  return null;
}

const realFetch = globalThis.fetch;

globalThis.fetch = async function fetch(input, init) {
  const url = targetUrl(input);

  // data:, blob: and friends never leave the process, and an unparseable
  // target is fetch's problem to report.
  if (!url || !/^https?:$/.test(url.protocol) || isLocal(url)) {
    return realFetch(input, init);
  }

  const message =
    `Blocked network request to ${url.origin}${url.pathname} — tests must not ` +
    `reach external services. Mock fetch in the test, or add the host to ` +
    `tests/no-network.mjs if it is meant to be local.`;
  console.warn(message);
  // A TypeError is what fetch throws when a request cannot be made, so callers
  // that already handle network failure keep working.
  throw new TypeError(message);
};
