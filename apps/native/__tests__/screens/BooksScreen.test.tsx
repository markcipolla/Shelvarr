import React from 'react';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import { FlatList } from 'react-native';
import BooksScreen from '../../src/screens/BooksScreen';
import { fetchBooks } from '../../src/services/api/books';
import { useColumns } from '../../src/hooks/useColumns';
import { useSettingsStore } from '../../src/stores/useSettingsStore';
import { useDownloadStore } from '../../src/stores/useDownloadStore';
import { padDataForGrid } from '../../src/utils/gridHelpers';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));
jest.mock('../../src/services/api/books');
jest.mock('../../src/hooks/useColumns');
jest.mock('../../src/stores/useSettingsStore');
jest.mock('../../src/stores/useDownloadStore', () => ({
  useDownloadStore: jest.fn(),
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
  padDataForGrid: jest.fn(),
  isPlaceholder: (item: any) => item._placeholder === true,
}));

const mockFetchBooks = fetchBooks as jest.Mock;
const mockUseColumns = useColumns as jest.Mock;
const mockUseSettingsStore = useSettingsStore as unknown as jest.Mock;
const mockUseDownloadStore = useDownloadStore as unknown as jest.Mock;
const mockPadDataForGrid = padDataForGrid as jest.Mock;

const mockNavigation = { navigate: jest.fn() } as any;
const mockRoute = { params: {} } as any;

const makeBook = (id: string, title = `Book ${id}`) => ({
  id,
  seriesId: 's1',
  name: `${id}.epub`,
  number: 1,
  sizeBytes: 100,
  media: { status: 'READY', mediaType: 'application/epub+zip', pagesCount: 0 },
  metadata: { title, summary: '', number: '1', authors: [] },
  readProgress: null,
});

const page = (books: any[], last = true) => ({
  content: books,
  pageable: { pageNumber: 0, pageSize: 20 },
  totalPages: 1,
  totalElements: books.length,
  last,
  first: true,
  numberOfElements: books.length,
});

function setDownloads(downloads: Record<string, any>) {
  mockUseDownloadStore.mockImplementation((selector: any) => selector({ downloads }));
}

describe('BooksScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseColumns.mockReturnValue(2);
    mockPadDataForGrid.mockImplementation((data: any[]) => data);
    mockUseSettingsStore.mockImplementation((selector: any) =>
      selector({ shelvarrUrl: 'http://shelvarr:3000' })
    );
    setDownloads({});
  });

  it('prompts for a server URL when none is configured', () => {
    mockUseSettingsStore.mockImplementation((selector: any) => selector({ shelvarrUrl: '' }));
    const { getByText } = render(
      <BooksScreen navigation={mockNavigation} route={mockRoute} />
    );
    expect(getByText(/No Shelvarr server configured/)).toBeTruthy();
    expect(mockFetchBooks).not.toHaveBeenCalled();
  });

  it('renders books from the server', async () => {
    mockFetchBooks.mockResolvedValue(page([makeBook('1'), makeBook('2')]));
    const { getByTestId } = render(
      <BooksScreen navigation={mockNavigation} route={mockRoute} />
    );
    await waitFor(() => expect(getByTestId('book-1')).toBeTruthy());
    expect(getByTestId('book-2')).toBeTruthy();
  });

  it('shows an empty message when the library has no books', async () => {
    mockFetchBooks.mockResolvedValue(page([]));
    const { getByText } = render(
      <BooksScreen navigation={mockNavigation} route={mockRoute} />
    );
    await waitFor(() => expect(getByText('No books found.')).toBeTruthy());
  });

  it('falls back to downloaded books when the server is unreachable', async () => {
    mockFetchBooks.mockRejectedValue(new Error('Network Error'));
    setDownloads({
      '7': { bookId: '7', filePath: 'f', format: 'epub', downloadedAt: 1, book: makeBook('7', 'Downloaded') },
    });
    const { getByTestId, getByText } = render(
      <BooksScreen navigation={mockNavigation} route={mockRoute} />
    );
    await waitFor(() => expect(getByTestId('book-7')).toBeTruthy());
    expect(getByText(/Offline — showing books downloaded to this device\./)).toBeTruthy();
  });

  it('says so when offline with nothing downloaded', async () => {
    mockFetchBooks.mockRejectedValue(new Error('Network Error'));
    const { getByText } = render(
      <BooksScreen navigation={mockNavigation} route={mockRoute} />
    );
    await waitFor(() =>
      expect(getByText('Offline, and no books are downloaded to this device.')).toBeTruthy()
    );
  });

  it('opens a book from the grid', async () => {
    mockFetchBooks.mockResolvedValue(page([makeBook('1')]));
    const { getByTestId } = render(
      <BooksScreen navigation={mockNavigation} route={mockRoute} />
    );
    await waitFor(() => expect(getByTestId('book-1')).toBeTruthy());
    fireEvent.press(getByTestId('book-1'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('BookDetail', { bookId: '1' });
  });
  it('renders a placeholder for the empty cells in the last row', async () => {
    mockFetchBooks.mockResolvedValue(page([makeBook('1')]));
    mockPadDataForGrid.mockImplementation((data: any[]) => [
      ...data,
      { id: 'pad', _placeholder: true },
    ]);
    const { getByTestId } = render(
      <BooksScreen navigation={mockNavigation} route={mockRoute} />
    );
    await waitFor(() => expect(getByTestId('placeholder')).toBeTruthy());
  });

  it('appends the next page when the list reaches its end', async () => {
    mockFetchBooks
      .mockResolvedValueOnce(page([makeBook('1')], false))
      .mockResolvedValueOnce(page([makeBook('2')]));
    const { UNSAFE_getByType, getByTestId } = render(
      <BooksScreen navigation={mockNavigation} route={mockRoute} />
    );
    await waitFor(() => expect(getByTestId('book-1')).toBeTruthy());

    await act(async () => {
      UNSAFE_getByType(FlatList).props.onEndReached();
    });

    expect(mockFetchBooks).toHaveBeenLastCalledWith(1);
    expect(getByTestId('book-1')).toBeTruthy();
    expect(getByTestId('book-2')).toBeTruthy();
  });

  it('keeps the books already shown when a later page fails', async () => {
    mockFetchBooks
      .mockResolvedValueOnce(page([makeBook('1')], false))
      .mockRejectedValueOnce(new Error('Network Error'));
    const { UNSAFE_getByType, getByTestId, queryByText } = render(
      <BooksScreen navigation={mockNavigation} route={mockRoute} />
    );
    await waitFor(() => expect(getByTestId('book-1')).toBeTruthy());

    await act(async () => {
      UNSAFE_getByType(FlatList).props.onEndReached();
    });

    expect(getByTestId('book-1')).toBeTruthy();
    expect(queryByText(/Offline —/)).toBeNull();
  });
});
