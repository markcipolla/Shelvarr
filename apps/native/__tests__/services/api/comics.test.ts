const mockGet = jest.fn();
const mockUpsertVolumes = jest.fn<Promise<void>, [unknown]>();
const mockUpsertDetail = jest.fn<Promise<void>, [unknown]>();
const mockGetCachedComics = jest.fn();
const mockGetCachedDetail = jest.fn();

jest.mock('../../../src/services/api/client', () => ({
  getApiClient: () => ({ get: mockGet }),
}));

jest.mock('../../../src/services/db/comics', () => ({
  upsertComicVolumes: (...args: unknown[]) => mockUpsertVolumes(args[0]),
  upsertComicDetail: (...args: unknown[]) => mockUpsertDetail(args[0]),
  getCachedComics: () => mockGetCachedComics(),
  getCachedComicDetail: () => mockGetCachedDetail(),
}));

jest.mock('../../../src/stores/useSettingsStore', () => ({
  useSettingsStore: {
    getState: jest.fn(() => ({ shelvarrUrl: 'http://shelvarr:3000' })),
  },
}));

import {
  fetchComics,
  fetchComicDetail,
  fetchComicIssue,
  getVolumeCoverUrl,
} from '../../../src/services/api/comics';

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsertVolumes.mockResolvedValue(undefined);
  mockUpsertDetail.mockResolvedValue(undefined);
  mockGetCachedComics.mockResolvedValue([]);
  mockGetCachedDetail.mockResolvedValue(null);
});

describe('fetchComics', () => {
  it('calls /api/comics without params when no search', async () => {
    const res = { configured: true, volumes: [{ id: 1 }] };
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

  it('omits empty search strings', async () => {
    mockGet.mockResolvedValue({ data: { configured: true, volumes: [] } });
    await fetchComics('   ');
    expect(mockGet).toHaveBeenCalledWith('/api/comics', { params: {} });
  });

  it('caches fetched volumes when no search applied', async () => {
    const volumes = [{ id: 1 }, { id: 2 }];
    mockGet.mockResolvedValue({ data: { configured: true, volumes } });
    await fetchComics();
    expect(mockUpsertVolumes).toHaveBeenCalledWith(volumes);
  });

  it('does not cache when search was applied', async () => {
    mockGet.mockResolvedValue({ data: { configured: true, volumes: [{ id: 1 }] } });
    await fetchComics('batman');
    expect(mockUpsertVolumes).not.toHaveBeenCalled();
  });

  it('does not cache when configured is false', async () => {
    mockGet.mockResolvedValue({ data: { configured: false, volumes: [] } });
    await fetchComics();
    expect(mockUpsertVolumes).not.toHaveBeenCalled();
  });

  it('does not cache empty volume list', async () => {
    mockGet.mockResolvedValue({ data: { configured: true, volumes: [] } });
    await fetchComics();
    expect(mockUpsertVolumes).not.toHaveBeenCalled();
  });

  it('falls back to cached volumes on network error', async () => {
    const cached = [{ id: 7, title: 'Cached' }];
    mockGetCachedComics.mockResolvedValue(cached);
    mockGet.mockRejectedValue(new Error('offline'));

    const result = await fetchComics();

    expect(result.configured).toBe(true);
    expect(result.cached).toBe(true);
    expect(result.volumes).toEqual(cached);
    expect(result.error).toBe('offline');
  });

  it('re-throws on network error when cache is empty', async () => {
    mockGet.mockRejectedValue(new Error('offline'));
    await expect(fetchComics()).rejects.toThrow('offline');
  });

  it('uses generic error message for non-Error rejections when falling back', async () => {
    mockGetCachedComics.mockResolvedValue([{ id: 1 }]);
    mockGet.mockRejectedValue('string reason');
    const result = await fetchComics();
    expect(result.error).toBe('Network error');
  });
});

describe('fetchComicDetail', () => {
  it('calls /api/comics/:id and returns data', async () => {
    const res = { configured: true, volume: { id: 42, issues: [] } };
    mockGet.mockResolvedValue({ data: res });

    const result = await fetchComicDetail(42);

    expect(mockGet).toHaveBeenCalledWith('/api/comics/42');
    expect(result).toEqual(res);
  });

  it('caches fresh detail to local DB', async () => {
    const vol = { id: 42, issues: [] };
    mockGet.mockResolvedValue({ data: { configured: true, volume: vol } });
    await fetchComicDetail(42);
    expect(mockUpsertDetail).toHaveBeenCalledWith(vol);
  });

  it('does not re-cache when response was itself served from server cache', async () => {
    mockGet.mockResolvedValue({
      data: { configured: true, volume: { id: 42, issues: [] }, cached: true },
    });
    await fetchComicDetail(42);
    expect(mockUpsertDetail).not.toHaveBeenCalled();
  });

  it('does not cache when configured=false', async () => {
    mockGet.mockResolvedValue({ data: { configured: false } });
    await fetchComicDetail(42);
    expect(mockUpsertDetail).not.toHaveBeenCalled();
  });

  it('does not cache when volume missing from response', async () => {
    mockGet.mockResolvedValue({ data: { configured: true } });
    await fetchComicDetail(42);
    expect(mockUpsertDetail).not.toHaveBeenCalled();
  });

  it('falls back to cached detail on network error', async () => {
    const cachedVol = { id: 42, title: 'Cached', issues: [] };
    mockGetCachedDetail.mockResolvedValue(cachedVol);
    mockGet.mockRejectedValue(new Error('offline'));

    const result = await fetchComicDetail(42);

    expect(result.configured).toBe(true);
    expect(result.cached).toBe(true);
    expect(result.volume).toEqual(cachedVol);
    expect(result.error).toBe('offline');
  });

  it('re-throws on network error with no cached detail', async () => {
    mockGet.mockRejectedValue(new Error('offline'));
    await expect(fetchComicDetail(42)).rejects.toThrow('offline');
  });

  it('uses generic error for non-Error rejections when falling back', async () => {
    mockGetCachedDetail.mockResolvedValue({ id: 42, issues: [] });
    mockGet.mockRejectedValue('fail');
    const result = await fetchComicDetail(42);
    expect(result.error).toBe('Network error');
  });
});

describe('fetchComicIssue', () => {
  it('fetches a single issue from /api/comics/issues/:id', async () => {
    const issue = { id: 7, issue_number: '7', files: [] };
    mockGet.mockResolvedValue({ data: { configured: true, issue } });

    const result = await fetchComicIssue(7, 42);

    expect(mockGet).toHaveBeenCalledWith('/api/comics/issues/7');
    expect(result).toEqual({ configured: true, issue });
  });

  it('falls back to the cached volume issue on network error', async () => {
    mockGet.mockRejectedValue(new Error('offline'));
    mockGetCachedDetail.mockResolvedValue({
      id: 42,
      issues: [{ id: 7, issue_number: '7', files: [] }],
    });

    const result = await fetchComicIssue(7, 42);

    expect(result.cached).toBe(true);
    expect(result.issue).toEqual({ id: 7, issue_number: '7', files: [] });
  });

  it('rethrows when no cached fallback is available', async () => {
    mockGet.mockRejectedValue(new Error('offline'));
    mockGetCachedDetail.mockResolvedValue(null);

    await expect(fetchComicIssue(7, 42)).rejects.toThrow('offline');
  });
});

describe('getVolumeCoverUrl', () => {
  it('builds a cover URL from the configured shelvarrUrl', () => {
    expect(getVolumeCoverUrl(42)).toBe('http://shelvarr:3000/api/comics/42/cover');
  });
});
