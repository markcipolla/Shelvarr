const mockGet = jest.fn();

jest.mock('../../../src/services/api/client', () => ({
  getApiClient: () => ({ get: mockGet }),
}));

jest.mock('../../../src/stores/useSettingsStore', () => ({
  useSettingsStore: {
    getState: jest.fn(() => ({ shelvarrUrl: 'http://shelvarr:3000' })),
  },
}));

import { fetchComics, getVolumeCoverUrl } from '../../../src/services/api/comics';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fetchComics', () => {
  it('calls /api/comics without params when no search', async () => {
    const res = { configured: true, volumes: [] };
    mockGet.mockResolvedValue({ data: res });

    const result = await fetchComics();

    expect(mockGet).toHaveBeenCalledWith('/api/comics', { params: {} });
    expect(result).toEqual(res);
  });

  it('forwards the trimmed search query', async () => {
    mockGet.mockResolvedValue({ data: { configured: true, volumes: [] } });

    await fetchComics('  batman  ');

    expect(mockGet).toHaveBeenCalledWith('/api/comics', { params: { search: 'batman' } });
  });

  it('omits empty/whitespace search strings', async () => {
    mockGet.mockResolvedValue({ data: { configured: true, volumes: [] } });

    await fetchComics('   ');

    expect(mockGet).toHaveBeenCalledWith('/api/comics', { params: {} });
  });

  it('returns the unwrapped axios data', async () => {
    const res = {
      configured: true,
      volumes: [
        {
          id: 42,
          comicvine_id: 1,
          title: 'Test',
          year: 2020,
          publisher: 'P',
          volume_number: 1,
          description: '',
          monitored: true,
          monitor_new_issues: false,
          folder: '/',
          issue_count: 1,
          issue_count_monitored: 1,
          issues_downloaded: 0,
          issues_downloaded_monitored: 0,
          total_size: 0,
        },
      ],
    };
    mockGet.mockResolvedValue({ data: res });

    expect(await fetchComics()).toEqual(res);
  });

  it('returns error field when Kapowarr proxy reports one', async () => {
    const res = { configured: true, volumes: [], error: 'Kapowarr down' };
    mockGet.mockResolvedValue({ data: res });

    const result = await fetchComics();

    expect(result.error).toBe('Kapowarr down');
  });
});

describe('getVolumeCoverUrl', () => {
  it('builds a cover URL from the configured shelvarrUrl', () => {
    expect(getVolumeCoverUrl(42)).toBe('http://shelvarr:3000/api/comics/42/cover');
  });
});
