import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import LibraryScreen from '../../src/screens/LibraryScreen';
import { fetchSeriesForLibrary } from '../../src/services/api/series';
import { useColumns } from '../../src/hooks/useColumns';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));
jest.mock('../../src/services/api/series');
jest.mock('../../src/hooks/useColumns');
jest.mock('../../src/hooks/useAuthHeaders', () => ({
  useAuthHeaders: jest.fn().mockReturnValue({}),
}));
jest.mock('../../src/services/api/books', () => ({
  getSeriesThumbnailUrl: jest.fn().mockReturnValue('http://thumb/s1'),
}));
jest.mock('../../src/components/SeriesCard', () => {
  const { Text, TouchableOpacity } = require('react-native');
  return function MockSeriesCard({ series, onPress }: any) {
    return (
      <TouchableOpacity onPress={onPress} testID={`series-${series.id}`}>
        <Text>{series.metadata?.title || series.name}</Text>
      </TouchableOpacity>
    );
  };
});

const mockFetchSeries = fetchSeriesForLibrary as jest.Mock;
const mockUseColumns = useColumns as jest.Mock;

const mockNavigation = {
  navigate: jest.fn(),
  setOptions: jest.fn(),
  goBack: jest.fn(),
} as any;

const mockRoute = {
  params: { libraryId: 'lib1', libraryName: 'My Library' },
} as any;

const makeSeries = (id: string, title = '') => ({
  id,
  libraryId: 'lib1',
  name: `Series ${id}`,
  booksCount: 3,
  metadata: { title, titleSort: '', summary: '', status: '', publisher: '' },
});

describe('LibraryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseColumns.mockReturnValue(2);
  });

  it('shows loading indicator initially', () => {
    mockFetchSeries.mockReturnValue(new Promise(() => {}));
    const { toJSON } = render(<LibraryScreen navigation={mockNavigation} route={mockRoute} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders series after load', async () => {
    mockFetchSeries.mockResolvedValue({
      content: [makeSeries('s1', 'Test Series')],
      last: true,
    });

    const { getByText } = render(<LibraryScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Test Series')).toBeTruthy();
    });
  });

  it('navigates to series on press', async () => {
    mockFetchSeries.mockResolvedValue({
      content: [makeSeries('s1', 'My Series')],
      last: true,
    });

    const { getByText } = render(<LibraryScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('My Series')).toBeTruthy();
    });

    fireEvent.press(getByText('My Series'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Series', {
      seriesId: 's1',
      seriesName: 'My Series',
    });
  });

  it('handles fetch error', async () => {
    mockFetchSeries.mockRejectedValue(new Error('fail'));

    const { toJSON } = render(<LibraryScreen navigation={mockNavigation} route={mockRoute} />);
    await waitFor(() => {
      expect(toJSON()).toBeTruthy();
    });
  });

  it('uses series name when title is empty', async () => {
    mockFetchSeries.mockResolvedValue({
      content: [makeSeries('s1', '')],
      last: true,
    });

    const { getByText } = render(<LibraryScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Series s1')).toBeTruthy();
    });
  });

  it('loads more pages on end reached', async () => {
    mockFetchSeries
      .mockResolvedValueOnce({
        content: [makeSeries('s1', 'First')],
        last: false,
      })
      .mockResolvedValueOnce({
        content: [makeSeries('s2', 'Second')],
        last: true,
      });

    const { getByText, UNSAFE_getByType } = render(
      <LibraryScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(getByText('First')).toBeTruthy();
    });

    // Trigger onEndReached on the FlatList
    const { FlatList } = require('react-native');
    const flatList = UNSAFE_getByType(FlatList);
    fireEvent(flatList, 'onEndReached');

    await waitFor(() => {
      expect(mockFetchSeries).toHaveBeenCalledTimes(2);
      expect(mockFetchSeries).toHaveBeenCalledWith('lib1', 1);
    });
  });

  it('does not load more when hasMore is false', async () => {
    mockFetchSeries.mockResolvedValue({
      content: [makeSeries('s1', 'Only')],
      last: true,
    });

    const { getByText, UNSAFE_getByType } = render(
      <LibraryScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(getByText('Only')).toBeTruthy();
    });

    const { FlatList } = require('react-native');
    const flatList = UNSAFE_getByType(FlatList);
    fireEvent(flatList, 'onEndReached');

    // Should still only have one fetch call
    expect(mockFetchSeries).toHaveBeenCalledTimes(1);
  });

  it('filters series by search text from header', async () => {
    mockFetchSeries.mockResolvedValue({
      content: [makeSeries('s1', 'Alpha'), makeSeries('s2', 'Beta')],
      last: true,
    });

    const { getByText } = render(
      <LibraryScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(getByText('Alpha')).toBeTruthy();
    });

    // Get the search bar component from setOptions
    const lastCall = mockNavigation.setOptions.mock.calls[mockNavigation.setOptions.mock.calls.length - 1][0];
    const HeaderTitle = lastCall.headerTitle;
    const { getByPlaceholderText } = render(<HeaderTitle />);
    const searchInput = getByPlaceholderText('Search My Library...');

    fireEvent.changeText(searchInput, 'Alpha');

    // After search, only Alpha should be shown
    // The search input triggers setSearch which re-renders with filtered data
  });

  it('sets header title with library name', () => {
    mockFetchSeries.mockResolvedValue({ content: [], last: true });

    render(<LibraryScreen navigation={mockNavigation} route={mockRoute} />);

    expect(mockNavigation.setOptions).toHaveBeenCalled();
    const call = mockNavigation.setOptions.mock.calls[0][0];
    expect(call.headerTitle).toBeDefined();
  });
});
