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
