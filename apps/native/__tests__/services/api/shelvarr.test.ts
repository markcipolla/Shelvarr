jest.mock('../../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));

import { useSettingsStore } from '../../../src/stores/useSettingsStore';
import { updateReadingStatus, testShelvarrConnection } from '../../../src/services/api/shelvarr';

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('updateReadingStatus', () => {
  it('sends POST request when shelvarrUrl is set', async () => {
    useSettingsStore.setState({ shelvarrUrl: 'http://shelvarr.example.com/' });
    mockFetch.mockResolvedValue({ ok: true });
    await updateReadingStatus('book1', 'reading');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://shelvarr.example.com/api/reading-status/by-book',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId: 'book1', status: 'reading' }),
      }
    );
  });

  it('returns early when shelvarrUrl is empty', async () => {
    useSettingsStore.setState({ shelvarrUrl: '' });
    await updateReadingStatus('book1', 'read');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('swallows fetch errors silently', async () => {
    useSettingsStore.setState({ shelvarrUrl: 'http://shelvarr.example.com' });
    mockFetch.mockRejectedValue(new Error('Network error'));
    await expect(updateReadingStatus('book1', 'dnf')).resolves.toBeUndefined();
  });
});

describe('testShelvarrConnection', () => {
  it('returns ok when /api/health responds with status ok', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', timestamp: '2026-04-21T00:00:00Z' }),
    });
    const result = await testShelvarrConnection('http://shelvarr.example.com/');
    expect(mockFetch).toHaveBeenCalledWith('http://shelvarr.example.com/api/health', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    expect(result).toEqual({ ok: true });
  });

  it('returns error for empty URL', async () => {
    const result = await testShelvarrConnection('  ');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: 'URL is empty' });
  });

  it('returns error when server responds with non-2xx', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
    const result = await testShelvarrConnection('http://shelvarr.example.com');
    expect(result).toEqual({ ok: false, error: 'Server responded with 502' });
  });

  it('returns error when response body is not a Shelvarr health response', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ hello: 'world' }) });
    const result = await testShelvarrConnection('http://shelvarr.example.com');
    expect(result).toEqual({ ok: false, error: 'Not a Shelvarr server' });
  });

  it('returns error when fetch rejects', async () => {
    mockFetch.mockRejectedValue(new Error('Network request failed'));
    const result = await testShelvarrConnection('http://shelvarr.example.com');
    expect(result).toEqual({ ok: false, error: 'Network request failed' });
  });
});
