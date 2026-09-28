/**
 * Deliberate pauses taken to stay inside a third-party API's rate limit.
 *
 * Four services pace themselves this way — Hardcover spaces its GraphQL calls,
 * ComicVine brakes between requests, LibGen and GetComics back off between
 * retries — and each one used to hand-roll `new Promise(r => setTimeout(r, n))`.
 * Routing them through one function gives that idiom a name, and gives the test
 * suite a single place to switch it off.
 *
 * Why switching it off matters: the pauses are real elapsed time, and the unit
 * tests mock `fetch`, so each one is spent waiting on a request that has already
 * returned. That was most of the suite's runtime — one Hardcover test file slept
 * for 59 of its 60 seconds.
 */

/**
 * Wait `ms` before the next outbound request.
 *
 * Setting `SHELVARR_DISABLE_REQUEST_PACING=1` skips the wait. Only ever do that
 * in tests: without the pauses a burst of real requests trips the very rate
 * limits they exist to respect, and ComicVine answers that with an hour-long
 * lockout. The variable is read per call rather than at import so that a test
 * can exercise both paths; it costs an env lookup per outbound request.
 */
export async function pace(ms: number): Promise<void> {
  if (!(ms > 0)) return;
  if (process.env['SHELVARR_DISABLE_REQUEST_PACING'] === '1') return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * When each paced key may next make a request, as epoch ms.
 *
 * `pace` spaces a single caller's own loop; this spaces *everything* that
 * talks to one host, however many tasks are in flight. The slot is reserved
 * synchronously — the map is written before the `await` — so two downloads
 * starting in the same tick queue up behind each other rather than both
 * reading the same "last request" time and firing together.
 */
const nextAllowedAt = new Map<string, number>();

/**
 * Wait until `key` is allowed to make another request.
 *
 * `key` is a source name (`libgen`, `zlibrary`, …) rather than a hostname:
 * the thing being rate-limited is the account or the service, not whichever
 * mirror domain it happens to resolve to today.
 *
 * Honours `SHELVARR_DISABLE_REQUEST_PACING` through `pace`, so the test suite
 * skips the wait while still walking the bookkeeping.
 */
export async function paceSource(key: string, minIntervalMs: number): Promise<void> {
  if (!(minIntervalMs > 0)) return;

  const now = Date.now();
  const earliest = Math.max(now, nextAllowedAt.get(key) ?? 0);
  nextAllowedAt.set(key, earliest + minIntervalMs);

  await pace(earliest - now);
}

/** Forget a key's pacing history (or every key's). Tests only. */
export function resetSourcePacing(key?: string): void {
  if (key === undefined) nextAllowedAt.clear();
  else nextAllowedAt.delete(key);
}

/**
 * How long a `Retry-After` header is asking us to wait, in milliseconds.
 *
 * RFC 9110 allows either a delay in seconds or an HTTP-date, and hosts use
 * both — Z-Library answers a spent quota with seconds, some Cloudflare
 * fronts answer with a date. Anything unparseable returns null so the caller
 * can fall back to its own default rather than treating a malformed header
 * as "retry immediately"; a date already in the past returns 0.
 */
export function parseRetryAfter(header: string | null | undefined, now: number = Date.now()): number | null {
  if (!header) return null;

  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;

  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  return Math.max(0, at - now);
}
