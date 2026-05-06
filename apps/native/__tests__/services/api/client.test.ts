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

import { useSettingsStore } from '../../../src/stores/useSettingsStore';
import { useConnectivityStore } from '../../../src/stores/useConnectivityStore';
import { getApiClient, resetApiClient } from '../../../src/services/api/client';

beforeEach(() => {
  mockInterceptorRequest.use.mockClear();
  mockInterceptorResponse.use.mockClear();
  mockCreate.mockClear();
  mockCreate.mockReturnValue(mockAxiosInstance);
  resetApiClient();
  useConnectivityStore.setState({ online: true });
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

    it('sets baseURL from settings store', () => {
      useSettingsStore.setState({ shelvarrUrl: 'http://example.com' });
      const config: any = { headers: {} };
      const result = requestInterceptor(config);
      expect(result.baseURL).toBe('http://example.com');
    });

    it('leaves baseURL unset when no shelvarrUrl configured', () => {
      useSettingsStore.setState({ shelvarrUrl: '' });
      const config: any = { headers: {} };
      const result = requestInterceptor(config);
      expect(result.baseURL).toBeUndefined();
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
