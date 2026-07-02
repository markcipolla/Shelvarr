const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('../../../src/services/api/client', () => ({
  getApiClient: () => ({ get: mockGet, post: mockPost }),
}));

import {
  searchDownloads,
  queueDownload,
  getDownloadSourceStatuses,
} from '../../../src/services/api/downloads';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('searchDownloads', () => {
  it('returns empty results without hitting the API for blank queries', async () => {
    const res = await searchDownloads('   ');
    expect(mockGet).not.toHaveBeenCalled();
    expect(res).toEqual({ success: true, results: [] });
  });

  it('calls /api/downloads/search with the trimmed query', async () => {
    const payload = { success: true, results: [{ id: 'x', source: 'libgen', title: 'Dune' }] };
    mockGet.mockResolvedValue({ data: payload });

    const res = await searchDownloads('  dune  ');

    expect(mockGet).toHaveBeenCalledWith('/api/downloads/search', { params: { q: 'dune' } });
    expect(res).toEqual(payload);
  });

  it('forwards the isbn when provided', async () => {
    mockGet.mockResolvedValue({ data: { success: true, results: [] } });
    await searchDownloads('dune', '123');
    expect(mockGet).toHaveBeenCalledWith('/api/downloads/search', {
      params: { q: 'dune', isbn: '123' },
    });
  });

  it('returns a failure response when the request throws', async () => {
    mockGet.mockRejectedValue(new Error('Network down'));
    const res = await searchDownloads('dune');
    expect(res).toEqual({ success: false, error: 'Network down' });
  });
});

describe('queueDownload', () => {
  it('POSTs the payload to /api/downloads/queue', async () => {
    mockPost.mockResolvedValue({ data: { success: true, taskId: 42 } });

    const input = {
      source: 'libgen' as const,
      md5: 'abc',
      title: 'Dune',
      author: 'Herbert',
      extension: 'epub',
      libraryId: 3,
      wantedBookId: 7,
    };
    const res = await queueDownload(input);

    expect(mockPost).toHaveBeenCalledWith('/api/downloads/queue', input);
    expect(res).toEqual({ success: true, taskId: 42 });
  });

  it('returns the server error message on failure', async () => {
    mockPost.mockRejectedValue({ response: { data: { error: 'nope' } } });
    const res = await queueDownload({
      source: 'libgen',
      md5: 'abc',
      title: 'Dune',
      author: 'Herbert',
      extension: 'epub',
      libraryId: 3,
    });
    expect(res).toEqual({ success: false, error: 'nope' });
  });
});

describe('getDownloadSourceStatuses', () => {
  it('returns the statuses array from the response', async () => {
    mockGet.mockResolvedValue({
      data: { success: true, statuses: [{ name: 'libgen', status: 'up' }] },
    });
    const res = await getDownloadSourceStatuses();
    expect(mockGet).toHaveBeenCalledWith('/api/downloads/sources');
    expect(res).toEqual([{ name: 'libgen', status: 'up' }]);
  });

  it('returns an empty array when the request throws', async () => {
    mockGet.mockRejectedValue(new Error('boom'));
    const res = await getDownloadSourceStatuses();
    expect(res).toEqual([]);
  });
});
