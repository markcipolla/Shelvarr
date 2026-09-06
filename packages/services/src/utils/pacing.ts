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
