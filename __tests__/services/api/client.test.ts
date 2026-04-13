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

const mockAxios = jest.requireMock('axios').default;
const mockCreate = mockAxios.create as jest.Mock;
mockCreate.mockReturnValue(mockAxiosInstance);

import { useAuthStore } from '../../../src/stores/useAuthStore';
import { getApiClient, resetApiClient } from '../../../src/services/api/client';

beforeEach(() => {
  mockInterceptorRequest.use.mockClear();
  mockInterceptorResponse.use.mockClear();
  mockCreate.mockClear();
  mockCreate.mockReturnValue(mockAxiosInstance);
  resetApiClient();
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

    it('returns config unchanged when no credentials', () => {
      useAuthStore.setState({ credentials: null, sessionCookie: null });
      const config = { headers: { set: jest.fn() } };
      const result = requestInterceptor(config);
      expect(result).toBe(config);
      expect(config.headers.set).not.toHaveBeenCalled();
    });

    it('sets basic auth header', () => {
      useAuthStore.setState({
        credentials: {
          serverUrl: 'http://example.com',
          authType: 'basic',
          username: 'user',
          password: 'pass',
        },
        sessionCookie: null,
      });
      const config = { headers: { set: jest.fn() } } as any;
      const result = requestInterceptor(config);
      expect(result.baseURL).toBe('http://example.com');
      expect(config.headers.set).toHaveBeenCalledWith(
        'Authorization',
        expect.stringMatching(/^Basic /)
      );
    });

    it('sets apikey header', () => {
      useAuthStore.setState({
        credentials: {
          serverUrl: 'http://example.com',
          authType: 'apikey',
          apiKey: 'my-key',
        },
        sessionCookie: null,
      });
      const config = { headers: { set: jest.fn() } } as any;
      requestInterceptor(config);
      expect(config.headers.set).toHaveBeenCalledWith('X-API-Key', 'my-key');
    });

    it('does not set auth header when basic creds have no username', () => {
      useAuthStore.setState({
        credentials: {
          serverUrl: 'http://example.com',
          authType: 'basic',
        },
        sessionCookie: null,
      });
      const config = { headers: { set: jest.fn() } } as any;
      requestInterceptor(config);
      expect(config.headers.set).not.toHaveBeenCalledWith('Authorization', expect.anything());
      expect(config.headers.set).not.toHaveBeenCalledWith('X-API-Key', expect.anything());
    });

    it('does not set auth header when apikey creds have no apiKey', () => {
      useAuthStore.setState({
        credentials: {
          serverUrl: 'http://example.com',
          authType: 'apikey',
        },
        sessionCookie: null,
      });
      const config = { headers: { set: jest.fn() } } as any;
      requestInterceptor(config);
      expect(config.headers.set).not.toHaveBeenCalledWith('Authorization', expect.anything());
      expect(config.headers.set).not.toHaveBeenCalledWith('X-API-Key', expect.anything());
    });

    it('sets session cookie when available', () => {
      useAuthStore.setState({
        credentials: {
          serverUrl: 'http://example.com',
          authType: 'basic',
          username: 'user',
          password: 'pass',
        },
        sessionCookie: 'abc123',
      });
      const config = { headers: { set: jest.fn() } } as any;
      requestInterceptor(config);
      expect(config.headers.set).toHaveBeenCalledWith(
        'Cookie',
        'KOMGA-SESSION=abc123'
      );
    });
  });

  describe('response interceptor', () => {
    let responseInterceptor: (response: any) => any;

    beforeEach(() => {
      getApiClient();
      responseInterceptor = mockInterceptorResponse.use.mock.calls[0][0];
    });

    it('captures session cookie from set-cookie header', () => {
      const setSessionCookie = jest.fn();
      useAuthStore.setState({ setSessionCookie } as any);
      const response = {
        headers: { 'set-cookie': 'KOMGA-SESSION=xyz789; Path=/' },
      };
      const result = responseInterceptor(response);
      expect(result).toBe(response);
      expect(setSessionCookie).toHaveBeenCalledWith('xyz789');
    });

    it('does nothing when no set-cookie header', () => {
      const setSessionCookie = jest.fn();
      useAuthStore.setState({ setSessionCookie } as any);
      const response = { headers: {} };
      responseInterceptor(response);
      expect(setSessionCookie).not.toHaveBeenCalled();
    });

    it('does nothing when set-cookie has no KOMGA-SESSION', () => {
      const setSessionCookie = jest.fn();
      useAuthStore.setState({ setSessionCookie } as any);
      const response = {
        headers: { 'set-cookie': 'OTHER=value; Path=/' },
      };
      responseInterceptor(response);
      expect(setSessionCookie).not.toHaveBeenCalled();
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
