const mockGet = jest.fn();

jest.mock('../../../src/services/api/client', () => ({
  getApiClient: () => ({ get: mockGet }),
}));

import { fetchLibraries } from '../../../src/services/api/libraries';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fetchLibraries', () => {
  it('fetches libraries', async () => {
    const libs = [{ id: '1', name: 'Lib 1' }];
    mockGet.mockResolvedValue({ data: libs });
    const result = await fetchLibraries();
    expect(result).toEqual(libs);
    expect(mockGet).toHaveBeenCalledWith('/api/libraries');
  });
});
