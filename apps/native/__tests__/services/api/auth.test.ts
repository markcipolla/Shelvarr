jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

const mockAxios = jest.requireMock('axios').default;
const mockGet = mockAxios.get as jest.Mock;

import { validateCredentials } from '../../../src/services/api/auth';
import { AuthCredentials } from '../../../src/types/komga';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation();
  jest.spyOn(console, 'error').mockImplementation();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('validateCredentials', () => {
  it('sends basic auth header and returns true on success', async () => {
    mockGet.mockResolvedValue({ status: 200 });
    const creds: AuthCredentials = {
      serverUrl: 'http://example.com/',
      authType: 'basic',
      username: 'user',
      password: 'pass',
    };
    const result = await validateCredentials(creds);
    expect(result).toBe(true);
    expect(mockGet).toHaveBeenCalledWith(
      'http://example.com/api/libraries',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
        }),
        timeout: 10000,
      })
    );
  });

  it('sends apikey header', async () => {
    mockGet.mockResolvedValue({ status: 200 });
    const creds: AuthCredentials = {
      serverUrl: 'http://example.com',
      authType: 'apikey',
      apiKey: 'my-api-key',
    };
    const result = await validateCredentials(creds);
    expect(result).toBe(true);
    expect(mockGet).toHaveBeenCalledWith(
      'http://example.com/api/libraries',
      expect.objectContaining({
        headers: { 'X-API-Key': 'my-api-key' },
      })
    );
  });

  it('strips trailing slashes from serverUrl', async () => {
    mockGet.mockResolvedValue({ status: 200 });
    const creds: AuthCredentials = {
      serverUrl: 'http://example.com///',
      authType: 'basic',
      username: 'u',
      password: 'p',
    };
    await validateCredentials(creds);
    expect(mockGet).toHaveBeenCalledWith(
      'http://example.com/api/libraries',
      expect.anything()
    );
  });

  it('returns false on HTTP error', async () => {
    mockGet.mockRejectedValue({
      message: 'Request failed',
      response: { status: 401 },
      config: { url: 'http://example.com/api/libraries' },
    });
    const creds: AuthCredentials = {
      serverUrl: 'http://example.com',
      authType: 'basic',
      username: 'u',
      password: 'p',
    };
    const result = await validateCredentials(creds);
    expect(result).toBe(false);
  });

  it('returns false on network error', async () => {
    mockGet.mockRejectedValue(new Error('Network Error'));
    const creds: AuthCredentials = {
      serverUrl: 'http://example.com',
      authType: 'basic',
    };
    const result = await validateCredentials(creds);
    expect(result).toBe(false);
  });

  it('sends empty headers when basic creds have no username/password', async () => {
    mockGet.mockResolvedValue({ status: 200 });
    const creds: AuthCredentials = {
      serverUrl: 'http://example.com',
      authType: 'basic',
    };
    await validateCredentials(creds);
    expect(mockGet).toHaveBeenCalledWith(
      'http://example.com/api/libraries',
      expect.objectContaining({ headers: {} })
    );
  });
});
