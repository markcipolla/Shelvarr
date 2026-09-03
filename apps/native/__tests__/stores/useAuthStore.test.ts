// Mock api/client to prevent axios module side-effects at test boot
// (useSettingsStore imports resetApiClient from api/client → axios fetch adapter).
jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));

import type { AuthStatus, User } from '@shelvarr/types';
import { useAuthStore, getAuthHeaders } from '../../src/stores/useAuthStore';
import { useSettingsStore } from '../../src/stores/useSettingsStore';
import * as authApi from '../../src/services/api/auth';
import * as SecureStore from 'expo-secure-store';
import { _reset } from '../../__mocks__/expo-secure-store';

jest.mock('../../src/services/api/auth');

const mockedApi = authApi as jest.Mocked<typeof authApi>;
const initialState = useAuthStore.getState();

const USER: User = {
  id: 1,
  email: 'reader@example.com',
  name: 'Reader',
  role: 'user',
  createdAt: '2026-01-01 00:00:00',
  lastLoginAt: null,
};

function status(overrides: Partial<AuthStatus> = {}): AuthStatus {
  return {
    enabled: true,
    setupRequired: false,
    allowSignup: false,
    emailConfigured: true,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  _reset();
  useAuthStore.setState(initialState);
  useSettingsStore.setState({ shelvarrUrl: 'http://books.local' });
});

describe('useAuthStore', () => {
  describe('loadAuth', () => {
    it('restores a stored token and confirms it with the server', async () => {
      await SecureStore.setItemAsync('auth_sessionToken', 'stored-token');
      await SecureStore.setItemAsync('auth_user', JSON.stringify(USER));
      mockedApi.fetchAuthStatus.mockResolvedValue(status());
      mockedApi.checkSession.mockResolvedValue({ state: 'valid', user: USER });

      await useAuthStore.getState().loadAuth();

      expect(mockedApi.checkSession).toHaveBeenCalledWith('stored-token');
      expect(useAuthStore.getState().state).toBe('signed-in');
      expect(useAuthStore.getState().user).toEqual(USER);
    });

    it('ignores a corrupted stored user rather than failing to start', async () => {
      await SecureStore.setItemAsync('auth_sessionToken', 'stored-token');
      await SecureStore.setItemAsync('auth_user', 'not json');
      mockedApi.fetchAuthStatus.mockResolvedValue(status());
      mockedApi.checkSession.mockResolvedValue({ state: 'valid', user: USER });

      await useAuthStore.getState().loadAuth();

      expect(useAuthStore.getState().state).toBe('signed-in');
    });

    it('lands signed out when nothing is stored', async () => {
      mockedApi.fetchAuthStatus.mockResolvedValue(status());

      await useAuthStore.getState().loadAuth();

      expect(useAuthStore.getState().state).toBe('signed-out');
      expect(mockedApi.checkSession).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('lets everything through against a server without accounts', async () => {
      mockedApi.fetchAuthStatus.mockResolvedValue(status({ enabled: false }));

      await useAuthStore.getState().refresh();

      expect(useAuthStore.getState().state).toBe('disabled');
      expect(mockedApi.checkSession).not.toHaveBeenCalled();
    });

    it('signs out when the server says the token is no good', async () => {
      useAuthStore.setState({ token: 'stale', user: USER });
      await SecureStore.setItemAsync('auth_sessionToken', 'stale');
      mockedApi.fetchAuthStatus.mockResolvedValue(status());
      mockedApi.checkSession.mockResolvedValue({ state: 'rejected' });

      await useAuthStore.getState().refresh();

      expect(useAuthStore.getState().state).toBe('signed-out');
      expect(useAuthStore.getState().token).toBeNull();
      expect(await SecureStore.getItemAsync('auth_sessionToken')).toBeNull();
    });

    it('keeps a downloaded library readable when the server cannot be reached', async () => {
      useAuthStore.setState({ token: 'good-token', user: USER });
      mockedApi.fetchAuthStatus.mockRejectedValue(new Error('offline'));

      await useAuthStore.getState().refresh();

      expect(useAuthStore.getState().state).toBe('signed-in');
      expect(useAuthStore.getState().token).toBe('good-token');
    });

    it('asks for a sign-in when offline with no token', async () => {
      mockedApi.fetchAuthStatus.mockRejectedValue(new Error('offline'));

      await useAuthStore.getState().refresh();

      expect(useAuthStore.getState().state).toBe('signed-out');
    });

    it('stays signed in when the session check itself cannot reach the server', async () => {
      useAuthStore.setState({ token: 'good-token', user: USER });
      mockedApi.fetchAuthStatus.mockResolvedValue(status());
      mockedApi.checkSession.mockResolvedValue({ state: 'unreachable' });

      await useAuthStore.getState().refresh();

      expect(useAuthStore.getState().state).toBe('signed-in');
    });
  });

  describe('beginLogin', () => {
    it('remembers the pending request so the code screen can open', async () => {
      mockedApi.requestLoginCode.mockResolvedValue({
        emailSent: true,
        expiresAt: '2026-01-01T00:10:00.000Z',
        codeLength: 6,
      });

      const started = await useAuthStore.getState().beginLogin('  reader@example.com  ');

      expect(started).toBe(true);
      expect(mockedApi.requestLoginCode).toHaveBeenCalledWith('reader@example.com');
      expect(useAuthStore.getState().pending).toMatchObject({
        email: 'reader@example.com',
        emailSent: true,
        codeLength: 6,
      });
      expect(useAuthStore.getState().busy).toBe(false);
    });

    it('opens the code screen for an unknown address too, revealing nothing', async () => {
      mockedApi.requestLoginCode.mockResolvedValue({
        emailSent: false,
        expiresAt: '2026-01-01T00:10:00.000Z',
        codeLength: 6,
        message: 'If that address has an account, a sign-in code is on its way.',
      });

      const started = await useAuthStore.getState().beginLogin('stranger@example.com');

      expect(started).toBe(true);
      expect(useAuthStore.getState().pending).not.toBeNull();
      expect(useAuthStore.getState().error).toBeNull();
    });

    it('falls back to six boxes if the server does not say how many', async () => {
      mockedApi.requestLoginCode.mockResolvedValue({
        emailSent: true,
        expiresAt: '2026-01-01T00:10:00.000Z',
      } as never);

      await useAuthStore.getState().beginLogin('reader@example.com');

      expect(useAuthStore.getState().pending?.codeLength).toBe(6);
    });

    it('surfaces a request failure and stops being busy', async () => {
      mockedApi.requestLoginCode.mockRejectedValue(new Error('Could not reach the server'));

      const started = await useAuthStore.getState().beginLogin('reader@example.com');

      expect(started).toBe(false);
      expect(useAuthStore.getState().busy).toBe(false);
      expect(useAuthStore.getState().error).toBe('Could not reach the server');
    });

    it('still says something when what was thrown is not an error', async () => {
      mockedApi.requestLoginCode.mockRejectedValue('nope');

      await useAuthStore.getState().beginLogin('reader@example.com');

      expect(useAuthStore.getState().error).toBe('Something went wrong');
    });
  });

  describe('submitCode', () => {
    beforeEach(() => {
      useAuthStore.setState({
        pending: {
          email: 'reader@example.com',
          emailSent: true,
          codeLength: 6,
        },
      });
    });

    it('stores the session the code buys', async () => {
      mockedApi.submitLoginCode.mockResolvedValue({
        token: 'fresh-token',
        expiresAt: '2027-01-01T00:00:00.000Z',
        user: USER,
      });

      await expect(useAuthStore.getState().submitCode('ABC234')).resolves.toBe(true);

      expect(mockedApi.submitLoginCode).toHaveBeenCalledWith(
        'reader@example.com',
        'ABC234',
        expect.stringContaining('Stackarr')
      );
      expect(useAuthStore.getState().state).toBe('signed-in');
      expect(useAuthStore.getState().pending).toBeNull();
      expect(await SecureStore.getItemAsync('auth_sessionToken')).toBe('fresh-token');
      expect(await SecureStore.getItemAsync('auth_user')).toBe(JSON.stringify(USER));
    });

    it('keeps the pending login alive so a wrong code can be retyped', async () => {
      mockedApi.submitLoginCode.mockRejectedValue(
        new Error('That code is not right, or it has expired. Ask for a new one.')
      );

      await expect(useAuthStore.getState().submitCode('ZZZZZZ')).resolves.toBe(false);

      expect(useAuthStore.getState().pending).not.toBeNull();
      expect(useAuthStore.getState().busy).toBe(false);
      expect(useAuthStore.getState().error).toMatch(/not right/i);
    });

    it('does nothing when there is no request in flight', async () => {
      useAuthStore.setState({ pending: null });

      await expect(useAuthStore.getState().submitCode('ABC234')).resolves.toBe(false);
      expect(mockedApi.submitLoginCode).not.toHaveBeenCalled();
    });
  });

  describe('cancelLogin', () => {
    it('goes back to the email step', () => {
      useAuthStore.setState({
        pending: { email: 'r@e.com', emailSent: true, codeLength: 6 },
        error: 'that code was wrong',
      });

      useAuthStore.getState().cancelLogin();

      expect(useAuthStore.getState().pending).toBeNull();
      expect(useAuthStore.getState().error).toBeNull();
    });

    it('is harmless with nothing pending', () => {
      useAuthStore.getState().cancelLogin();
      expect(useAuthStore.getState().pending).toBeNull();
    });
  });

  describe('signOut', () => {
    it('ends the session on the server and forgets it here', async () => {
      useAuthStore.setState({ state: 'signed-in', token: 'live-token', user: USER });
      await SecureStore.setItemAsync('auth_sessionToken', 'live-token');
      await SecureStore.setItemAsync('auth_user', JSON.stringify(USER));

      await useAuthStore.getState().signOut();

      expect(mockedApi.revokeSession).toHaveBeenCalledWith('live-token');
      expect(useAuthStore.getState().state).toBe('signed-out');
      expect(await SecureStore.getItemAsync('auth_sessionToken')).toBeNull();
      expect(await SecureStore.getItemAsync('auth_user')).toBeNull();
    });

    it('still clears local state with no token to revoke', async () => {
      useAuthStore.setState({ state: 'signed-in', token: null });

      await useAuthStore.getState().signOut();

      expect(mockedApi.revokeSession).not.toHaveBeenCalled();
      expect(useAuthStore.getState().state).toBe('signed-out');
    });
  });

  describe('handleUnauthorized', () => {
    it('drops a token the server has refused', () => {
      useAuthStore.setState({ state: 'signed-in', token: 'stale', user: USER });

      useAuthStore.getState().handleUnauthorized();

      expect(useAuthStore.getState().state).toBe('signed-out');
      expect(useAuthStore.getState().token).toBeNull();
    });

    it('leaves a server without accounts alone', () => {
      useAuthStore.setState({ state: 'disabled', token: null });

      useAuthStore.getState().handleUnauthorized();

      expect(useAuthStore.getState().state).toBe('disabled');
    });
  });

  describe('clearError', () => {
    it('dismisses the last message', () => {
      useAuthStore.setState({ error: 'something went wrong' });
      useAuthStore.getState().clearError();
      expect(useAuthStore.getState().error).toBeNull();
    });
  });

  describe('getAuthHeaders', () => {
    it('returns nothing when signed out', () => {
      expect(getAuthHeaders()).toEqual({});
    });

    it('carries the token for downloads and image requests', () => {
      useAuthStore.setState({ token: 'abc' });
      expect(getAuthHeaders()).toEqual({ Authorization: 'Bearer abc' });
    });
  });
});
