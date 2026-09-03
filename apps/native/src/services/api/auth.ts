import type { AuthStatus, DeviceLoginPoll, User } from '@shelvarr/types';
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

  // 202 is the "we are not telling you whether that address exists" answer.
  if (!response.ok && response.status !== 202) {
    throw new AuthRequestError(payload?.error || `Server responded with ${response.status}`, response.status);
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

export interface DeviceLoginStart {
  deviceCode: string | null;
  userCode: string | null;
  expiresAt?: string;
  intervalSeconds?: number;
  emailSent: boolean;
  message?: string;
}

/** Ask the server to email a sign-in link that will approve this device. */
export function startDeviceLogin(email: string, serverUrl?: string): Promise<DeviceLoginStart> {
  return postJson<DeviceLoginStart>('/api/auth/device/start', { email }, serverUrl);
}

/** Ask whether the link has been opened yet. */
export function pollDeviceLogin(
  deviceCode: string,
  label: string,
  serverUrl?: string
): Promise<DeviceLoginPoll> {
  return postJson<DeviceLoginPoll>('/api/auth/device/poll', { deviceCode, label }, serverUrl);
}

/** Abandon a pending sign-in so the emailed link stops working. */
export async function cancelDeviceLogin(deviceCode: string, serverUrl?: string): Promise<void> {
  const url = baseUrl(serverUrl);
  if (!url) return;
  try {
    await fetch(`${url}/api/auth/device/poll?deviceCode=${encodeURIComponent(deviceCode)}`, {
      method: 'DELETE',
    });
  } catch {
    // Nothing to do: the request expires on its own.
  }
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
