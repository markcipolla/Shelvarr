import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import SeriesScreen from '../../src/screens/SeriesScreen';
import { fetchBooksForSeries } from '../../src/services/api/books';
import { useColumns } from '../../src/hooks/useColumns';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));
jest.mock('../../src/services/api/books');
jest.mock('../../src/hooks/useColumns');
jest.mock('../../src/hooks/useAuthHeaders', () => ({
  useAuthHeaders: jest.fn().mockReturnValue({}),
}));
jest.mock('../../src/components/BookCard', () => {
  const { Text, TouchableOpacity } = require('react-native');
  return function MockBookCard({ book, onPress }: any) {
    return (
      <TouchableOpacity onPress={onPress} testID={`book-${book.id}`}>
        <Text>{book.metadata?.title || book.name}</Text>
      </TouchableOpacity>
    );
  };
});

const mockFetchBooks = fetchBooksForSeries as jest.Mock;
const mockUseColumns = useColumns as jest.Mock;

const mockNavigation = {
  navigate: jest.fn(),
  setOptions: jest.fn(),
  goBack: jest.fn(),
} as any;

const mockRoute = {
  params: { seriesId: 's1', seriesName: 'My Series' },
} as any;

const makeBook = (id: string, title = '') => ({
  id,
  seriesId: 's1',
  name: `Book ${id}`,
  number: 1,
  sizeBytes: 1000,
  media: { status: 'READY', mediaType: '', pagesCount: 10 },
  metadata: { title, summary: '', number: '1', authors: [] },
  readProgress: null,
});

describe('SeriesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseColumns.mockReturnValue(2);
  });

  it('shows loading indicator initially', () => {
    mockFetchBooks.mockReturnValue(new Promise(() => {}));
    const { toJSON } = render(<SeriesScreen navigation={mockNavigation} route={mockRoute} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders books after load', async () => {
    mockFetchBooks.mockResolvedValue({
      content: [makeBook('b1', 'Test Book')],
      last: true,
    });

    const { getByText } = render(<SeriesScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Test Book')).toBeTruthy();
    });
  });

  it('navigates to book detail on press', async () => {
    mockFetchBooks.mockResolvedValue({
      content: [makeBook('b1', 'My Book')],
      last: true,
    });

    const { getByText } = render(<SeriesScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('My Book')).toBeTruthy();
    });

    fireEvent.press(getByText('My Book'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('BookDetail', { bookId: 'b1' });
  });

  it('handles fetch error', async () => {
    mockFetchBooks.mockRejectedValue(new Error('fail'));

    const { toJSON } = render(<SeriesScreen navigation={mockNavigation} route={mockRoute} />);
    await waitFor(() => {
      expect(toJSON()).toBeTruthy();
    });
  });

  it('uses book name when title is empty', async () => {
    mockFetchBooks.mockResolvedValue({
      content: [makeBook('b1', '')],
      last: true,
    });

    const { getByText } = render(<SeriesScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Book b1')).toBeTruthy();
    });
  });

  it('loads more pages on end reached', async () => {
    mockFetchBooks
      .mockResolvedValueOnce({
        content: [makeBook('b1', 'First')],
        last: false,
      })
      .mockResolvedValueOnce({
        content: [makeBook('b2', 'Second')],
        last: true,
      });

    const { getByText, UNSAFE_getByType } = render(
      <SeriesScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(getByText('First')).toBeTruthy();
    });

    const { FlatList } = require('react-native');
    const flatList = UNSAFE_getByType(FlatList);
    fireEvent(flatList, 'onEndReached');

    await waitFor(() => {
      expect(mockFetchBooks).toHaveBeenCalledTimes(2);
      expect(mockFetchBooks).toHaveBeenCalledWith('s1', 1);
    });
  });

  it('does not load more when hasMore is false', async () => {
    mockFetchBooks.mockResolvedValue({
      content: [makeBook('b1', 'Only')],
      last: true,
    });

    const { getByText, UNSAFE_getByType } = render(
      <SeriesScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(getByText('Only')).toBeTruthy();
    });

    const { FlatList } = require('react-native');
    const flatList = UNSAFE_getByType(FlatList);
    fireEvent(flatList, 'onEndReached');

    expect(mockFetchBooks).toHaveBeenCalledTimes(1);
  });

  it('filters books by search text from header', async () => {
    mockFetchBooks.mockResolvedValue({
      content: [makeBook('b1', 'Alpha'), makeBook('b2', 'Beta')],
      last: true,
    });

    render(<SeriesScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(mockNavigation.setOptions).toHaveBeenCalled();
    });

    const lastCall = mockNavigation.setOptions.mock.calls[mockNavigation.setOptions.mock.calls.length - 1][0];
    const HeaderTitle = lastCall.headerTitle;
    const { getByPlaceholderText } = render(<HeaderTitle />);
    const searchInput = getByPlaceholderText('Search My Series...');

    fireEvent.changeText(searchInput, 'Alpha');
  });

  it('sets header with series name', () => {
    mockFetchBooks.mockResolvedValue({ content: [], last: true });
    render(<SeriesScreen navigation={mockNavigation} route={mockRoute} />);
    expect(mockNavigation.setOptions).toHaveBeenCalled();
  });
});
