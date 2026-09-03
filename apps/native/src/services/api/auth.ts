import type { AuthStatus, LoginCodeChallenge, User } from '@shelvarr/types';
import { useSettingsStore } from '../../stores/useSettingsStore';

/**
 * Auth calls deliberately use `fetch` rather than the shared axios client.
 * The client attaches the token this module is responsible for obtaining, so
 * going through it would be circular — and signing in must work while the
 * stored token is missing or rejected.
 */
function baseUrl(override?: string): string {
  const url = override ?? useSettingsStore.getState().shelvarrUrl;
  return url.replace(/\/+$/, '');
}

export class AuthRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'AuthRequestError';
  }
}

async function postJson<T>(path: string, body: unknown, serverUrl?: string): Promise<T> {
  const url = baseUrl(serverUrl);
  if (!url) throw new AuthRequestError('Server URL not configured');

  let response: Response;
  try {
    response = await fetch(`${url}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthRequestError('Could not reach the server');
  }

  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;

  if (!response.ok) {
    throw new AuthRequestError(
      payload?.error || `Server responded with ${response.status}`,
      response.status
    );
  }
  if (!payload) throw new AuthRequestError('Unexpected response from the server');
  return payload;
}

/** What this server expects of us, before we know who the user is. */
export async function fetchAuthStatus(serverUrl?: string): Promise<AuthStatus> {
  const url = baseUrl(serverUrl);
  if (!url) throw new AuthRequestError('Server URL not configured');

  let response: Response;
  try {
    response = await fetch(`${url}/api/auth/status`, {
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new AuthRequestError('Could not reach the server');
  }

  if (!response.ok) {
    // A server predating user accounts has no such endpoint. Treat that as
    // "no authentication", which is exactly how it behaves.
    if (response.status === 404) {
      return { enabled: false, setupRequired: false, allowSignup: false, emailConfigured: false };
    }
    throw new AuthRequestError(`Server responded with ${response.status}`, response.status);
  }

  return (await response.json()) as AuthStatus;
}

export interface LoginCodeRequest extends LoginCodeChallenge {
  message?: string;
}

/** Ask the server to email a one-time sign-in code. */
export function requestLoginCode(email: string, serverUrl?: string): Promise<LoginCodeRequest> {
  return postJson<LoginCodeRequest>('/api/auth/login', { email, client: 'native' }, serverUrl);
}

export interface LoginCodeResult {
  token: string;
  expiresAt: string;
  user: User;
}

/**
 * Trade the emailed code for a session.
 *
 * The address goes up with the code: six characters on their own are weak,
 * and pinning them to one account is what keeps the server's guess limit
 * meaningful.
 */
export function submitLoginCode(
  email: string,
  code: string,
  label: string,
  serverUrl?: string
): Promise<LoginCodeResult> {
  return postJson<LoginCodeResult>(
    '/api/auth/verify',
    { email, code, client: 'native', label },
    serverUrl
  );
}

export type SessionCheck =
  | { state: 'valid'; user: User | null }
  | { state: 'rejected' }
  | { state: 'unreachable' };

/**
 * Confirm a stored token still works.
 *
 * "Unreachable" is kept distinct from "rejected" on purpose: being offline
 * must not sign someone out of a library they have downloaded.
 */
export async function checkSession(token: string, serverUrl?: string): Promise<SessionCheck> {
  const url = baseUrl(serverUrl);
  if (!url) return { state: 'unreachable' };

  let response: Response;
  try {
    response = await fetch(`${url}/api/auth/session`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
  } catch {
    return { state: 'unreachable' };
  }

  if (response.status === 401) return { state: 'rejected' };
  if (!response.ok) return { state: 'unreachable' };

  const body = (await response.json().catch(() => null)) as { user?: User | null } | null;
  return { state: 'valid', user: body?.user ?? null };
}

/** End the session on the server as well as on the device. */
export async function revokeSession(token: string, serverUrl?: string): Promise<void> {
  const url = baseUrl(serverUrl);
  if (!url) return;
  try {
    await fetch(`${url}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // The local token is cleared regardless; a stale server session expires.
  }
}
