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
import { createLogger } from '../utils/logger';

const log = createLogger('admin');

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

/**
 * A token set in the environment instead of Settings.
 *
 * It opens the API whatever the checkbox says, survives Regenerate, and is
 * checked before the database is touched: the moment diagnostics matter most
 * can be the moment the database will not open, and a token kept in that
 * database is no use then.
 */
export const ADMIN_API_TOKEN_ENV = 'SHELVARR_ADMIN_API_TOKEN';

/** Shorter than this and the environment token is ignored: it guards logs on a network. */
export const MIN_ENVIRONMENT_TOKEN_LENGTH = 32;

let warnedShortEnvironmentToken = false;

/** The environment token, or null when it is unset or too short to trust. */
export function getEnvironmentAdminToken(): string | null {
  const token = process.env[ADMIN_API_TOKEN_ENV]?.trim();
  if (!token) return null;
  if (token.length < MIN_ENVIRONMENT_TOKEN_LENGTH) {
    if (!warnedShortEnvironmentToken) {
      warnedShortEnvironmentToken = true;
      log.warn(
        `${ADMIN_API_TOKEN_ENV} is ignored: it must be at least ${MIN_ENVIRONMENT_TOKEN_LENGTH} characters. ` +
          'Generate one with `openssl rand -hex 32`.'
      );
    }
    return null;
  }
  return token;
}

/** Whether the checkbox in Settings → Advanced is ticked. */
export function isAdminApiEnabled(): boolean {
  return getSetting<boolean>(ADMIN_API_ENABLED_SETTING, false) === true;
}

/** Whether the API answers at all: the checkbox, or a token in the environment. */
export function isAdminApiOpen(): boolean {
  return getEnvironmentAdminToken() !== null || isAdminApiEnabled();
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
  | { ok: true; via: 'environment-token' | 'token' | 'admin-session' | 'auth-disabled' }
  | { ok: false; status: 401 | 403 | 404 | 503; error: string };

/** The bearer token on a request, if it carries one. */
function bearerToken(headers: HeaderReader): string | null {
  const authorization = headers.get('Authorization') || headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Whether a request came from this server's own pages, or from no page at all.
 *
 * MCP clients and curl send no Origin. A browser always does on a POST, and
 * the spec requires servers to check it: otherwise a page on another site
 * could use DNS rebinding to reach a server that trusts its network. Nothing
 * in Shelvarr's own UI calls these endpoints, but same-origin is allowed so
 * that it could.
 */
function isSameOrigin(headers: HeaderReader): boolean {
  const origin = headers.get('origin');
  if (!origin) return true;

  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    // "null", from a sandboxed frame or a file:// page.
    return false;
  }

  // Behind a reverse proxy the public name is in X-Forwarded-Host.
  const forwardedHost = headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = (forwardedHost || headers.get('host') || '').toLowerCase();
  return host.length > 0 && originHost === host;
}

/**
 * Decide whether a request may read diagnostics.
 *
 * Four ways in, in order:
 *   - the environment token, which never touches the database;
 *   - the admin token from Settings, which is what MCP clients usually use;
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
 *
 * Never throws. A database that cannot be read answers 503 with the reason,
 * rather than a bare 500 page.
 */
export function authoriseAdminRequest(headers: HeaderReader): AdminAuthResult {
  const environmentToken = getEnvironmentAdminToken();
  const presented = bearerToken(headers);

  try {
    if (!environmentToken && !isAdminApiEnabled()) {
      return {
        ok: false,
        status: 404,
        error: 'The admin diagnostics API is switched off. Enable it in Settings → Advanced.',
      };
    }

    if (!isSameOrigin(headers)) {
      return { ok: false, status: 403, error: 'Cross-origin requests are not accepted' };
    }

    if (presented && environmentToken && tokensMatch(presented, environmentToken)) {
      return { ok: true, via: 'environment-token' };
    }

    const configured = getAdminApiToken();
    if (presented && configured && tokensMatch(presented, configured)) {
      return { ok: true, via: 'token' };
    }

    // Not an admin token — it may still be a session token, or a cookie.
    const auth = authenticateRequest(headers);
    if (auth?.kind === 'disabled') return { ok: true, via: 'auth-disabled' };
    if (auth?.kind === 'session') {
      return auth.user.role === 'admin'
        ? { ok: true, via: 'admin-session' }
        : { ok: false, status: 403, error: 'Administrators only' };
    }

    return { ok: false, status: 401, error: 'Unauthorized' };
  } catch (error) {
    // The reason goes to the log, not to a caller who has not yet proved who they are.
    log.error('Could not check diagnostics credentials', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      status: 503,
      error:
        'Could not check credentials: the database could not be read. ' +
        `Set ${ADMIN_API_TOKEN_ENV} to reach diagnostics while it is unavailable.`,
    };
  }
}
