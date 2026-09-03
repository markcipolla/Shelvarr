const mockInterceptorRequest = { use: jest.fn() };
const mockInterceptorResponse = { use: jest.fn() };
const mockAxiosInstance = {
  interceptors: {
    request: mockInterceptorRequest,
    response: mockInterceptorResponse,
  },
};

jest.mock('axios', () => ({
  __esModule: true,
  default: { create: jest.fn() },
}));

jest.mock('../../../src/stores/useSettingsStore', () => ({
  useSettingsStore: {
    getState: jest.fn().mockReturnValue({ shelvarrUrl: '' }),
  },
}));

const mockAxios = jest.requireMock('axios').default;
const mockCreate = mockAxios.create as jest.Mock;
mockCreate.mockReturnValue(mockAxiosInstance);

import { useSettingsStore } from '../../../src/stores/useSettingsStore';
import { useConnectivityStore } from '../../../src/stores/useConnectivityStore';
import { useAuthStore } from '../../../src/stores/useAuthStore';
import { getApiClient, resetApiClient } from '../../../src/services/api/client';

const mockGetState = useSettingsStore.getState as jest.Mock;
const initialAuthState = useAuthStore.getState();

/** Stand-in for axios's header bag, which is a class with `set`, not a plain object. */
function makeConfig() {
  const values: Record<string, string> = {};
  return {
    headers: {
      set: (name: string, value: string) => {
        values[name] = value;
      },
      values,
    },
  } as any;
}

beforeEach(() => {
  mockInterceptorRequest.use.mockClear();
  mockInterceptorResponse.use.mockClear();
  mockCreate.mockClear();
  mockCreate.mockReturnValue(mockAxiosInstance);
  mockGetState.mockReturnValue({ shelvarrUrl: '' });
  resetApiClient();
  useConnectivityStore.setState({ online: true });
  useAuthStore.setState(initialAuthState);
});

describe('getApiClient', () => {
  it('creates an axios instance with correct defaults', () => {
    getApiClient();
    expect(mockCreate).toHaveBeenCalledWith({
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('returns the same instance on subsequent calls', () => {
    const first = getApiClient();
    const second = getApiClient();
    expect(first).toBe(second);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('registers request and response interceptors', () => {
    getApiClient();
    expect(mockInterceptorRequest.use).toHaveBeenCalledTimes(1);
    expect(mockInterceptorResponse.use).toHaveBeenCalledTimes(1);
  });

  describe('request interceptor', () => {
    let requestInterceptor: (config: any) => any;

    beforeEach(() => {
      getApiClient();
      requestInterceptor = mockInterceptorRequest.use.mock.calls[0][0];
    });

    it('leaves baseURL unset when no shelvarrUrl is configured', () => {
      mockGetState.mockReturnValue({ shelvarrUrl: '' });
      const config = makeConfig();
      const result = requestInterceptor(config);
      expect(result).toBe(config);
      expect(result.baseURL).toBeUndefined();
    });

    it('sets baseURL from settings store', () => {
      mockGetState.mockReturnValue({ shelvarrUrl: 'http://example.com' });
      const result = requestInterceptor(makeConfig());
      expect(result.baseURL).toBe('http://example.com');
    });

    it('sends no Authorization header when signed out', () => {
      mockGetState.mockReturnValue({ shelvarrUrl: 'http://example.com' });
      const result = requestInterceptor(makeConfig());
      expect(result.headers.values).toEqual({});
    });

    it('attaches the session token as a bearer header', () => {
      mockGetState.mockReturnValue({ shelvarrUrl: 'http://example.com' });
      useAuthStore.setState({ token: 'session-abc' });

      const result = requestInterceptor(makeConfig());

      expect(result.headers.values).toEqual({ Authorization: 'Bearer session-abc' });
    });

    it('reads the token per request, so signing in needs no client reset', () => {
      mockGetState.mockReturnValue({ shelvarrUrl: 'http://example.com' });

      expect(requestInterceptor(makeConfig()).headers.values).toEqual({});
      useAuthStore.setState({ token: 'later-token' });
      expect(requestInterceptor(makeConfig()).headers.values).toEqual({
        Authorization: 'Bearer later-token',
      });
    });
  });

  describe('response interceptor', () => {
    let onSuccess: (response: any) => any;
    let onError: (err: any) => any;

    beforeEach(() => {
      getApiClient();
      onSuccess = mockInterceptorResponse.use.mock.calls[0][0];
      onError = mockInterceptorResponse.use.mock.calls[0][1];
    });

    it('marks connectivity online on a successful response', () => {
      useConnectivityStore.setState({ online: false });
      const response = { data: {} };
      expect(onSuccess(response)).toBe(response);
      expect(useConnectivityStore.getState().online).toBe(true);
    });

    it('marks connectivity offline on a network error (no response)', async () => {
      const err: any = { message: 'Network Error' };
      await expect(onError(err)).rejects.toBe(err);
      expect(useConnectivityStore.getState().online).toBe(false);
    });

    it('keeps connectivity online on an HTTP error response', async () => {
      const err: any = { response: { status: 500 } };
      await expect(onError(err)).rejects.toBe(err);
      expect(useConnectivityStore.getState().online).toBe(true);
    });

    it('signs out when the server rejects the token', async () => {
      useAuthStore.setState({ state: 'signed-in', token: 'stale-token' });

      const err: any = { response: { status: 401 } };
      await expect(onError(err)).rejects.toBe(err);

      expect(useAuthStore.getState().state).toBe('signed-out');
      expect(useAuthStore.getState().token).toBeNull();
    });

    it('leaves a 403 alone — that is a permission problem, not a dead session', async () => {
      useAuthStore.setState({ state: 'signed-in', token: 'good-token' });

      const err: any = { response: { status: 403 } };
      await expect(onError(err)).rejects.toBe(err);

      expect(useAuthStore.getState().state).toBe('signed-in');
      expect(useAuthStore.getState().token).toBe('good-token');
    });
  });
});

describe('resetApiClient', () => {
  it('causes next getApiClient call to create a new instance', () => {
    getApiClient();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    resetApiClient();
    getApiClient();
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});
