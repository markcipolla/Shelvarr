import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { AuthStatus, User } from '@shelvarr/types';
import {
  AuthRequestError,
  cancelDeviceLogin,
  checkSession,
  fetchAuthStatus,
  pollDeviceLogin,
  revokeSession,
  startDeviceLogin,
} from '../services/api/auth';

const TOKEN_KEY = 'auth_sessionToken';
const USER_KEY = 'auth_user';

/**
 * - `unknown`   — still working out where we stand; show a spinner.
 * - `disabled`  — this server does not use accounts; let everything through.
 * - `signed-out`— a sign-in is needed before the library is reachable.
 * - `signed-in` — we hold a token the server accepts (or accepted last time
 *                 we could ask, which is what keeps offline reading working).
 */
export type AuthState = 'unknown' | 'disabled' | 'signed-out' | 'signed-in';

export interface PendingLogin {
  email: string;
  deviceCode: string;
  userCode: string | null;
  emailSent: boolean;
  message?: string;
}

interface AuthStore {
  state: AuthState;
  token: string | null;
  user: User | null;
  serverStatus: AuthStatus | null;
  pending: PendingLogin | null;
  error: string | null;
  /** True while a sign-in request or poll is in flight. */
  busy: boolean;

  loadAuth: () => Promise<void>;
  refresh: () => Promise<void>;
  beginLogin: (email: string) => Promise<boolean>;
  pollPendingLogin: () => Promise<'pending' | 'approved' | 'expired' | 'denied' | 'error'>;
  cancelLogin: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Called by the API client when the server rejects our token. */
  handleUnauthorized: () => void;
  clearError: () => void;
}

/** Names the session in the web UI's device list, so it can be recognised. */
function deviceLabel(): string {
  return `Stackarr on ${Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS}`;
}

async function persist(token: string | null, user: User | null): Promise<void> {
  if (token) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }

  if (user) {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  } else {
    await SecureStore.deleteItemAsync(USER_KEY);
  }
}

function describe(error: unknown): string {
  if (error instanceof AuthRequestError) return error.message;
  return error instanceof Error ? error.message : 'Something went wrong';
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  state: 'unknown',
  token: null,
  user: null,
  serverStatus: null,
  pending: null,
  error: null,
  busy: false,

  /** Read the stored token at boot, then confirm it against the server. */
  loadAuth: async () => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    const storedUser = await SecureStore.getItemAsync(USER_KEY);

    let user: User | null = null;
    if (storedUser) {
      try {
        user = JSON.parse(storedUser) as User;
      } catch {
        user = null;
      }
    }

    set({ token, user });
    await get().refresh();
  },

  /**
   * Work out the current state from what the server says.
   *
   * Being unable to reach the server never signs anyone out: a downloaded
   * library has to stay readable on a train.
   */
  refresh: async () => {
    const { token } = get();

    let status: AuthStatus;
    try {
      status = await fetchAuthStatus();
    } catch {
      set({ state: token ? 'signed-in' : 'signed-out', serverStatus: null });
      return;
    }

    set({ serverStatus: status });

    if (!status.enabled) {
      set({ state: 'disabled', error: null });
      return;
    }

    if (!token) {
      set({ state: 'signed-out' });
      return;
    }

    const result = await checkSession(token);
    if (result.state === 'rejected') {
      await persist(null, null);
      set({ state: 'signed-out', token: null, user: null });
      return;
    }

    if (result.state === 'valid' && result.user) {
      await persist(token, result.user);
      set({ state: 'signed-in', user: result.user, error: null });
      return;
    }

    // Unreachable, or reachable but not reporting a user. Either way the
    // token we hold is the best information available.
    set({ state: 'signed-in', error: null });
  },

  /** Ask the server to email a link that will approve this device. */
  beginLogin: async (email: string) => {
    set({ busy: true, error: null });
    try {
      const result = await startDeviceLogin(email.trim());

      if (!result.deviceCode) {
        // The address is unknown and self-signup is off. The server will not
        // say so outright, and neither do we.
        set({
          busy: false,
          error:
            result.message ??
            'If that address has an account, a sign-in link is on its way.',
        });
        return false;
      }

      set({
        busy: false,
        pending: {
          email: email.trim(),
          deviceCode: result.deviceCode,
          userCode: result.userCode,
          emailSent: result.emailSent,
          message: result.message,
        },
      });
      return true;
    } catch (error) {
      set({ busy: false, error: describe(error) });
      return false;
    }
  },

  /** One tick of the wait for someone to open the emailed link. */
  pollPendingLogin: async () => {
    const { pending } = get();
    if (!pending) return 'error';

    let result;
    try {
      result = await pollDeviceLogin(pending.deviceCode, deviceLabel());
    } catch {
      // A blip in the network is not a failed sign-in; keep waiting.
      return 'pending';
    }

    if (result.status === 'approved') {
      await persist(result.token, result.user);
      set({
        state: 'signed-in',
        token: result.token,
        user: result.user,
        pending: null,
        error: null,
      });
      return 'approved';
    }

    if (result.status === 'expired' || result.status === 'denied') {
      set({
        pending: null,
        error:
          result.status === 'expired'
            ? 'That sign-in request expired. Try again.'
            : 'That sign-in request was refused.',
      });
      return result.status;
    }

    return 'pending';
  },

  cancelLogin: async () => {
    const { pending } = get();
    if (pending) await cancelDeviceLogin(pending.deviceCode);
    set({ pending: null, error: null });
  },

  signOut: async () => {
    const { token } = get();
    if (token) await revokeSession(token);
    await persist(null, null);
    set({ state: 'signed-out', token: null, user: null, pending: null, error: null });
  },

  handleUnauthorized: () => {
    // Only meaningful while we believed we were signed in; the token is
    // cleared so the next render lands on the sign-in screen.
    if (get().state !== 'signed-in') return;
    void persist(null, null);
    set({ state: 'signed-out', token: null, user: null });
  },

  clearError: () => set({ error: null }),
}));

/**
 * Headers for a request made outside the axios client — file downloads, image
 * sources, anything given a bare URL.
 */
export function getAuthHeaders(): Record<string, string> {
  const { token } = useAuthStore.getState();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}
