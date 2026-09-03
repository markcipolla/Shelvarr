import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { AuthStatus, User } from '@shelvarr/types';
import {
  AuthRequestError,
  checkSession,
  fetchAuthStatus,
  requestLoginCode,
  revokeSession,
  submitLoginCode,
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

/** A code has been sent, and we are waiting for it to be typed in. */
export interface PendingLogin {
  email: string;
  emailSent: boolean;
  /** How many characters to ask for; the server decides. */
  codeLength: number;
  message?: string;
}

interface AuthStore {
  state: AuthState;
  token: string | null;
  user: User | null;
  serverStatus: AuthStatus | null;
  pending: PendingLogin | null;
  error: string | null;
  /** True while a sign-in request is in flight. */
  busy: boolean;

  loadAuth: () => Promise<void>;
  refresh: () => Promise<void>;
  beginLogin: (email: string) => Promise<boolean>;
  submitCode: (code: string) => Promise<boolean>;
  cancelLogin: () => void;
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

  /** Ask the server to email a one-time code. */
  beginLogin: async (email: string) => {
    set({ busy: true, error: null });
    try {
      const result = await requestLoginCode(email.trim());
      set({
        busy: false,
        pending: {
          email: email.trim(),
          emailSent: result.emailSent,
          codeLength: result.codeLength ?? 6,
          message: result.message,
        },
      });
      return true;
    } catch (error) {
      set({ busy: false, error: describe(error) });
      return false;
    }
  },

  /**
   * Redeem the code that was typed in.
   *
   * A wrong code leaves the pending login in place so it can be retyped; only
   * the server counts the guesses, and it retires the code once there have
   * been too many.
   */
  submitCode: async (code: string) => {
    const { pending } = get();
    if (!pending) return false;

    set({ busy: true, error: null });
    try {
      const result = await submitLoginCode(pending.email, code, deviceLabel());
      await persist(result.token, result.user);
      set({
        state: 'signed-in',
        token: result.token,
        user: result.user,
        pending: null,
        busy: false,
        error: null,
      });
      return true;
    } catch (error) {
      set({ busy: false, error: describe(error) });
      return false;
    }
  },

  /** Give up and go back to the email step. Nothing to tell the server. */
  cancelLogin: () => set({ pending: null, error: null }),

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
