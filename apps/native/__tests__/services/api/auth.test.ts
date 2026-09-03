// Mock api/client to prevent axios module side-effects at test boot
// (useSettingsStore imports resetApiClient from api/client → axios fetch adapter).
jest.mock('../../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));

import {
  AuthRequestError,
  checkSession,
  fetchAuthStatus,
  requestLoginCode,
  revokeSession,
  submitLoginCode,
} from '../../../src/services/api/auth';
import { useSettingsStore } from '../../../src/stores/useSettingsStore';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
  useSettingsStore.setState({ shelvarrUrl: 'http://books.local' });
});

describe('fetchAuthStatus', () => {
  it('reports what the server expects of us', async () => {
    const status = { enabled: true, setupRequired: false, allowSignup: true, emailConfigured: true };
    mockFetch.mockResolvedValue(response(200, status));

    await expect(fetchAuthStatus()).resolves.toEqual(status);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://books.local/api/auth/status',
      expect.objectContaining({ headers: { Accept: 'application/json' } })
    );
  });

  it('treats a server without the endpoint as one without accounts', async () => {
    // A Shelvarr predating user accounts 404s here, and behaves exactly as
    // though authentication were switched off.
    mockFetch.mockResolvedValue(response(404, null));

    await expect(fetchAuthStatus()).resolves.toEqual({
      enabled: false,
      setupRequired: false,
      allowSignup: false,
      emailConfigured: false,
    });
  });

  it('trims a trailing slash off the configured URL', async () => {
    useSettingsStore.setState({ shelvarrUrl: 'http://books.local///' });
    mockFetch.mockResolvedValue(response(200, {}));

    await fetchAuthStatus();

    expect(mockFetch.mock.calls[0][0]).toBe('http://books.local/api/auth/status');
  });

  it('complains when no server has been configured', async () => {
    useSettingsStore.setState({ shelvarrUrl: '' });

    await expect(fetchAuthStatus()).rejects.toThrow(AuthRequestError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports an unreachable server rather than leaking the fetch error', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));

    await expect(fetchAuthStatus()).rejects.toThrow('Could not reach the server');
  });

  it('passes on an unexpected server error', async () => {
    mockFetch.mockResolvedValue(response(500, null));

    await expect(fetchAuthStatus()).rejects.toThrow('Server responded with 500');
  });

  it('can be pointed at a server that is not the saved one', async () => {
    mockFetch.mockResolvedValue(response(200, {}));

    await fetchAuthStatus('http://other.local/');

    expect(mockFetch.mock.calls[0][0]).toBe('http://other.local/api/auth/status');
  });
});

describe('requestLoginCode', () => {
  it('asks the server to email a code, naming itself as a native client', async () => {
    mockFetch.mockResolvedValue(
      response(200, { emailSent: true, expiresAt: '2026-01-01T00:10:00.000Z', codeLength: 6 })
    );

    const result = await requestLoginCode('reader@example.com');

    expect(result.codeLength).toBe(6);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://books.local/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'reader@example.com', client: 'native' }),
      })
    );
  });

  it('surfaces the server’s reason for refusing', async () => {
    mockFetch.mockResolvedValue(response(429, { error: 'Too many sign-in emails requested.' }));

    await expect(requestLoginCode('reader@example.com')).rejects.toThrow(
      'Too many sign-in emails requested.'
    );
  });

  it('falls back to the status code when the server explains nothing', async () => {
    mockFetch.mockResolvedValue(response(500, {}));

    await expect(requestLoginCode('reader@example.com')).rejects.toThrow(
      'Server responded with 500'
    );
  });

  it('rejects an empty body it cannot act on', async () => {
    mockFetch.mockResolvedValue(response(200, null));

    await expect(requestLoginCode('reader@example.com')).rejects.toThrow(
      'Unexpected response from the server'
    );
  });

  it('needs a server to talk to', async () => {
    useSettingsStore.setState({ shelvarrUrl: '' });

    await expect(requestLoginCode('reader@example.com')).rejects.toThrow(
      'Server URL not configured'
    );
  });

  it('reports an unreachable server', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));

    await expect(requestLoginCode('reader@example.com')).rejects.toThrow(
      'Could not reach the server'
    );
  });
});

describe('submitLoginCode', () => {
  it('sends the address alongside the code, and a name for the session', async () => {
    const user = { id: 1, email: 'r@e.com', name: null, role: 'user', createdAt: '', lastLoginAt: null };
    mockFetch.mockResolvedValue(
      response(200, { token: 'fresh', expiresAt: '2027-01-01T00:00:00.000Z', user })
    );

    await expect(
      submitLoginCode('reader@example.com', 'ABC234', 'Stackarr on Android')
    ).resolves.toMatchObject({ token: 'fresh' });

    expect(mockFetch.mock.calls[0][0]).toBe('http://books.local/api/auth/verify');
    expect(mockFetch.mock.calls[0][1].body).toBe(
      JSON.stringify({
        email: 'reader@example.com',
        code: 'ABC234',
        client: 'native',
        label: 'Stackarr on Android',
      })
    );
  });

  it('passes on the server’s complaint about a wrong code', async () => {
    mockFetch.mockResolvedValue(
      response(401, { error: 'That code is not right, or it has expired. Ask for a new one.' })
    );

    await expect(submitLoginCode('reader@example.com', 'ZZZZZZ', 'Phone')).rejects.toThrow(
      /not right/
    );
  });
});

describe('checkSession', () => {
  it('confirms a token the server still accepts', async () => {
    const user = { id: 1, email: 'r@e.com', name: null, role: 'user', createdAt: '', lastLoginAt: null };
    mockFetch.mockResolvedValue(response(200, { user }));

    await expect(checkSession('token')).resolves.toEqual({ state: 'valid', user });
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer token');
  });

  it('reports a refused token distinctly from an unreachable server', async () => {
    // The difference matters: only a refusal should sign someone out.
    mockFetch.mockResolvedValue(response(401, {}));
    await expect(checkSession('token')).resolves.toEqual({ state: 'rejected' });

    mockFetch.mockRejectedValue(new TypeError('Network request failed'));
    await expect(checkSession('token')).resolves.toEqual({ state: 'unreachable' });
  });

  it('treats a server error as unreachable rather than as a refusal', async () => {
    mockFetch.mockResolvedValue(response(503, {}));

    await expect(checkSession('token')).resolves.toEqual({ state: 'unreachable' });
  });

  it('copes with a valid response that names no user', async () => {
    mockFetch.mockResolvedValue(response(200, {}));

    await expect(checkSession('token')).resolves.toEqual({ state: 'valid', user: null });
  });

  it('is unreachable when no server is configured', async () => {
    useSettingsStore.setState({ shelvarrUrl: '' });

    await expect(checkSession('token')).resolves.toEqual({ state: 'unreachable' });
  });
});

describe('revokeSession', () => {
  it('ends the session on the server', async () => {
    mockFetch.mockResolvedValue(response(200, { ok: true }));

    await revokeSession('token');

    expect(mockFetch).toHaveBeenCalledWith('http://books.local/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
    });
  });

  it('does not throw when the server cannot be reached', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));

    await expect(revokeSession('token')).resolves.toBeUndefined();
  });

  it('does nothing without a server', async () => {
    useSettingsStore.setState({ shelvarrUrl: '' });

    await revokeSession('token');

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
