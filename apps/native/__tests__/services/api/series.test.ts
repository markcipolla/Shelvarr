import { PAGE_SIZE } from '../../../src/utils/constants';

const mockGet = jest.fn();

jest.mock('../../../src/services/api/client', () => ({
  getApiClient: () => ({ get: mockGet }),
}));

import { fetchSeriesForLibrary, fetchSeries } from '../../../src/services/api/series';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fetchSeriesForLibrary', () => {
  it('fetches series with default page', async () => {
    mockGet.mockResolvedValue({ data: { content: [] } });
    await fetchSeriesForLibrary('lib1');
    expect(mockGet).toHaveBeenCalledWith('/api/series', {
      params: { library_id: 'lib1', page: 0, size: PAGE_SIZE, sort: 'metadata.titleSort,asc' },
    });
  });

  it('fetches series with specific page', async () => {
    mockGet.mockResolvedValue({ data: { content: [] } });
    await fetchSeriesForLibrary('lib1', 2);
    expect(mockGet).toHaveBeenCalledWith('/api/series', {
      params: { library_id: 'lib1', page: 2, size: PAGE_SIZE, sort: 'metadata.titleSort,asc' },
    });
  });
});

describe('fetchSeries', () => {
  it('fetches a single series', async () => {
    const series = { id: 's1', name: 'Series' };
    mockGet.mockResolvedValue({ data: series });
    const result = await fetchSeries('s1');
    expect(result).toEqual(series);
    expect(mockGet).toHaveBeenCalledWith('/api/series/s1');
  });
});
