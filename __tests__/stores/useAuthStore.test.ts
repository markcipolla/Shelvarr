import { useAuthStore } from '../../src/stores/useAuthStore';
import * as SecureStore from 'expo-secure-store';
import { _reset } from 'expo-secure-store';
import { SECURE_STORE_KEYS } from '../../src/utils/constants';

const initialState = useAuthStore.getState();

beforeEach(() => {
  _reset();
  useAuthStore.setState(initialState);
});

describe('useAuthStore', () => {
  describe('loadCredentials', () => {
    it('sets isLoading false when serverUrl is missing', async () => {
      await useAuthStore.getState().loadCredentials();
      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.isAuthenticated).toBe(false);
      expect(state.credentials).toBeNull();
    });

    it('sets isLoading false when authType is missing', async () => {
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.SERVER_URL, 'http://example.com');
      await useAuthStore.getState().loadCredentials();
      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.isAuthenticated).toBe(false);
    });

    it('loads basic auth credentials', async () => {
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.SERVER_URL, 'http://example.com');
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.AUTH_TYPE, 'basic');
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.USERNAME, 'user');
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.PASSWORD, 'pass');
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.SESSION_COOKIE, 'sess123');

      await useAuthStore.getState().loadCredentials();
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.sessionCookie).toBe('sess123');
      expect(state.credentials).toEqual({
        serverUrl: 'http://example.com',
        authType: 'basic',
        username: 'user',
        password: 'pass',
      });
    });

    it('loads apikey auth credentials', async () => {
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.SERVER_URL, 'http://example.com');
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.AUTH_TYPE, 'apikey');
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.API_KEY, 'key123');

      await useAuthStore.getState().loadCredentials();
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.credentials).toEqual({
        serverUrl: 'http://example.com',
        authType: 'apikey',
        apiKey: 'key123',
      });
    });

    it('handles basic auth with empty username/password', async () => {
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.SERVER_URL, 'http://example.com');
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.AUTH_TYPE, 'basic');
      // no username or password stored

      await useAuthStore.getState().loadCredentials();
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.credentials).toEqual({
        serverUrl: 'http://example.com',
        authType: 'basic',
        username: undefined,
        password: undefined,
      });
    });

    it('handles apikey auth with empty apiKey', async () => {
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.SERVER_URL, 'http://example.com');
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.AUTH_TYPE, 'apikey');
      // no api key stored

      await useAuthStore.getState().loadCredentials();
      const state = useAuthStore.getState();
      expect(state.credentials).toEqual({
        serverUrl: 'http://example.com',
        authType: 'apikey',
        apiKey: undefined,
      });
    });

    it('sets isLoading false on error', async () => {
      jest.spyOn(SecureStore, 'getItemAsync').mockRejectedValueOnce(new Error('fail'));
      await useAuthStore.getState().loadCredentials();
      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      jest.restoreAllMocks();
    });
  });

  describe('login', () => {
    it('stores basic auth credentials and trims trailing slashes', async () => {
      await useAuthStore.getState().login({
        serverUrl: 'http://example.com///',
        authType: 'basic',
        username: 'user',
        password: 'pass',
      });

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.credentials!.serverUrl).toBe('http://example.com');

      expect(await SecureStore.getItemAsync(SECURE_STORE_KEYS.SERVER_URL)).toBe('http://example.com');
      expect(await SecureStore.getItemAsync(SECURE_STORE_KEYS.AUTH_TYPE)).toBe('basic');
      expect(await SecureStore.getItemAsync(SECURE_STORE_KEYS.USERNAME)).toBe('user');
      expect(await SecureStore.getItemAsync(SECURE_STORE_KEYS.PASSWORD)).toBe('pass');
    });

    it('stores apikey auth credentials', async () => {
      await useAuthStore.getState().login({
        serverUrl: 'http://example.com',
        authType: 'apikey',
        apiKey: 'key123',
      });

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(await SecureStore.getItemAsync(SECURE_STORE_KEYS.API_KEY)).toBe('key123');
    });

    it('stores empty string when username/password missing for basic', async () => {
      await useAuthStore.getState().login({
        serverUrl: 'http://example.com',
        authType: 'basic',
      });

      expect(await SecureStore.getItemAsync(SECURE_STORE_KEYS.USERNAME)).toBe('');
      expect(await SecureStore.getItemAsync(SECURE_STORE_KEYS.PASSWORD)).toBe('');
    });

    it('stores empty string when apiKey missing for apikey', async () => {
      await useAuthStore.getState().login({
        serverUrl: 'http://example.com',
        authType: 'apikey',
      });

      expect(await SecureStore.getItemAsync(SECURE_STORE_KEYS.API_KEY)).toBe('');
    });
  });

  describe('setSessionCookie', () => {
    it('sets session cookie in state and SecureStore', async () => {
      useAuthStore.getState().setSessionCookie('cookie123');
      expect(useAuthStore.getState().sessionCookie).toBe('cookie123');
      // Wait for the async setItemAsync to complete
      await new Promise((r) => setTimeout(r, 0));
      expect(await SecureStore.getItemAsync(SECURE_STORE_KEYS.SESSION_COOKIE)).toBe('cookie123');
    });
  });

  describe('logout', () => {
    it('clears all credentials from state and SecureStore', async () => {
      // First login
      await useAuthStore.getState().login({
        serverUrl: 'http://example.com',
        authType: 'basic',
        username: 'user',
        password: 'pass',
      });
      useAuthStore.getState().setSessionCookie('sess');

      await useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.credentials).toBeNull();
      expect(state.sessionCookie).toBeNull();
      expect(state.isAuthenticated).toBe(false);

      for (const key of Object.values(SECURE_STORE_KEYS)) {
        expect(await SecureStore.getItemAsync(key)).toBeNull();
      }
    });
  });
});
