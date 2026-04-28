const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('../../../src/services/api/client', () => ({
  getApiClient: () => ({ get: mockGet, post: mockPost }),
}));

import { searchHardcover, addToWanted, checkIsWanted } from '../../../src/services/api/wanted';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('searchHardcover', () => {
  it('returns empty results without hitting the API for blank queries', async () => {
    const res = await searchHardcover('   ');
    expect(mockGet).not.toHaveBeenCalled();
    expect(res).toEqual({ success: true, results: [] });
  });

  it('calls /api/wanted/search with the trimmed query', async () => {
    const payload = {
      success: true,
      configured: true,
      results: [
        {
          hardcoverId: 'hc-1',
          title: 'Dune',
          author: 'Frank Herbert',
          isWanted: false,
        },
      ],
    };
    mockGet.mockResolvedValue({ data: payload });

    const res = await searchHardcover('  dune  ');

    expect(mockGet).toHaveBeenCalledWith('/api/wanted/search', { params: { q: 'dune' } });
    expect(res).toEqual(payload);
  });

  it('returns a failure response when the request throws', async () => {
    mockGet.mockRejectedValue({ response: { data: { error: 'boom' } } });
    const res = await searchHardcover('foo');
    expect(res).toEqual({ success: false, error: 'boom' });
  });

  it('falls back to the error message when no response data', async () => {
    mockGet.mockRejectedValue(new Error('Network down'));
    const res = await searchHardcover('foo');
    expect(res).toEqual({ success: false, error: 'Network down' });
  });
});

describe('addToWanted', () => {
  it('POSTs the payload to /api/wanted and returns the response data', async () => {
    mockPost.mockResolvedValue({ data: { success: true, id: 7 } });

    const res = await addToWanted({
      hardcoverId: 'hc-1',
      title: 'Dune',
      author: 'Frank Herbert',
    });

    expect(mockPost).toHaveBeenCalledWith('/api/wanted', {
      hardcoverId: 'hc-1',
      title: 'Dune',
      author: 'Frank Herbert',
    });
    expect(res).toEqual({ success: true, id: 7 });
  });

  it('returns a failure response with the server error message', async () => {
    mockPost.mockRejectedValue({
      response: { data: { error: 'Book is already on wanted list' } },
    });

    const res = await addToWanted({ title: 'Dune' });

    expect(res).toEqual({
      success: false,
      error: 'Book is already on wanted list',
    });
  });
});

describe('checkIsWanted', () => {
  it('POSTs to /api/wanted/check and returns the boolean', async () => {
    mockPost.mockResolvedValue({ data: { isWanted: true } });

    const res = await checkIsWanted({ hardcoverId: 'hc-1' });

    expect(mockPost).toHaveBeenCalledWith('/api/wanted/check', { hardcoverId: 'hc-1' });
    expect(res).toBe(true);
  });

  it('returns false when the request throws', async () => {
    mockPost.mockRejectedValue(new Error('boom'));
    const res = await checkIsWanted({ title: 'Dune' });
    expect(res).toBe(false);
  });

  it('returns false when the server returns isWanted=false', async () => {
    mockPost.mockResolvedValue({ data: { isWanted: false } });
    const res = await checkIsWanted({ isbn: '123' });
    expect(res).toBe(false);
  });
});
