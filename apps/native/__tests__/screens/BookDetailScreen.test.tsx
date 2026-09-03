import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import BookDetailScreen from '../../src/screens/BookDetailScreen';
import { fetchBook, deleteReadProgress, updateReadProgress } from '../../src/services/api/books';
import { fetchSeries } from '../../src/services/api/series';
import { useAuthHeaders } from '../../src/hooks/useAuthHeaders';
import { useDownloadStore } from '../../src/stores/useDownloadStore';
import { prepareBookForReading } from '../../src/services/downloadManager';
import { getMediaFormat, getFormatFromName } from '../../src/utils/fileTypes';
import { updateReadingStatus } from '../../src/services/api/shelvarr';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));
jest.mock('../../src/services/api/books');
jest.mock('../../src/services/api/series');
jest.mock('../../src/hooks/useAuthHeaders');
jest.mock('../../src/stores/useDownloadStore');
jest.mock('../../src/services/downloadManager');
jest.mock('../../src/utils/fileTypes');
jest.mock('../../src/services/api/shelvarr');

const mockFetchBook = fetchBook as jest.Mock;
const mockFetchSeries = fetchSeries as jest.Mock;
const mockUseAuthHeaders = useAuthHeaders as jest.Mock;
const mockUseDownloadStore = useDownloadStore as unknown as jest.Mock;
const mockPrepare = prepareBookForReading as jest.Mock;
const mockDeleteProgress = deleteReadProgress as jest.Mock;
const mockUpdateProgress = updateReadProgress as jest.Mock;
const mockGetMediaFormat = getMediaFormat as jest.Mock;
const mockGetFormatFromName = getFormatFromName as jest.Mock;
const mockUpdateReadingStatus = updateReadingStatus as jest.Mock;

// The Hardcover status section adds a button also labelled "Read", so a plain
// getByText('Read') is ambiguous. The primary read/continue button is rendered
// before the status grid, so the first match is the primary button.
const getPrimaryReadButton = (screen: ReturnType<typeof render>) =>
  screen.getAllByText('Read')[0];

const mockNavigation = {
  navigate: jest.fn(),
  setOptions: jest.fn(),
  goBack: jest.fn(),
} as any;

const mockRoute = {
  params: { bookId: 'b1' },
} as any;

const makeBook = (overrides: any = {}) => ({
  id: 'b1',
  seriesId: 's1',
  name: 'Book One',
  number: 1,
  sizeBytes: 5242880,
  media: { status: 'READY', mediaType: 'application/epub+zip', pagesCount: 100 },
  metadata: { title: 'Book Title', summary: 'A great book', number: '1', authors: [{ name: 'Author', role: 'writer' }] },
  readProgress: null,
  ...overrides,
});

const makeSeries = () => ({
  id: 's1',
  libraryId: 'lib1',
  name: 'Series Name',
  booksCount: 5,
  metadata: { title: 'Series Title', titleSort: '', summary: '', status: '', publisher: '' },
});

describe('BookDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockUseAuthHeaders.mockReturnValue({});
    mockUseDownloadStore.mockImplementation((selector: any) =>
      selector({ progress: 0, activeDownloadId: null, downloads: {} })
    );
    mockGetMediaFormat.mockReturnValue('epub');
    mockGetFormatFromName.mockReturnValue('epub');
  });

  it('shows loading indicator initially', () => {
    mockFetchBook.mockReturnValue(new Promise(() => {}));
    const { toJSON } = render(<BookDetailScreen navigation={mockNavigation} route={mockRoute} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders book details after load', async () => {
    mockFetchBook.mockResolvedValue(makeBook());
    mockFetchSeries.mockResolvedValue(makeSeries());

    const screen = render(<BookDetailScreen navigation={mockNavigation} route={mockRoute} />);
    const { getByText } = screen;

    await waitFor(() => {
      expect(getByText('Book Title')).toBeTruthy();
      expect(getByText('Author')).toBeTruthy();
      expect(getByText('A great book')).toBeTruthy();
      expect(getByText('Format: EPUB')).toBeTruthy();
      expect(getByText('Pages: 100')).toBeTruthy();
      expect(getPrimaryReadButton(screen)).toBeTruthy();
    });
  });

  it('shows Continue Reading when progress exists', async () => {
    const book = makeBook({
      readProgress: { page: 50, completed: false, readDate: '', created: '', lastModified: '' },
    });
    mockFetchBook.mockResolvedValue(book);
    mockFetchSeries.mockResolvedValue(makeSeries());

    const { getByText } = render(<BookDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Continue Reading')).toBeTruthy();
      expect(getByText('Progress: Page 50')).toBeTruthy();
      expect(getByText('Mark as Unread')).toBeTruthy();
    });
  });

  it('shows completed progress', async () => {
    const book = makeBook({
      readProgress: { page: 100, completed: true, readDate: '', created: '', lastModified: '' },
    });
    mockFetchBook.mockResolvedValue(book);
    mockFetchSeries.mockResolvedValue(makeSeries());

    const { getByText } = render(<BookDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Progress: Completed')).toBeTruthy();
    });
  });

  it('handles read button press for epub', async () => {
    mockFetchBook.mockResolvedValue(makeBook());
    mockFetchSeries.mockResolvedValue(makeSeries());
    mockPrepare.mockResolvedValue({ filePath: '/path/to/book.epub' });

    const screen = render(<BookDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getPrimaryReadButton(screen)).toBeTruthy();
    });

    fireEvent.press(getPrimaryReadButton(screen));

    await waitFor(() => {
      expect(mockPrepare).toHaveBeenCalled();
      expect(mockNavigation.navigate).toHaveBeenCalledWith('EpubReader', expect.any(Object));
    });
  });

  it('handles read for pdf format', async () => {
    mockGetMediaFormat.mockReturnValue('pdf');
    mockFetchBook.mockResolvedValue(makeBook());
    mockFetchSeries.mockResolvedValue(makeSeries());
    mockPrepare.mockResolvedValue({ filePath: '/path/to/book.pdf' });

    const screen = render(<BookDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getPrimaryReadButton(screen)).toBeTruthy());
    fireEvent.press(getPrimaryReadButton(screen));

    await waitFor(() => {
      expect(mockNavigation.navigate).toHaveBeenCalledWith('PdfReader', expect.any(Object));
    });
  });

  it('handles read for cbz format', async () => {
    mockGetMediaFormat.mockReturnValue('cbz');
    mockFetchBook.mockResolvedValue(makeBook());
    mockFetchSeries.mockResolvedValue(makeSeries());
    mockPrepare.mockResolvedValue({ extractedDir: '/path/to/extracted' });

    const screen = render(<BookDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getPrimaryReadButton(screen)).toBeTruthy());
    fireEvent.press(getPrimaryReadButton(screen));

    await waitFor(() => {
      expect(mockNavigation.navigate).toHaveBeenCalledWith('ComicReader', expect.any(Object));
    });
  });

  it('handles read for cbr format', async () => {
    mockGetMediaFormat.mockReturnValue('cbr');
    mockFetchBook.mockResolvedValue(makeBook());
    mockFetchSeries.mockResolvedValue(makeSeries());
    mockPrepare.mockResolvedValue({ extractedDir: '/path/to/extracted' });

    const screen = render(<BookDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getPrimaryReadButton(screen)).toBeTruthy());
    fireEvent.press(getPrimaryReadButton(screen));

    await waitFor(() => {
      expect(mockNavigation.navigate).toHaveBeenCalledWith('ComicReader', expect.any(Object));
    });
  });

  it('shows alert for unsupported format', async () => {
    mockGetMediaFormat.mockReturnValue('unknown');
    mockGetFormatFromName.mockReturnValue('unknown');
    mockFetchBook.mockResolvedValue(makeBook());
    mockFetchSeries.mockResolvedValue(makeSeries());

    const screen = render(<BookDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getPrimaryReadButton(screen)).toBeTruthy());
    fireEvent.press(getPrimaryReadButton(screen));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Unsupported', 'Format "unknown" is not supported yet.');
    });
  });

  it('handles prepare error', async () => {
    mockFetchBook.mockResolvedValue(makeBook());
    mockFetchSeries.mockResolvedValue(makeSeries());
    mockPrepare.mockRejectedValue(new Error('Download failed'));

    const screen = render(<BookDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getPrimaryReadButton(screen)).toBeTruthy());
    fireEvent.press(getPrimaryReadButton(screen));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Download failed');
    });
  });

  it('handles mark as unread', async () => {
    const book = makeBook({
      readProgress: { page: 50, completed: false, readDate: '', created: '', lastModified: '' },
    });
    mockFetchBook.mockResolvedValue(book);
    mockFetchSeries.mockResolvedValue(makeSeries());
    mockDeleteProgress.mockResolvedValue(undefined);

    const { getByText } = render(<BookDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getByText('Mark as Unread')).toBeTruthy());
    fireEvent.press(getByText('Mark as Unread'));

    await waitFor(() => {
      expect(mockDeleteProgress).toHaveBeenCalledWith('b1');
    });
  });

  it('handles mark as unread error', async () => {
    const book = makeBook({
      readProgress: { page: 50, completed: false, readDate: '', created: '', lastModified: '' },
    });
    mockFetchBook.mockResolvedValue(book);
    mockFetchSeries.mockResolvedValue(makeSeries());
    mockDeleteProgress.mockRejectedValue(new Error('fail'));

    const { getByText } = render(<BookDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getByText('Mark as Unread')).toBeTruthy());
    fireEvent.press(getByText('Mark as Unread'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to mark as unread');
    });
  });

  it('shows Mark as Completed when not completed and marks completed', async () => {
    const book = makeBook({
      readProgress: { page: 50, completed: false, readDate: '', created: '', lastModified: '' },
    });
    mockFetchBook.mockResolvedValue(book);
    mockFetchSeries.mockResolvedValue(makeSeries());
    mockUpdateProgress.mockResolvedValue(undefined);

    const { getByText, queryByText } = render(
      <BookDetailScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => expect(getByText('Mark as Completed')).toBeTruthy());
    fireEvent.press(getByText('Mark as Completed'));

    await waitFor(() => {
      expect(mockUpdateProgress).toHaveBeenCalledWith('b1', 50, true);
      // After completion the button disappears and progress reflects completed.
      expect(queryByText('Mark as Completed')).toBeNull();
      expect(getByText('Progress: Completed')).toBeTruthy();
    });
  });

  it('hides Mark as Completed when already completed', async () => {
    const book = makeBook({
      readProgress: { page: 100, completed: true, readDate: '', created: '', lastModified: '' },
    });
    mockFetchBook.mockResolvedValue(book);
    mockFetchSeries.mockResolvedValue(makeSeries());

    const { queryByText } = render(
      <BookDetailScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => expect(queryByText('Mark as Unread')).toBeTruthy());
    expect(queryByText('Mark as Completed')).toBeNull();
  });

  it('handles mark as completed error', async () => {
    const book = makeBook({
      readProgress: { page: 50, completed: false, readDate: '', created: '', lastModified: '' },
    });
    mockFetchBook.mockResolvedValue(book);
    mockFetchSeries.mockResolvedValue(makeSeries());
    mockUpdateProgress.mockRejectedValue(new Error('fail'));

    const { getByText } = render(<BookDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getByText('Mark as Completed')).toBeTruthy());
    fireEvent.press(getByText('Mark as Completed'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to mark as completed');
    });
  });

  it('handles fetch book error', async () => {
    mockFetchBook.mockRejectedValue(new Error('fail'));

    render(<BookDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to load book details');
    });
  });

  it('falls back to cached downloaded book when offline', async () => {
    const cachedBook = makeBook();
    mockUseDownloadStore.mockImplementation((selector: any) =>
      selector({
        progress: 0,
        activeDownloadId: null,
        downloads: {
          b1: {
            bookId: 'b1',
            filePath: '/path/to/book.epub',
            format: 'epub',
            downloadedAt: 1,
            persisted: true,
            book: cachedBook,
          },
        },
      })
    );
    mockFetchBook.mockRejectedValue(new Error('Network error'));

    const { getByText } = render(<BookDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Book Title')).toBeTruthy();
    });
    expect(Alert.alert).not.toHaveBeenCalledWith('Error', 'Failed to load book details');
  });

  it('navigates to series on press', async () => {
    mockFetchBook.mockResolvedValue(makeBook());
    mockFetchSeries.mockResolvedValue(makeSeries());

    const { getByText } = render(<BookDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getByText('Series Title ›')).toBeTruthy());
    fireEvent.press(getByText('Series Title ›'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Series', {
      seriesId: 's1',
      seriesName: 'Series Title',
    });
  });

  it('shows book name when metadata title is empty', async () => {
    mockFetchBook.mockResolvedValue(makeBook({
      metadata: { title: '', summary: '', number: '1', authors: [] },
    }));
    mockFetchSeries.mockResolvedValue(makeSeries());

    const { getByText } = render(<BookDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Book One')).toBeTruthy();
    });
  });

  it('falls back to getFormatFromName when media format is unknown', async () => {
    mockGetMediaFormat.mockReturnValue('unknown');
    mockGetFormatFromName.mockReturnValue('epub');
    mockFetchBook.mockResolvedValue(makeBook());
    mockFetchSeries.mockResolvedValue(makeSeries());
    mockPrepare.mockResolvedValue({ filePath: '/path/to/book.epub' });

    const screen = render(<BookDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getPrimaryReadButton(screen)).toBeTruthy());
    fireEvent.press(getPrimaryReadButton(screen));

    await waitFor(() => {
      expect(mockNavigation.navigate).toHaveBeenCalledWith('EpubReader', expect.any(Object));
    });
  });

  it('handles series fetch failure silently', async () => {
    mockFetchBook.mockResolvedValue(makeBook());
    mockFetchSeries.mockRejectedValue(new Error('series fail'));

    const { getByText, queryByText } = render(<BookDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Book Title')).toBeTruthy();
    });
    // No series link shown
    expect(queryByText('Series Title ›')).toBeNull();
  });

  it('shows downloading state', async () => {
    mockUseDownloadStore.mockImplementation((selector: any) =>
      selector({ progress: 0.5, activeDownloadId: 'b1', downloads: {} })
    );
    mockFetchBook.mockResolvedValue(makeBook());
    mockFetchSeries.mockResolvedValue(makeSeries());
    mockPrepare.mockReturnValue(new Promise(() => {})); // never resolves

    const screen = render(<BookDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getPrimaryReadButton(screen)).toBeTruthy());
    fireEvent.press(getPrimaryReadButton(screen));

    // The downloading state is shown while preparing
    await waitFor(() => {
      expect(screen.getByText('Downloading... 50%')).toBeTruthy();
    });
  });

  it('highlights the Hardcover status the book is marked with', async () => {
    mockFetchBook.mockResolvedValue(makeBook({ hardcoverStatus: 'read' }));
    mockFetchSeries.mockResolvedValue(makeSeries());

    const { getByText } = render(<BookDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getByText('\u2713 Read')).toBeTruthy());
    // Only the matching status is highlighted.
    expect(getByText('Reading')).toBeTruthy();
    expect(getByText('Want to Read')).toBeTruthy();
    expect(getByText('Did Not Finish')).toBeTruthy();
  });

  it('leaves every Hardcover status unhighlighted when the book has none', async () => {
    mockFetchBook.mockResolvedValue(makeBook());
    mockFetchSeries.mockResolvedValue(makeSeries());

    const { getAllByText, queryByText } = render(<BookDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getAllByText('Read').length).toBe(2));
    expect(queryByText('\u2713 Read')).toBeNull();
  });

  it('highlights the new status after setting it on Hardcover', async () => {
    mockFetchBook.mockResolvedValue(makeBook());
    mockFetchSeries.mockResolvedValue(makeSeries());
    mockUpdateReadingStatus.mockResolvedValue(undefined);

    const { getAllByText, getByText } = render(<BookDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getAllByText('Read').length).toBe(2));
    fireEvent.press(getAllByText('Read')[1]);

    await waitFor(() => expect(getByText('\u2713 Read')).toBeTruthy());
    expect(mockUpdateReadingStatus).toHaveBeenCalledWith('b1', 'read');
  });
});
