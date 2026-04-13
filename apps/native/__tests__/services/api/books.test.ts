import { PAGE_SIZE } from '../../../src/utils/constants';

const mockGet = jest.fn();
const mockPatch = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();

jest.mock('../../../src/services/api/client', () => ({
  getApiClient: () => ({
    get: mockGet,
    patch: mockPatch,
    put: mockPut,
    delete: mockDelete,
  }),
}));

jest.mock('../../../src/stores/useAuthStore', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({
      credentials: { serverUrl: 'http://example.com' },
    })),
  },
}));

import {
  fetchBooksForSeries,
  fetchBook,
  fetchBookPages,
  fetchOnDeck,
  getBookThumbnailUrl,
  getBookPageUrl,
  getSeriesThumbnailUrl,
  updateReadProgress,
  updateEpubProgression,
  getEpubProgression,
  deleteReadProgress,
  searchBooks,
  fetchInProgressBooks,
  fetchRecentlyAdded,
} from '../../../src/services/api/books';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fetchBooksForSeries', () => {
  it('fetches books with default page', async () => {
    const mockData = { content: [], totalPages: 1 };
    mockGet.mockResolvedValue({ data: mockData });
    const result = await fetchBooksForSeries('s1');
    expect(result).toEqual(mockData);
    expect(mockGet).toHaveBeenCalledWith('/api/series/s1/books', {
      params: { page: 0, size: PAGE_SIZE, sort: 'metadata.numberSort,asc' },
    });
  });

  it('fetches books with specific page', async () => {
    mockGet.mockResolvedValue({ data: { content: [] } });
    await fetchBooksForSeries('s1', 3);
    expect(mockGet).toHaveBeenCalledWith('/api/series/s1/books', {
      params: { page: 3, size: PAGE_SIZE, sort: 'metadata.numberSort,asc' },
    });
  });
});

describe('fetchBook', () => {
  it('fetches a single book', async () => {
    const book = { id: 'b1', name: 'Book' };
    mockGet.mockResolvedValue({ data: book });
    const result = await fetchBook('b1');
    expect(result).toEqual(book);
    expect(mockGet).toHaveBeenCalledWith('/api/books/b1');
  });
});

describe('fetchBookPages', () => {
  it('fetches pages for a book', async () => {
    const pages = [{ number: 1 }];
    mockGet.mockResolvedValue({ data: pages });
    const result = await fetchBookPages('b1');
    expect(result).toEqual(pages);
    expect(mockGet).toHaveBeenCalledWith('/api/books/b1/pages');
  });
});

describe('fetchOnDeck', () => {
  it('fetches on-deck without libraryId', async () => {
    mockGet.mockResolvedValue({ data: { content: [] } });
    await fetchOnDeck();
    expect(mockGet).toHaveBeenCalledWith('/api/books/ondeck', {
      params: { page: 0, size: PAGE_SIZE },
    });
  });

  it('fetches on-deck with libraryId', async () => {
    mockGet.mockResolvedValue({ data: { content: [] } });
    await fetchOnDeck(1, 'lib1');
    expect(mockGet).toHaveBeenCalledWith('/api/books/ondeck', {
      params: { page: 1, size: PAGE_SIZE, library_id: 'lib1' },
    });
  });
});

describe('getBookThumbnailUrl', () => {
  it('returns correct thumbnail URL', () => {
    const url = getBookThumbnailUrl('b1');
    expect(url).toBe('http://example.com/api/books/b1/thumbnail');
  });
});

describe('getBookPageUrl', () => {
  it('returns correct page URL', () => {
    const url = getBookPageUrl('b1', 5);
    expect(url).toBe('http://example.com/api/books/b1/pages/5');
  });
});

describe('getSeriesThumbnailUrl', () => {
  it('returns correct series thumbnail URL', () => {
    const url = getSeriesThumbnailUrl('s1');
    expect(url).toBe('http://example.com/api/series/s1/thumbnail');
  });
});

describe('updateReadProgress', () => {
  it('sends page when not completed', async () => {
    mockPatch.mockResolvedValue({});
    await updateReadProgress('b1', 5);
    expect(mockPatch).toHaveBeenCalledWith('/api/books/b1/read-progress', {
      page: 5,
    });
  });

  it('sends completed flag when completed', async () => {
    mockPatch.mockResolvedValue({});
    await updateReadProgress('b1', 5, true);
    expect(mockPatch).toHaveBeenCalledWith('/api/books/b1/read-progress', {
      completed: true,
    });
  });
});

describe('updateEpubProgression', () => {
  it('sends progression body', async () => {
    mockPut.mockResolvedValue({});
    await updateEpubProgression('b1', 0.5, false, 'ch1.xhtml');
    expect(mockPut).toHaveBeenCalledWith(
      '/api/books/b1/progression',
      expect.objectContaining({
        device: { id: 'stacks-android', name: 'Stacks' },
        locator: expect.objectContaining({
          href: 'ch1.xhtml',
          locations: { progression: 0.5, totalProgression: 0.5 },
        }),
      })
    );
  });

  it('sends progression=1.0 when completed', async () => {
    mockPut.mockResolvedValue({});
    await updateEpubProgression('b1', 0.5, true);
    expect(mockPut).toHaveBeenCalledWith(
      '/api/books/b1/progression',
      expect.objectContaining({
        locator: expect.objectContaining({
          locations: { progression: 1.0, totalProgression: 1.0 },
        }),
      })
    );
  });

  it('uses default parameters when not provided', async () => {
    mockPut.mockResolvedValue({});
    await updateEpubProgression('b1', 0.3);
    expect(mockPut).toHaveBeenCalledWith(
      '/api/books/b1/progression',
      expect.objectContaining({
        locator: expect.objectContaining({
          href: '',
          locations: { progression: 0.3, totalProgression: 0.3 },
        }),
      })
    );
  });
});

describe('getEpubProgression', () => {
  it('returns progression data on success', async () => {
    const data = { locator: { href: 'ch.xhtml', locations: { progression: 0.5 } } };
    mockGet.mockResolvedValue({ data });
    const result = await getEpubProgression('b1');
    expect(result).toEqual(data);
  });

  it('returns null on error', async () => {
    mockGet.mockRejectedValue(new Error('fail'));
    const result = await getEpubProgression('b1');
    expect(result).toBeNull();
  });
});

describe('deleteReadProgress', () => {
  it('deletes read progress', async () => {
    mockDelete.mockResolvedValue({});
    await deleteReadProgress('b1');
    expect(mockDelete).toHaveBeenCalledWith('/api/books/b1/read-progress');
  });
});

describe('searchBooks', () => {
  it('searches books with default page', async () => {
    mockGet.mockResolvedValue({ data: { content: [] } });
    await searchBooks('query');
    expect(mockGet).toHaveBeenCalledWith('/api/books', {
      params: { search: 'query', page: 0, size: PAGE_SIZE, sort: 'metadata.titleSort,asc' },
    });
  });
});

describe('fetchInProgressBooks', () => {
  it('fetches without libraryId', async () => {
    mockGet.mockResolvedValue({ data: { content: [] } });
    await fetchInProgressBooks();
    expect(mockGet).toHaveBeenCalledWith('/api/books', {
      params: {
        read_status: 'IN_PROGRESS',
        size: 10,
        sort: 'readProgress.lastModified,desc',
      },
    });
  });

  it('fetches with libraryId', async () => {
    mockGet.mockResolvedValue({ data: { content: [] } });
    await fetchInProgressBooks('lib1');
    expect(mockGet).toHaveBeenCalledWith('/api/books', {
      params: {
        read_status: 'IN_PROGRESS',
        size: 10,
        sort: 'readProgress.lastModified,desc',
        library_id: 'lib1',
      },
    });
  });
});

describe('fetchRecentlyAdded', () => {
  it('fetches without libraryId', async () => {
    mockGet.mockResolvedValue({ data: { content: [] } });
    await fetchRecentlyAdded();
    expect(mockGet).toHaveBeenCalledWith('/api/books', {
      params: { size: 10, sort: 'createdDate,desc' },
    });
  });

  it('fetches with libraryId', async () => {
    mockGet.mockResolvedValue({ data: { content: [] } });
    await fetchRecentlyAdded('lib1');
    expect(mockGet).toHaveBeenCalledWith('/api/books', {
      params: { size: 10, sort: 'createdDate,desc', library_id: 'lib1' },
    });
  });
});
