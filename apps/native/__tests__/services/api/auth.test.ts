// Mock api/client to prevent axios module side-effects at test boot
// (useSettingsStore imports resetApiClient from api/client → axios fetch adapter).
jest.mock('../../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));

import {
  AuthRequestError,
  cancelDeviceLogin,
  checkSession,
  fetchAuthStatus,
  pollDeviceLogin,
  revokeSession,
  startDeviceLogin,
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

describe('startDeviceLogin', () => {
  it('asks the server to email a link for this device', async () => {
    mockFetch.mockResolvedValue(
      response(200, { deviceCode: 'device-1', userCode: 'ABC-DEF', emailSent: true })
    );

    const result = await startDeviceLogin('reader@example.com');

    expect(result.deviceCode).toBe('device-1');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://books.local/api/auth/device/start',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'reader@example.com' }),
      })
    );
  });

  it('accepts the 202 the server gives an unknown address', async () => {
    // 202 is deliberately not an error: the server will not say whether the
    // address exists, and neither should this.
    mockFetch.mockResolvedValue(response(202, { deviceCode: null, emailSent: false }));

    await expect(startDeviceLogin('stranger@example.com')).resolves.toMatchObject({
      deviceCode: null,
    });
  });

  it('surfaces the server’s reason for refusing', async () => {
    mockFetch.mockResolvedValue(response(429, { error: 'Too many sign-in emails requested.' }));

    await expect(startDeviceLogin('reader@example.com')).rejects.toThrow(
      'Too many sign-in emails requested.'
    );
  });

  it('falls back to the status code when the server explains nothing', async () => {
    mockFetch.mockResolvedValue(response(500, {}));

    await expect(startDeviceLogin('reader@example.com')).rejects.toThrow(
      'Server responded with 500'
    );
  });

  it('rejects an empty body it cannot act on', async () => {
    mockFetch.mockResolvedValue(response(200, null));

    await expect(startDeviceLogin('reader@example.com')).rejects.toThrow(
      'Unexpected response from the server'
    );
  });

  it('needs a server to talk to', async () => {
    useSettingsStore.setState({ shelvarrUrl: '' });

    await expect(startDeviceLogin('reader@example.com')).rejects.toThrow(
      'Server URL not configured'
    );
  });

  it('reports an unreachable server', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));

    await expect(startDeviceLogin('reader@example.com')).rejects.toThrow(
      'Could not reach the server'
    );
  });
});

describe('pollDeviceLogin', () => {
  it('sends the device code and a name for the session', async () => {
    mockFetch.mockResolvedValue(response(200, { status: 'pending' }));

    await expect(pollDeviceLogin('device-1', 'Stackarr on Android')).resolves.toEqual({
      status: 'pending',
    });
    expect(mockFetch.mock.calls[0][1].body).toBe(
      JSON.stringify({ deviceCode: 'device-1', label: 'Stackarr on Android' })
    );
  });
});

describe('cancelDeviceLogin', () => {
  it('asks the server to drop the pending request', async () => {
    mockFetch.mockResolvedValue(response(200, { cancelled: true }));

    await cancelDeviceLogin('device 1');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://books.local/api/auth/device/poll?deviceCode=device%201',
      { method: 'DELETE' }
    );
  });

  it('shrugs off a failure — the request expires by itself', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));

    await expect(cancelDeviceLogin('device-1')).resolves.toBeUndefined();
  });

  it('does nothing without a server', async () => {
    useSettingsStore.setState({ shelvarrUrl: '' });

    await cancelDeviceLogin('device-1');

    expect(mockFetch).not.toHaveBeenCalled();
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
