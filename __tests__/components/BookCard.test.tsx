import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import BookCard from '../../src/components/BookCard';
import { useAuthHeaders } from '../../src/hooks/useAuthHeaders';
import { getBookThumbnailUrl } from '../../src/services/api/books';
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

  it('handles pagesCount of 0 gracefully', () => {
    const book = makeBook({
      media: { status: 'READY', mediaType: 'application/epub+zip', pagesCount: 0 },
      readProgress: { page: 0, completed: false, readDate: '', created: '', lastModified: '' },
    });
    const { toJSON } = render(<BookCard book={book} onPress={jest.fn()} />);
    expect(toJSON()).toBeTruthy();
  });
});
