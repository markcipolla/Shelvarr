/**
 * The admin diagnostics API: who may read this server's logs and status.
 *
 * The whole surface is off until someone ticks the box in Settings →
 * Advanced. Logs are the most revealing thing this application holds — file
 * paths, search terms, email addresses in sign-in lines — so it stays shut
 * unless it has been asked for.
 */

import { getSetting, setSetting } from '@shelvarr/db';

import { authenticateRequest, type HeaderReader } from '../auth/request';
import { generateToken, tokensMatch } from '../auth/tokens';

/** Whether the diagnostics API and its MCP endpoint answer at all. */
export const ADMIN_API_ENABLED_SETTING = 'admin_api_enabled';

/**
 * The bearer token an MCP client presents.
 *
 * Stored as it is typed, not hashed: the settings page has to show it so it
 * can be pasted into an MCP client's config, and a hash cannot be shown. Same
 * trade-off as the existing shared `api_key`, and the reason the token is
 * single-purpose — it opens the diagnostics endpoints and nothing else.
 */
export const ADMIN_API_TOKEN_SETTING = 'admin_api_token';

export function isAdminApiEnabled(): boolean {
  return getSetting<boolean>(ADMIN_API_ENABLED_SETTING, false) === true;
}

export function getAdminApiToken(): string | null {
  const token = getSetting<string>(ADMIN_API_TOKEN_SETTING, null);
  return token && token.length > 0 ? token : null;
}

/** Mint a fresh token, invalidating whatever any client is currently holding. */
export function regenerateAdminApiToken(): string {
  const token = generateToken();
  setSetting(ADMIN_API_TOKEN_SETTING, token);
  return token;
}

/** The token, minting one on first use so enabling the API is a single click. */
export function ensureAdminApiToken(): string {
  return getAdminApiToken() ?? regenerateAdminApiToken();
}

/**
 * Turn the API on or off.
 *
 * Switching off deliberately keeps the token: someone toggling the box to see
 * what happens should not have to redistribute a new token to every client.
 * Use `regenerateAdminApiToken` to actually revoke.
 */
export function setAdminApiEnabled(enabled: boolean): { enabled: boolean; token: string | null } {
  setSetting(ADMIN_API_ENABLED_SETTING, enabled);
  return { enabled, token: enabled ? ensureAdminApiToken() : getAdminApiToken() };
}

export type AdminAuthResult =
  | { ok: true; via: 'token' | 'admin-session' | 'auth-disabled' }
  | { ok: false; status: 401 | 403 | 404; error: string };

/** The bearer token on a request, if it carries one. */
function bearerToken(headers: HeaderReader): string | null {
  const authorization = headers.get('Authorization') || headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Decide whether a request may read diagnostics.
 *
 * Three ways in, in order:
 *   - the dedicated admin token, which is what MCP clients use;
 *   - a signed-in admin's session, so the settings page can show a log tail
 *     without holding the token;
 *   - nothing at all, on a server running with authentication switched off,
 *     which is already an explicit "this is a trusted network" choice.
 *
 * The legacy shared `api_key` is not accepted. It is handed to scripts and
 * grants no identity, and this endpoint is a different order of access.
 *
 * A disabled API answers 404 rather than 403: with the box unticked there is
 * nothing here, and saying so is both true and unhelpful to a prober.
 */
export function authoriseAdminRequest(headers: HeaderReader): AdminAuthResult {
  if (!isAdminApiEnabled()) {
    return {
      ok: false,
      status: 404,
      error: 'The admin diagnostics API is switched off. Enable it in Settings → Advanced.',
    };
  }

  const presented = bearerToken(headers);
  const configured = getAdminApiToken();
  if (presented && configured && tokensMatch(presented, configured)) {
    return { ok: true, via: 'token' };
  }

  // Not the admin token — it may still be a session token, or a cookie.
  const auth = authenticateRequest(headers);
  if (auth?.kind === 'disabled') return { ok: true, via: 'auth-disabled' };
  if (auth?.kind === 'session') {
    return auth.user.role === 'admin'
      ? { ok: true, via: 'admin-session' }
      : { ok: false, status: 403, error: 'Administrators only' };
  }

  return { ok: false, status: 401, error: 'Unauthorized' };
}
