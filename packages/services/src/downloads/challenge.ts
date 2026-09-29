/**
 * Bot-protection / challenge-page detection.
 *
 * A source behind Cloudflare (or similar) often answers with HTTP 200 and an
 * HTML body that is a challenge/interstitial page rather than the page we
 * asked for. Regex parsers aimed at real search-result markup silently find
 * nothing on a page like that, which looks identical to "no results" from
 * the caller's point of view. `detectChallenge` recognises the common,
 * real-world signals of that so callers can throw `SourceBlockedError`
 * instead of returning an empty result set.
 *
 * This is intentionally not exhaustive — a missed challenge page just falls
 * through to "no results" as it does today, which is not a regression.
 */

import { sourceFetch } from '../utils/source-http';

// Substrings commonly found in Cloudflare/Turnstile (and similar) challenge
// or interstitial pages. Matched case-insensitively against the response body.
const CHALLENGE_BODY_MARKERS = [
  'Just a moment',
  '__cf_chl',
  'cf-turnstile',
  'cf_chl_opt',
  'Attention Required',
  'Checking your browser',
  'challenges.cloudflare.com',
  'DDoS protection by Cloudflare',
  'cloudflare-static',
];

/**
 * Fetch a source's HTML page, telling a bot check apart from a real failure.
 *
 * The body is read before the status is judged, which is the whole point:
 * a challenge page is not always served with a 200. Z-Library answers its
 * `Just a moment` interstitial with a 503, and every caller here used to
 * bail on `!response.ok` first — so the one signal that says "we are being
 * blocked" was thrown away unread, and a blocked source looked exactly like
 * a book nobody has.
 *
 * Returns the HTML, or null when the source answered with an error status
 * and nothing that looks like a challenge (a genuinely broken mirror).
 *
 * @throws SourceBlockedError when the response looks like a bot check,
 * whatever status it carried.
 */
export async function fetchSourcePage(
  source: string,
  url: string,
  init: RequestInit = {}
): Promise<string | null> {
  const response = await sourceFetch(source, url, init);
  const html = await response.text();

  if (detectChallenge(html, response)) {
    throw new SourceBlockedError(source, `${hostOf(url)} is behind a bot check right now`);
  }

  if (!response.ok) {
    console.warn(`${source} request to ${hostOf(url)} failed: ${response.status}`);
    return null;
  }

  return html;
}

/** Bare hostname for a message, without throwing on a malformed URL. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Returns true if the response/body looks like a bot-protection challenge
 * page rather than the requested content.
 */
export function detectChallenge(html: string, response: Response): boolean {
  if (response.headers.get('cf-ray')) {
    return true;
  }

  const lower = html.toLowerCase();
  return CHALLENGE_BODY_MARKERS.some((marker) => lower.includes(marker.toLowerCase()));
}

/**
 * Thrown when a source's response looks like a bot-protection challenge page
 * rather than real content, so callers can tell "the source is blocking us"
 * apart from "no results found".
 */
export class SourceBlockedError extends Error {
  public readonly source: string;

  constructor(source: string, message?: string) {
    super(message || `${source} is behind a bot check right now`);
    this.name = 'SourceBlockedError';
    this.source = source;
  }
}

/**
 * Thrown when a source answered with an ordinary 200 (not a challenge page —
 * `detectChallenge` already ruled that out) but the body doesn't contain
 * anything resembling that source's expected results markup at all. This is
 * distinct from a legitimately empty result set, where the surrounding page
 * structure is intact but nothing matched the query: that case still returns
 * `[]` as before. A `SourceParseError` means the site's markup has likely
 * changed and the regex-based parser needs updating.
 */
export class SourceParseError extends Error {
  public readonly source: string;

  constructor(source: string, message?: string) {
    super(message || `${source}'s page structure wasn't recognised — its parser may need updating`);
    this.name = 'SourceParseError';
    this.source = source;
  }
}

/**
 * How many consecutive structural-parse failures mark a source "suspect" in
 * `getParserHealth`. Picked to tolerate a single flaky/odd response without
 * flagging, but call it out once a pattern is clear.
 */
export const PARSE_FAILURE_SUSPECT_THRESHOLD = 3;

// In-memory, per-source streak of consecutive `SourceParseError`s. Not
// persisted — this is a live-process signal, not a history, and resets on
// restart same as everything else that's process-local here.
const consecutiveParseFailures = new Map<string, number>();

/**
 * Record that a source's response parsed against recognisable structure —
 * whether or not that produced any matches. Resets its failure streak.
 */
export function recordParseSuccess(source: string): void {
  consecutiveParseFailures.set(source, 0);
}

/**
 * Record that a source's response didn't match any recognisable structure
 * (a `SourceParseError` was thrown for it). Extends its failure streak.
 */
export function recordParseFailure(source: string): void {
  consecutiveParseFailures.set(source, (consecutiveParseFailures.get(source) ?? 0) + 1);
}

export interface ParserHealth {
  source: string;
  consecutiveFailures: number;
  suspect: boolean;
}

/**
 * Snapshot of consecutive structural-parse failures per source that has
 * failed at least once since this process started. A source is `suspect`
 * once its streak reaches `PARSE_FAILURE_SUSPECT_THRESHOLD` — a hint (not
 * proof) that its scraper needs attention, not a database-backed history.
 */
export function getParserHealth(): ParserHealth[] {
  return Array.from(consecutiveParseFailures.entries()).map(([source, consecutiveFailures]) => ({
    source,
    consecutiveFailures,
    suspect: consecutiveFailures >= PARSE_FAILURE_SUSPECT_THRESHOLD,
  }));
}
