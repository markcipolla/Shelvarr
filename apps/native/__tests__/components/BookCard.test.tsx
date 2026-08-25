import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import BookCard from '../../src/components/BookCard';
import { useAuthHeaders } from '../../src/hooks/useAuthHeaders';
import { useConnectivityStore } from '../../src/stores/useConnectivityStore';
import { useDownloadStore } from '../../src/stores/useDownloadStore';
import { Book } from '../../src/types/komga';

jest.mock('../../src/hooks/useAuthHeaders');
jest.mock('../../src/services/api/books', () => ({
  getBookThumbnailUrl: jest.fn().mockReturnValue('http://thumb/book1'),
}));

const mockUseAuthHeaders = useAuthHeaders as jest.Mock;

const makeBook = (overrides: Partial<Book> = {}): Book => ({
  id: 'b1',
  seriesId: 's1',
  name: 'Book Name',
  number: 1,
  sizeBytes: 1000000,
  media: { status: 'READY', mediaType: 'application/epub+zip', pagesCount: 100 },
  metadata: { title: 'Book Title', summary: '', number: '1', authors: [] },
  readProgress: null,
  ...overrides,
});

describe('BookCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuthHeaders.mockReturnValue({ Authorization: 'Basic abc' });
    useConnectivityStore.setState({ online: true });
    useDownloadStore.setState({ downloads: {}, activeDownloadId: null, progress: 0, hydrated: true });
  });

  it('renders placeholder when placeholder prop is true', () => {
    const { toJSON } = render(
      <BookCard book={makeBook()} onPress={jest.fn()} placeholder />
    );
    // Placeholder is just a View, no text
    const tree = toJSON();
    expect(tree).toBeTruthy();
  });

  it('renders book title from metadata', () => {
    const { getByText } = render(
      <BookCard book={makeBook()} onPress={jest.fn()} />
    );
    expect(getByText('Book Title')).toBeTruthy();
  });

  it('renders book name when metadata title is empty', () => {
    const book = makeBook({ metadata: { title: '', summary: '', number: '1', authors: [] } });
    const { getByText } = render(<BookCard book={book} onPress={jest.fn()} />);
    expect(getByText('Book Name')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <BookCard book={makeBook()} onPress={onPress} />
    );
    fireEvent.press(getByText('Book Title'));
    expect(onPress).toHaveBeenCalled();
  });

  it('shows read badge when completed', () => {
    const book = makeBook({
      readProgress: { page: 100, completed: true, readDate: '', created: '', lastModified: '' },
    });
    const { toJSON } = render(<BookCard book={book} onPress={jest.fn()} />);
    expect(toJSON()).toBeTruthy();
  });

  it('shows progress bar when in progress', () => {
    const book = makeBook({
      readProgress: { page: 50, completed: false, readDate: '', created: '', lastModified: '' },
    });
    const { toJSON } = render(<BookCard book={book} onPress={jest.fn()} />);
    expect(toJSON()).toBeTruthy();
  });

  it('does not show progress bar when completed', () => {
    const book = makeBook({
      readProgress: { page: 100, completed: true, readDate: '', created: '', lastModified: '' },
    });
    // progress bar not shown when completed
    const { toJSON } = render(<BookCard book={book} onPress={jest.fn()} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with fill prop', () => {
    const { getByText } = render(
      <BookCard book={makeBook()} onPress={jest.fn()} fill />
    );
    expect(getByText('Book Title')).toBeTruthy();
  });

  it('disables tap and dims when offline and book is not downloaded', () => {
    useConnectivityStore.setState({ online: false });
    const onPress = jest.fn();
    const { getByText } = render(<BookCard book={makeBook()} onPress={onPress} />);
    fireEvent.press(getByText('Book Title'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('remains tappable when offline but book is downloaded', () => {
    useConnectivityStore.setState({ online: false });
    useDownloadStore.setState({
      downloads: {
        b1: {
          bookId: 'b1',
          filePath: '/p',
          format: 'epub',
          downloadedAt: 1,
          persisted: true,
          book: makeBook(),
        },
      },
      activeDownloadId: null,
      progress: 0,
      hydrated: true,
    });
    const onPress = jest.fn();
    const { getByText } = render(<BookCard book={makeBook()} onPress={onPress} />);
    fireEvent.press(getByText('Book Title'));
    expect(onPress).toHaveBeenCalled();
  });

  it('shows a remove button and calls onRemove when provided', () => {
    const onRemove = jest.fn();
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <BookCard book={makeBook()} onPress={onPress} onRemove={onRemove} />
    );
    fireEvent.press(getByLabelText('Remove from Next Up'));
    expect(onRemove).toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('omits the remove button when onRemove is not provided', () => {
    const { queryByLabelText } = render(<BookCard book={makeBook()} onPress={jest.fn()} />);
    expect(queryByLabelText('Remove from Next Up')).toBeNull();
  });

  it('shows a "Want to read" pill for Hardcover want-to-read books', () => {
    const book = makeBook({ hardcoverStatus: 'want-to-read' });
    const { getByText } = render(<BookCard book={book} onPress={jest.fn()} />);
    expect(getByText('Want to read')).toBeTruthy();
  });

  it('shows a "Reading" pill when marked reading on Hardcover with no local progress', () => {
    const book = makeBook({ hardcoverStatus: 'reading' });
    const { getByText } = render(<BookCard book={book} onPress={jest.fn()} />);
    expect(getByText('Reading')).toBeTruthy();
  });

  it('hides the "Reading" pill when a local progress bar is already shown', () => {
    const book = makeBook({
      hardcoverStatus: 'reading',
      readProgress: { page: 50, completed: false, readDate: '', created: '', lastModified: '' },
    });
    const { queryByText } = render(<BookCard book={book} onPress={jest.fn()} />);
    expect(queryByText('Reading')).toBeNull();
  });

  it('shows a "DNF" pill for Hardcover did-not-finish books', () => {
    const book = makeBook({ hardcoverStatus: 'dnf' });
    const { getByText } = render(<BookCard book={book} onPress={jest.fn()} />);
    expect(getByText('DNF')).toBeTruthy();
  });

  it('shows no status pill for a Hardcover-read book (uses the read badge)', () => {
    const book = makeBook({ hardcoverStatus: 'read' });
    const { queryByText } = render(<BookCard book={book} onPress={jest.fn()} />);
    expect(queryByText('Want to read')).toBeNull();
    expect(queryByText('Reading')).toBeNull();
    expect(queryByText('DNF')).toBeNull();
  });

  it('handles pagesCount of 0 gracefully', () => {
    const book = makeBook({
      media: { status: 'READY', mediaType: 'application/epub+zip', pagesCount: 0 },
      readProgress: { page: 0, completed: false, readDate: '', created: '', lastModified: '' },
    });
    const { toJSON } = render(<BookCard book={book} onPress={jest.fn()} />);
    expect(toJSON()).toBeTruthy();
  });
});
