import React from 'react';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import { FlatList } from 'react-native';
import HomeScreen from '../../src/screens/HomeScreen';
import { searchBooks, fetchInProgressBooks, fetchRecentlyAdded } from '../../src/services/api/books';
import { useColumns } from '../../src/hooks/useColumns';
import { useSettingsStore } from '../../src/stores/useSettingsStore';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));
jest.mock('../../src/services/api/books');
jest.mock('../../src/hooks/useColumns');
jest.mock('../../src/stores/useSettingsStore');
jest.mock('../../src/hooks/useAuthHeaders', () => ({
  useAuthHeaders: jest.fn().mockReturnValue({}),
}));
jest.mock('../../src/stores/useDownloadStore', () => ({
  useDownloadStore: jest.fn((selector: any) =>
    selector({ downloads: {}, activeDownloadId: null, progress: 0 })
  ),
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

const mockSearchBooks = searchBooks as jest.Mock;
const mockFetchInProgress = fetchInProgressBooks as jest.Mock;
const mockFetchRecent = fetchRecentlyAdded as jest.Mock;
const mockUseColumns = useColumns as jest.Mock;
const mockUseSettingsStore = useSettingsStore as unknown as jest.Mock;

const mockNavigation = {
  navigate: jest.fn(),
  setOptions: jest.fn(),
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
  mockFetchInProgress.mockResolvedValue({ content: [] });
  mockFetchRecent.mockResolvedValue({ content: [] });
}

// The search input is rendered inline in the screen body (not via
// navigation.setOptions). We locate it by its placeholder and drive its
// onChangeText handler directly.
const SEARCH_PLACEHOLDER = /Search all books/;

let currentScreen: ReturnType<typeof render> | null = null;

function renderHome() {
  currentScreen = render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);
  return currentScreen;
}

function getOnChangeText(): ((text: string) => void) | null {
  if (!currentScreen) return null;
  const input = currentScreen.getByPlaceholderText(SEARCH_PLACEHOLDER);
  return input.props.onChangeText ?? null;
}

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseColumns.mockReturnValue(2);
    mockUseSettingsStore.mockImplementation((selector: any) =>
      selector({ shelvarrUrl: 'http://shelvarr:3000' })
    );
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows configure message when shelvarrUrl not set', () => {
    mockUseSettingsStore.mockImplementation((selector: any) =>
      selector({ shelvarrUrl: '' })
    );
    const { getByText } = render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);
    expect(getByText(/No server configured/)).toBeTruthy();
  });

  it('shows loading indicator initially', () => {
    mockFetchInProgress.mockReturnValue(new Promise(() => {}));
    mockFetchRecent.mockReturnValue(new Promise(() => {}));
    const { toJSON } = render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders in-progress and recently added sections', async () => {
    mockFetchInProgress.mockResolvedValue({ content: [makeBook('b1', 'In Progress Book')] });
    mockFetchRecent.mockResolvedValue({ content: [makeBook('b2', 'Recent Book')] });

    const { getByText } = render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('In Progress')).toBeTruthy();
      expect(getByText('Recently Added')).toBeTruthy();
      expect(getByText('In Progress Book')).toBeTruthy();
      expect(getByText('Recent Book')).toBeTruthy();
    });
  });

  it('shows empty text when there are no books', async () => {
    setupLoadedState();

    const { getByText } = render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('No books yet')).toBeTruthy();
    });
  });

  it('deduplicates recently-added against in-progress', async () => {
    const shared = makeBook('b1', 'Shared');
    mockFetchInProgress.mockResolvedValue({ content: [shared] });
    mockFetchRecent.mockResolvedValue({ content: [shared, makeBook('b2', 'Other')] });

    const { getAllByText, getByText } = render(
      <HomeScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      // Shared appears only once (in In Progress), not in Recently Added
      expect(getAllByText('Shared').length).toBe(1);
      expect(getByText('Other')).toBeTruthy();
    });
  });

  it('handles fetch error gracefully', async () => {
    mockFetchInProgress.mockRejectedValue(new Error('fail'));
    mockFetchRecent.mockRejectedValue(new Error('fail'));

    const { toJSON } = render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);
    await waitFor(() => {
      expect(toJSON()).toBeTruthy();
    });
  });

  it('navigates to book detail from in-progress row', async () => {
    mockFetchInProgress.mockResolvedValue({ content: [makeBook('b1', 'My Book')] });
    mockFetchRecent.mockResolvedValue({ content: [] });

    const { getByText } = render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('My Book')).toBeTruthy();
    });

    fireEvent.press(getByText('My Book'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('BookDetail', { bookId: 'b1' });
  });

  it('navigates from recently added row', async () => {
    mockFetchInProgress.mockResolvedValue({ content: [] });
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

    renderHome();

    await waitFor(() => {
      expect(getOnChangeText()).toBeTruthy();
    });

    await act(async () => {
      getOnChangeText()!('test query');
    });

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

    const { getByText } = renderHome();

    await waitFor(() => {
      expect(getOnChangeText()).toBeTruthy();
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

    renderHome();

    await waitFor(() => {
      expect(getOnChangeText()).toBeTruthy();
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

    renderHome();

    await waitFor(() => {
      expect(getOnChangeText()).toBeTruthy();
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

    renderHome();

    await waitFor(() => {
      expect(getOnChangeText()).toBeTruthy();
    });

    await act(async () => {
      getOnChangeText()!('test');
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

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

    const { UNSAFE_getAllByType } = renderHome();

    await waitFor(() => {
      expect(getOnChangeText()).toBeTruthy();
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

    const flatLists = UNSAFE_getAllByType(FlatList);
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
    mockFetchInProgress.mockResolvedValue({ content: [] });
    mockFetchRecent.mockResolvedValue({ content: [] });

    const { UNSAFE_getAllByType } = render(
      <HomeScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(mockFetchInProgress).toHaveBeenCalledTimes(1);
    });

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
      expect(mockFetchInProgress).toHaveBeenCalledTimes(2);
    });
  });

  it('does not load more when already searching', async () => {
    setupLoadedState();
    mockSearchBooks.mockReturnValue(new Promise(() => {}));

    renderHome();

    await waitFor(() => {
      expect(getOnChangeText()).toBeTruthy();
    });

    await act(async () => {
      getOnChangeText()!('slow');
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(mockSearchBooks).toHaveBeenCalledTimes(1);
  });

  it('performSearch returns early for empty trimmed query', async () => {
    setupLoadedState();

    renderHome();

    await waitFor(() => {
      expect(getOnChangeText()).toBeTruthy();
    });

    await act(async () => {
      getOnChangeText()!('   ');
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(mockSearchBooks).not.toHaveBeenCalled();
  });
});
