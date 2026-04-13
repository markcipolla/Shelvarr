import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { AuthCredentials } from '../types/komga';
import { SECURE_STORE_KEYS } from '../utils/constants';

interface AuthState {
  credentials: AuthCredentials | null;
  sessionCookie: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  loadCredentials: () => Promise<void>;
  login: (creds: AuthCredentials) => Promise<void>;
  setSessionCookie: (cookie: string) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  credentials: null,
  sessionCookie: null,
  isLoading: true,
  isAuthenticated: false,

  loadCredentials: async () => {
    try {
      const serverUrl = await SecureStore.getItemAsync(SECURE_STORE_KEYS.SERVER_URL);
      const authType = await SecureStore.getItemAsync(SECURE_STORE_KEYS.AUTH_TYPE) as 'basic' | 'apikey' | null;
      const sessionCookie = await SecureStore.getItemAsync(SECURE_STORE_KEYS.SESSION_COOKIE);

      if (!serverUrl || !authType) {
        set({ isLoading: false });
        return;
      }

      const creds: AuthCredentials = { serverUrl, authType };

      if (authType === 'basic') {
        creds.username = await SecureStore.getItemAsync(SECURE_STORE_KEYS.USERNAME) || undefined;
        creds.password = await SecureStore.getItemAsync(SECURE_STORE_KEYS.PASSWORD) || undefined;
      } else {
        creds.apiKey = await SecureStore.getItemAsync(SECURE_STORE_KEYS.API_KEY) || undefined;
      }

      set({
        credentials: creds,
        sessionCookie,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  login: async (creds: AuthCredentials) => {
    const url = creds.serverUrl.replace(/\/+$/, '');
    await SecureStore.setItemAsync(SECURE_STORE_KEYS.SERVER_URL, url);
    await SecureStore.setItemAsync(SECURE_STORE_KEYS.AUTH_TYPE, creds.authType);

    if (creds.authType === 'basic') {
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.USERNAME, creds.username || '');
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.PASSWORD, creds.password || '');
    } else {
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.API_KEY, creds.apiKey || '');
    }

    set({
      credentials: { ...creds, serverUrl: url },
      isAuthenticated: true,
    });
  },

  setSessionCookie: (cookie: string) => {
    SecureStore.setItemAsync(SECURE_STORE_KEYS.SESSION_COOKIE, cookie);
    set({ sessionCookie: cookie });
  },

  logout: async () => {
    await Promise.all(
      Object.values(SECURE_STORE_KEYS).map((key) => SecureStore.deleteItemAsync(key))
    );
    set({
      credentials: null,
      sessionCookie: null,
      isAuthenticated: false,
    });
  },
}));
