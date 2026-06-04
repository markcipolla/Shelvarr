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
import { getApiClient, resetApiClient } from '../../../src/services/api/client';

const mockGetState = useSettingsStore.getState as jest.Mock;

beforeEach(() => {
  mockInterceptorRequest.use.mockClear();
  mockInterceptorResponse.use.mockClear();
  mockCreate.mockClear();
  mockCreate.mockReturnValue(mockAxiosInstance);
  mockGetState.mockReturnValue({ shelvarrUrl: '' });
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

  it('registers a request interceptor', () => {
    getApiClient();
    expect(mockInterceptorRequest.use).toHaveBeenCalledTimes(1);
  });

  describe('request interceptor', () => {
    let requestInterceptor: (config: any) => any;

    beforeEach(() => {
      getApiClient();
      requestInterceptor = mockInterceptorRequest.use.mock.calls[0][0];
    });

    it('leaves baseURL unset when no shelvarrUrl is configured', () => {
      mockGetState.mockReturnValue({ shelvarrUrl: '' });
      const config = { headers: {} } as any;
      const result = requestInterceptor(config);
      expect(result).toBe(config);
      expect(result.baseURL).toBeUndefined();
    });

    it('sets baseURL from settings store', () => {
      mockGetState.mockReturnValue({ shelvarrUrl: 'http://example.com' });
      const config = { headers: {} } as any;
      const result = requestInterceptor(config);
      expect(result.baseURL).toBe('http://example.com');
    });

    it('does not set any auth headers', () => {
      mockGetState.mockReturnValue({ shelvarrUrl: 'http://example.com' });
      const config = { headers: {} } as any;
      const result = requestInterceptor(config);
      expect(result.headers).toEqual({});
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
