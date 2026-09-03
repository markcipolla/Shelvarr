import type { AuthStatus, Session, User } from '@shelvarr/types';
import { getSetting } from '@shelvarr/db';
import { getAuthConfig, isEmailConfigured } from './config';
import { resolveSession } from './sessions';
import { isSetupRequired, isSignupAllowed } from './users';

/** The browser cookie holding a web session token. */
export const SESSION_COOKIE_NAME = 'shelvarr_session';

/** Just enough of a Headers object to read from; keeps this framework-agnostic. */
export interface HeaderReader {
  get(name: string): string | null;
}

export type RequestAuth =
  /** Authentication is switched off; the request is let through unexamined. */
  | { kind: 'disabled' }
  /** A signed-in person, via cookie or bearer token. */
  | { kind: 'session'; user: User; session: Session }
  /** The legacy shared API key, for scripts and integrations. */
  | { kind: 'api-key' };

/** Pull one cookie out of a raw Cookie header. */
export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;
    return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

/** The session token a request is carrying, from either transport. */
export function extractSessionToken(headers: HeaderReader): string | null {
  const authorization = headers.get('Authorization') || headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    const token = authorization.slice(7).trim();
    if (token) return token;
  }
  return readCookie(headers.get('Cookie') || headers.get('cookie'), SESSION_COOKIE_NAME);
}

/**
 * Work out who, if anyone, is behind a request.
 *
 * Order matters: a real session wins over the shared API key, so per-user
 * information stays available even on a server that also has a key set.
 */
export function authenticateRequest(headers: HeaderReader): RequestAuth | null {
  if (!getAuthConfig().enabled) {
    return { kind: 'disabled' };
  }

  const found = resolveSession(extractSessionToken(headers));
  if (found) {
    return { kind: 'session', user: found.user, session: found.session };
  }

  // Shared key, kept for scripts and integrations that predate accounts.
  // Unset by default, and it grants no identity — only access.
  const configuredApiKey = getSetting<string>('api_key', null);
  if (configuredApiKey) {
    if (headers.get('X-API-Key') === configuredApiKey) return { kind: 'api-key' };

    const authorization = headers.get('Authorization');
    if (authorization?.startsWith('Basic ')) {
      const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf-8');
      const [, password] = decoded.split(':');
      if (password === configuredApiKey) return { kind: 'api-key' };
    }
  }

  return null;
}

/** The user behind a request, if it is a real signed-in person. */
export function getRequestUser(headers: HeaderReader): User | null {
  const auth = authenticateRequest(headers);
  return auth?.kind === 'session' ? auth.user : null;
}

/** What an unauthenticated caller may know, so clients can pick a screen. */
export function getAuthStatus(): AuthStatus {
  const config = getAuthConfig();
  if (!config.enabled) {
    return {
      enabled: false,
      setupRequired: false,
      allowSignup: false,
      emailConfigured: isEmailConfigured(),
    };
  }
  return {
    enabled: true,
    setupRequired: isSetupRequired(),
    allowSignup: isSignupAllowed(),
    emailConfigured: isEmailConfigured(),
  };
}

/**
 * Whether a value is safe to redirect a browser to after signing in.
 *
 * Must be a path on this server. A leading `//` is rejected specifically:
 * `//evil.example` passes a naive "starts with /" check but resolves to
 * another origin entirely, which would make the sign-in flow an open redirect.
 * A backslash is rejected for the same reason — some clients normalise it to
 * a forward slash.
 */
export function isSafeRedirect(value: string | null | undefined): value is string {
  if (!value) return false;
  if (!value.startsWith('/')) return false;
  return !value.startsWith('//') && !value.startsWith('/\\');
}
