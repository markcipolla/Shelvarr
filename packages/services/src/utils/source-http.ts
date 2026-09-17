/**
 * Every outbound request to a download source goes through here.
 *
 * Two things used to be hardcoded in six different files: the User-Agent
 * string, copied verbatim, and the absence of any way to route a request
 * through a proxy. Both are now per-source settings on
 * `download_source_config`, and this is the single place that reads them.
 *
 * A source with nothing configured behaves exactly as it always has — the
 * shared default User-Agent, the global `fetch`. Only a source with a proxy
 * set goes anywhere near `proxyFetch`, and only that source's requests do:
 * the setting is looked up by source name on every call, so enabling a proxy
 * for Z-Library leaves LibGen's requests alone.
 */

import { getSourceNetworkSettings } from '@shelvarr/db';
import { proxyFetch } from './proxy-fetch';
import { createLogger } from './logger';

const log = createLogger('source-http');

/**
 * The User-Agent used when a source has no override. These hosts serve
 * different (or no) markup to something that announces itself as a robot, so
 * this claims to be a browser — which it broadly is, in that it renders the
 * page it fetches into a book.
 */
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface ResolvedSourceNetwork {
  proxyUrl: string | null;
  userAgent: string;
}

/**
 * The proxy and User-Agent configured for `source`.
 *
 * Falls back to the defaults if the database is not available — a caller in a
 * test that never initialized one, say. Configuration is not worth failing a
 * request over.
 */
export function resolveSourceNetwork(source: string | undefined): ResolvedSourceNetwork {
  if (!source) return { proxyUrl: null, userAgent: DEFAULT_USER_AGENT };

  try {
    const settings = getSourceNetworkSettings(source);
    return {
      proxyUrl: settings.proxyUrl,
      userAgent: settings.userAgent || DEFAULT_USER_AGENT,
    };
  } catch {
    return { proxyUrl: null, userAgent: DEFAULT_USER_AGENT };
  }
}

/** Does this header set already name a User-Agent? */
function hasUserAgent(headers: HeadersInit | undefined): boolean {
  if (!headers) return false;
  return new Headers(headers).has('user-agent');
}

/**
 * `fetch` as `source` would make it: its User-Agent, and its proxy if it has
 * one. An explicit `User-Agent` in `init.headers` still wins, for the one or
 * two callers that need to impersonate something specific.
 */
export async function sourceFetch(
  source: string | undefined,
  input: string | URL,
  init: RequestInit = {}
): Promise<Response> {
  const { proxyUrl, userAgent } = resolveSourceNetwork(source);

  const headers = new Headers(init.headers);
  if (!hasUserAgent(init.headers)) headers.set('User-Agent', userAgent);
  const withHeaders: RequestInit = { ...init, headers };

  if (!proxyUrl) {
    // Deliberately the global `fetch`, resolved at call time, so tests that
    // replace `globalThis.fetch` keep working.
    return fetch(input, withHeaders);
  }

  log.debug('Routing request through this source\'s proxy', { source, url: String(input) });
  return proxyFetch(input, withHeaders, proxyUrl);
}

/**
 * Headers for a request a caller is going to make itself (`fetchProbe` takes
 * its own headers, LibGen has its own retrying fetch). Same User-Agent
 * resolution, no request.
 */
export function sourceHeaders(
  source: string | undefined,
  extra: Record<string, string> = {}
): Record<string, string> {
  return { 'User-Agent': resolveSourceNetwork(source).userAgent, ...extra };
}
