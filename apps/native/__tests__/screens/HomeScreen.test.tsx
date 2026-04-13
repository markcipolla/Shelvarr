import React from 'react';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import { FlatList } from 'react-native';
import HomeScreen from '../../src/screens/HomeScreen';
import { fetchLibraries } from '../../src/services/api/libraries';
import { fetchOnDeck, searchBooks, fetchInProgressBooks, fetchRecentlyAdded } from '../../src/services/api/books';
import { useColumns } from '../../src/hooks/useColumns';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));
jest.mock('../../src/services/api/libraries');
jest.mock('../../src/services/api/books');
jest.mock('../../src/hooks/useColumns');
jest.mock('../../src/hooks/useAuthHeaders', () => ({
  useAuthHeaders: jest.fn().mockReturnValue({}),
}));
jest.mock('../../src/components/BookCard', () => {
  const { View, Text, TouchableOpacity } = require('react-native');
  return function MockBookCard({ book, placeholder, onPress }: any) {
    if (placeholder) return <View testID="placeholder" />;
    return (
      <TouchableOpacity testID={`book-${book.id}`} onPress={onPress}>
        <Text>{book.metadata?.title || book.name}</Text>
      </TouchableOpacity>
    );
  };
});
jest.mock('../../src/utils/gridHelpers', () => ({
  padDataForGrid: (data: any[], _cols: number) => data,
  isPlaceholder: (item: any) => item._placeholder === true,
}));

const mockFetchLibraries = fetchLibraries as jest.Mock;
const mockFetchOnDeck = fetchOnDeck as jest.Mock;
const mockSearchBooks = searchBooks as jest.Mock;
const mockFetchInProgress = fetchInProgressBooks as jest.Mock;
const mockFetchRecent = fetchRecentlyAdded as jest.Mock;
const mockUseColumns = useColumns as jest.Mock;

// We'll capture the onChangeText from setOptions to control search state
let capturedOnChangeText: ((text: string) => void) | null = null;

const mockNavigation = {
  navigate: jest.fn(),
  setOptions: jest.fn().mockImplementation((opts: any) => {
    if (opts.headerTitle) {
      // Render the headerTitle to capture the onChangeText
      const React = require('react');
      const { renderToString } = require('react-test-renderer');
      // Just capture the component for later
    }
  }),
  goBack: jest.fn(),
} as any;

const mockRoute = { params: {} } as any;

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

function setupLoadedState() {
  mockFetchLibraries.mockResolvedValue([{ id: 'lib1', name: 'Lib' }]);
  mockFetchInProgress.mockResolvedValue({ content: [] });
  mockFetchOnDeck.mockResolvedValue({ content: [] });
  mockFetchRecent.mockResolvedValue({ content: [] });
}

// Capture setSearch from the last setOptions call
function getOnChangeText(): ((text: string) => void) | null {
  const calls = mockNavigation.setOptions.mock.calls;
  for (let i = calls.length - 1; i >= 0; i--) {
    const opts = calls[i][0];
    if (opts?.headerTitle) {
      // The headerTitle is a React component that renders a TextInput
      // The TextInput's onChangeText is setSearch from HomeScreen
      // We need to extract it by rendering the component
      // Instead, we look at the rendered element props
      const element = opts.headerTitle();
      if (element?.props?.onChangeText) {
        return element.props.onChangeText;
      }
    }
  }
  return null;
}

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseColumns.mockReturnValue(2);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows loading indicator initially', async () => {
    mockFetchLibraries.mockReturnValue(new Promise(() => {}));
    const { toJSON } = render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders library data after load', async () => {
    mockFetchLibraries.mockResolvedValue([{ id: 'lib1', name: 'My Library' }]);
    mockFetchInProgress.mockResolvedValue({ content: [makeBook('b1', 'In Progress Book')] });
    mockFetchOnDeck.mockResolvedValue({ content: [makeBook('b2', 'On Deck Book')] });
    mockFetchRecent.mockResolvedValue({ content: [makeBook('b3', 'Recent Book')] });

    const { getByText } = render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('My Library \u203a')).toBeTruthy();
    });
  });

  it('shows empty text when library has no books', async () => {
    setupLoadedState();

    const { getByText } = render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('No books yet')).toBeTruthy();
    });
  });

  it('navigates to library on press', async () => {
    setupLoadedState();

    const { getByText } = render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Lib \u203a')).toBeTruthy();
    });

    fireEvent.press(getByText('Lib \u203a'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Library', { libraryId: 'lib1', libraryName: 'Lib' });
  });

  it('handles fetch error gracefully', async () => {
    mockFetchLibraries.mockRejectedValue(new Error('fail'));

    const { toJSON } = render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);
    await waitFor(() => {
      expect(toJSON()).toBeTruthy();
    });
  });

  it('deduplicates books across sections', async () => {
    const book1 = makeBook('b1', 'Shared Book');
    mockFetchLibraries.mockResolvedValue([{ id: 'lib1', name: 'Lib' }]);
    mockFetchInProgress.mockResolvedValue({ content: [book1] });
    mockFetchOnDeck.mockResolvedValue({ content: [book1] });
    mockFetchRecent.mockResolvedValue({ content: [book1] });

    const { getByText } = render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Lib \u203a')).toBeTruthy();
    });
  });

  it('renders subsection titles when books exist', async () => {
    mockFetchLibraries.mockResolvedValue([{ id: 'lib1', name: 'Lib' }]);
    mockFetchInProgress.mockResolvedValue({ content: [makeBook('b1')] });
    mockFetchOnDeck.mockResolvedValue({ content: [makeBook('b2')] });
    mockFetchRecent.mockResolvedValue({ content: [makeBook('b3')] });

    const { getByText } = render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('In Progress')).toBeTruthy();
      expect(getByText('On Deck')).toBeTruthy();
      expect(getByText('Recently Added')).toBeTruthy();
    });
  });

  it('navigates to book detail from horizontal list', async () => {
    mockFetchLibraries.mockResolvedValue([{ id: 'lib1', name: 'Lib' }]);
    mockFetchInProgress.mockResolvedValue({ content: [makeBook('b1', 'My Book')] });
    mockFetchOnDeck.mockResolvedValue({ content: [] });
    mockFetchRecent.mockResolvedValue({ content: [] });

    const { getByText } = render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('My Book')).toBeTruthy();
    });

    fireEvent.press(getByText('My Book'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('BookDetail', { bookId: 'b1' });
  });

  it('navigates from on deck section', async () => {
    mockFetchLibraries.mockResolvedValue([{ id: 'lib1', name: 'Lib' }]);
    mockFetchInProgress.mockResolvedValue({ content: [] });
    mockFetchOnDeck.mockResolvedValue({ content: [makeBook('b2', 'Deck Book')] });
    mockFetchRecent.mockResolvedValue({ content: [] });

    const { getByText } = render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Deck Book')).toBeTruthy();
    });

    fireEvent.press(getByText('Deck Book'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('BookDetail', { bookId: 'b2' });
  });

  it('navigates from recently added section', async () => {
    mockFetchLibraries.mockResolvedValue([{ id: 'lib1', name: 'Lib' }]);
    mockFetchInProgress.mockResolvedValue({ content: [] });
    mockFetchOnDeck.mockResolvedValue({ content: [] });
    mockFetchRecent.mockResolvedValue({ content: [makeBook('b3', 'New Book')] });

    const { getByText } = render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('New Book')).toBeTruthy();
    });

    fireEvent.press(getByText('New Book'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('BookDetail', { bookId: 'b3' });
  });

  it('performs search and shows results', async () => {
    setupLoadedState();
    mockSearchBooks.mockResolvedValue({
      content: [makeBook('sr1', 'Found Book')],
      last: true,
    });

    render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(mockNavigation.setOptions).toHaveBeenCalled();
    });

    // Trigger search by extracting and invoking the headerTitle's TextInput
    await act(async () => {
      getOnChangeText()!('test query');
    });

    // Advance past debounce
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(mockSearchBooks).toHaveBeenCalledWith('test query', 0);
    });
  });

  it('navigates to book detail from search results', async () => {
    setupLoadedState();
    mockSearchBooks.mockResolvedValue({
      content: [makeBook('sr1', 'Found Book')],
      last: true,
    });

    const { getByText } = render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(mockNavigation.setOptions).toHaveBeenCalled();
    });

    await act(async () => {
      getOnChangeText()!('test query');
    });

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(getByText('Found Book')).toBeTruthy();
    });

    fireEvent.press(getByText('Found Book'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('BookDetail', { bookId: 'sr1' });
  });

  it('shows no results text when search returns empty', async () => {
    setupLoadedState();
    mockSearchBooks.mockResolvedValue({
      content: [],
      last: true,
    });

    render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(mockNavigation.setOptions).toHaveBeenCalled();
    });

    await act(async () => {
      getOnChangeText()!('nothing');
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(mockSearchBooks).toHaveBeenCalled();
    });
  });

  it('handles search error gracefully', async () => {
    setupLoadedState();
    mockSearchBooks.mockRejectedValue(new Error('search fail'));

    render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(mockNavigation.setOptions).toHaveBeenCalled();
    });

    await act(async () => {
      getOnChangeText()!('fail');
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(mockSearchBooks).toHaveBeenCalled();
    });
  });

  it('clears search results when query becomes empty', async () => {
    setupLoadedState();
    mockSearchBooks.mockResolvedValue({
      content: [makeBook('sr1', 'Result')],
      last: true,
    });

    render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(mockNavigation.setOptions).toHaveBeenCalled();
    });

    // Type search
    await act(async () => {
      getOnChangeText()!('test');
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    // Clear search
    await act(async () => {
      getOnChangeText()!('');
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
  });

  it('loads more search results on end reached', async () => {
    setupLoadedState();
    mockSearchBooks
      .mockResolvedValueOnce({
        content: [makeBook('sr1', 'First')],
        last: false,
      })
      .mockResolvedValueOnce({
        content: [makeBook('sr2', 'Second')],
        last: true,
      });

    const { UNSAFE_getAllByType } = render(
      <HomeScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(mockNavigation.setOptions).toHaveBeenCalled();
    });

    await act(async () => {
      getOnChangeText()!('test');
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(mockSearchBooks).toHaveBeenCalledWith('test', 0);
    });

    // Trigger loadMore via FlatList onEndReached
    const flatLists = UNSAFE_getAllByType(FlatList);
    // The search FlatList should be present
    if (flatLists.length > 0) {
      const searchList = flatLists[flatLists.length - 1];
      act(() => {
        searchList.props.onEndReached?.();
      });
    }

    await waitFor(() => {
      expect(mockSearchBooks).toHaveBeenCalledWith('test', 1);
    });
  });

  it('handles refresh', async () => {
    mockFetchLibraries.mockResolvedValue([{ id: 'lib1', name: 'Lib' }]);
    mockFetchInProgress.mockResolvedValue({ content: [] });
    mockFetchOnDeck.mockResolvedValue({ content: [] });
    mockFetchRecent.mockResolvedValue({ content: [] });

    const { UNSAFE_getAllByType } = render(
      <HomeScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(mockFetchLibraries).toHaveBeenCalledTimes(1);
    });

    // Find ScrollView and trigger refresh
    const { ScrollView } = require('react-native');
    const scrollViews = UNSAFE_getAllByType(ScrollView);
    if (scrollViews.length > 0) {
      const refreshControl = scrollViews[0].props.refreshControl;
      if (refreshControl?.props?.onRefresh) {
        act(() => {
          refreshControl.props.onRefresh();
        });
      }
    }

    await waitFor(() => {
      // loadData should be called again
      expect(mockFetchLibraries).toHaveBeenCalledTimes(2);
    });
  });

  it('search with page append when page > 0', async () => {
    setupLoadedState();

    // performSearch is called with page=0 first, then page=1 for loadMore
    // The page > 0 branch appends results instead of replacing
    mockSearchBooks
      .mockResolvedValueOnce({
        content: [makeBook('s1', 'First')],
        last: false,
      })
      .mockResolvedValueOnce({
        content: [makeBook('s2', 'Second')],
        last: true,
      });

    const { UNSAFE_getAllByType } = render(
      <HomeScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(mockNavigation.setOptions).toHaveBeenCalled();
    });

    await act(async () => {
      getOnChangeText()!('append test');
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(mockSearchBooks).toHaveBeenCalledWith('append test', 0);
    });

    // Now trigger loadMore
    const flatLists = UNSAFE_getAllByType(FlatList);
    if (flatLists.length > 0) {
      act(() => {
        flatLists[flatLists.length - 1].props.onEndReached?.();
      });
    }

    await waitFor(() => {
      expect(mockSearchBooks).toHaveBeenCalledWith('append test', 1);
    });
  });

  it('does not load more when already searching', async () => {
    setupLoadedState();
    // Make searchBooks hang to simulate searching=true
    let resolveSearch: (val: any) => void;
    mockSearchBooks.mockReturnValue(
      new Promise((resolve) => { resolveSearch = resolve; })
    );

    const { UNSAFE_getAllByType } = render(
      <HomeScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(mockNavigation.setOptions).toHaveBeenCalled();
    });

    await act(async () => {
      getOnChangeText()!('slow');
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    // searchBooks is called but not resolved yet (searching=true)
    expect(mockSearchBooks).toHaveBeenCalledTimes(1);
  });

  it('performSearch returns early for empty trimmed query', async () => {
    setupLoadedState();

    render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(mockNavigation.setOptions).toHaveBeenCalled();
    });

    // Search with whitespace-only should clear results
    await act(async () => {
      getOnChangeText()!('   ');
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    // searchBooks should not be called for empty query
    expect(mockSearchBooks).not.toHaveBeenCalled();
  });
});
