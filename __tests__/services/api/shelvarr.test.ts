import { useSettingsStore } from '../../../src/stores/useSettingsStore';
import { updateReadingStatus } from '../../../src/services/api/shelvarr';

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
      'http://shelvarr.example.com/api/reading-status/by-komga',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ komgaBookId: 'book1', status: 'reading' }),
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
