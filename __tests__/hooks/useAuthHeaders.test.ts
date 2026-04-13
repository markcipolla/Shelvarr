import { renderHook } from '@testing-library/react-native';
import { useAuthHeaders } from '../../src/hooks/useAuthHeaders';
import { useAuthStore } from '../../src/stores/useAuthStore';

jest.mock('../../src/stores/useAuthStore');

const mockUseAuthStore = useAuthStore as unknown as jest.Mock;

describe('useAuthHeaders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty headers when credentials are null', () => {
    mockUseAuthStore.mockImplementation((selector: any) => {
      const state = { credentials: null, sessionCookie: null };
      return selector(state);
    });

    const { result } = renderHook(() => useAuthHeaders());
    expect(result.current).toEqual({});
  });

  it('returns basic auth header when authType is basic', () => {
    mockUseAuthStore.mockImplementation((selector: any) => {
      const state = {
        credentials: {
          serverUrl: 'http://localhost',
          authType: 'basic',
          username: 'user',
          password: 'pass',
        },
        sessionCookie: null,
      };
      return selector(state);
    });

    const { result } = renderHook(() => useAuthHeaders());
    expect(result.current).toHaveProperty('Authorization');
    expect(result.current.Authorization).toMatch(/^Basic /);
  });

  it('returns api key header when authType is apikey', () => {
    mockUseAuthStore.mockImplementation((selector: any) => {
      const state = {
        credentials: {
          serverUrl: 'http://localhost',
          authType: 'apikey',
          apiKey: 'my-key',
        },
        sessionCookie: null,
      };
      return selector(state);
    });

    const { result } = renderHook(() => useAuthHeaders());
    expect(result.current).toEqual({ 'X-API-Key': 'my-key' });
  });

  it('includes session cookie when present', () => {
    mockUseAuthStore.mockImplementation((selector: any) => {
      const state = {
        credentials: {
          serverUrl: 'http://localhost',
          authType: 'basic',
          username: 'user',
          password: 'pass',
        },
        sessionCookie: 'abc123',
      };
      return selector(state);
    });

    const { result } = renderHook(() => useAuthHeaders());
    expect(result.current.Cookie).toBe('KOMGA-SESSION=abc123');
    expect(result.current.Authorization).toMatch(/^Basic /);
  });

  it('returns no auth header for basic type with missing username', () => {
    mockUseAuthStore.mockImplementation((selector: any) => {
      const state = {
        credentials: {
          serverUrl: 'http://localhost',
          authType: 'basic',
          username: '',
          password: 'pass',
        },
        sessionCookie: null,
      };
      return selector(state);
    });

    const { result } = renderHook(() => useAuthHeaders());
    expect(result.current).toEqual({});
  });

  it('returns no auth header for apikey type with missing apiKey', () => {
    mockUseAuthStore.mockImplementation((selector: any) => {
      const state = {
        credentials: {
          serverUrl: 'http://localhost',
          authType: 'apikey',
          apiKey: '',
        },
        sessionCookie: null,
      };
      return selector(state);
    });

    const { result } = renderHook(() => useAuthHeaders());
    expect(result.current).toEqual({});
  });
});
