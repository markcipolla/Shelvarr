import {
  listDownloadedBooks,
  searchDownloadedBooks,
  listDownloadedComicVolumes,
  withDownloadedComicVolumes,
} from '../../src/services/offlineLibrary';
import type { Book, DownloadedBook } from '../../src/types/api';
import type { DownloadedComic } from '../../src/stores/useComicDownloadStore';
import type { ComicVolumeSummary } from '@shelvarr/types';

const makeBook = (id: string, overrides: Partial<Book> = {}): Book => ({
  id,
  seriesId: 'Dune',
  name: `book-${id}.epub`,
  number: 1,
  sizeBytes: 100,
  media: { status: 'READY', mediaType: 'application/epub+zip', pagesCount: 0 },
  metadata: { title: `Book ${id}`, summary: '', number: '1', authors: [] },
  readProgress: null,
  ...overrides,
});

const makeDownload = (
  bookId: string,
  downloadedAt: number,
  book?: Book
): DownloadedBook => ({
  bookId,
  filePath: `file:///${bookId}.epub`,
  format: 'epub',
  downloadedAt,
  book,
});

const makeComicDownload = (
  issueId: number,
  volumeId: number,
  downloadedAt: number,
  volumeTitle?: string
): DownloadedComic => ({
  issueId,
  volumeId,
  kind: 'pdf',
  filePath: `file:///${issueId}.pdf`,
  downloadedAt,
  volumeTitle,
});

const makeVolume = (id: number, title = `Volume ${id}`): ComicVolumeSummary => ({
  id,
  comicvine_id: id,
  title,
  year: 2020,
  publisher: 'Image',
  volume_number: 1,
  description: '',
  monitored: true,
  monitor_new_issues: false,
  folder: '/comics',
  issue_count: 10,
  issue_count_monitored: 10,
  issues_downloaded: 5,
  issues_downloaded_monitored: 5,
  total_size: 1024,
});

describe('listDownloadedBooks', () => {
  it('returns nothing when there are no downloads', () => {
    expect(listDownloadedBooks({})).toEqual([]);
  });

  it('returns downloaded books newest first', () => {
    const books = listDownloadedBooks({
      a: makeDownload('a', 1000, makeBook('a')),
      b: makeDownload('b', 3000, makeBook('b')),
      c: makeDownload('c', 2000, makeBook('c')),
    });
    expect(books.map((b) => b.id)).toEqual(['b', 'c', 'a']);
  });

  it('skips downloads with no cached metadata', () => {
    const books = listDownloadedBooks({
      a: makeDownload('a', 1000),
      b: makeDownload('b', 2000, makeBook('b')),
    });
    expect(books.map((b) => b.id)).toEqual(['b']);
  });

  it('includes books cached by reading, not just explicit downloads', () => {
    const books = listDownloadedBooks({
      a: { ...makeDownload('a', 1000, makeBook('a')), persisted: false },
    });
    expect(books.map((b) => b.id)).toEqual(['a']);
  });
});

describe('searchDownloadedBooks', () => {
  const downloads: Record<string, DownloadedBook> = {
    a: makeDownload(
      'a',
      3000,
      makeBook('a', {
        metadata: {
          title: 'The Hobbit',
          summary: '',
          number: '1',
          authors: [{ name: 'J.R.R. Tolkien', role: 'writer' }],
        },
      })
    ),
    b: makeDownload('b', 2000, makeBook('b', { name: 'foundation.epub', seriesId: 'Foundation' })),
  };

  it('returns nothing for an empty query', () => {
    expect(searchDownloadedBooks(downloads, '   ')).toEqual([]);
  });

  it('matches on title, case-insensitively', () => {
    expect(searchDownloadedBooks(downloads, 'hobbit').map((b) => b.id)).toEqual(['a']);
  });

  it('matches on author', () => {
    expect(searchDownloadedBooks(downloads, 'tolkien').map((b) => b.id)).toEqual(['a']);
  });

  it('matches on series and file name', () => {
    expect(searchDownloadedBooks(downloads, 'foundation').map((b) => b.id)).toEqual(['b']);
  });

  it('returns nothing when nothing matches', () => {
    expect(searchDownloadedBooks(downloads, 'dracula')).toEqual([]);
  });

  it('tolerates books with missing metadata', () => {
    const partial = {
      a: makeDownload('a', 1000, { id: 'a', name: 'ghost.epub' } as Book),
    };
    expect(searchDownloadedBooks(partial, 'ghost').map((b) => b.id)).toEqual(['a']);
  });
});

describe('listDownloadedComicVolumes', () => {
  it('returns nothing when there are no downloads', () => {
    expect(listDownloadedComicVolumes({})).toEqual([]);
  });

  it('lists one entry per volume, newest download first', () => {
    const volumes = listDownloadedComicVolumes({
      1: makeComicDownload(1, 10, 1000, 'Saga'),
      2: makeComicDownload(2, 10, 5000, 'Saga'),
      3: makeComicDownload(3, 20, 3000, 'Bone'),
    });
    expect(volumes.map((v) => [v.id, v.title])).toEqual([
      [10, 'Saga'],
      [20, 'Bone'],
    ]);
  });

  it('falls back to the volume id when no title was cached', () => {
    const [volume] = listDownloadedComicVolumes({ 1: makeComicDownload(1, 7, 1000) });
    expect(volume.title).toBe('Volume 7');
    expect(volume.issue_count).toBe(0);
  });

  it('filters by title when given a query', () => {
    const volumes = listDownloadedComicVolumes(
      {
        1: makeComicDownload(1, 10, 1000, 'Saga'),
        2: makeComicDownload(2, 20, 2000, 'Bone'),
      },
      'sag'
    );
    expect(volumes.map((v) => v.id)).toEqual([10]);
  });
});

describe('withDownloadedComicVolumes', () => {
  it('returns the same array when nothing is missing', () => {
    const volumes = [makeVolume(10)];
    const result = withDownloadedComicVolumes(volumes, {
      1: makeComicDownload(1, 10, 1000, 'Volume 10'),
    });
    expect(result).toBe(volumes);
  });

  it('appends downloaded volumes the list is missing', () => {
    const result = withDownloadedComicVolumes([makeVolume(10)], {
      1: makeComicDownload(1, 10, 1000, 'Volume 10'),
      2: makeComicDownload(2, 20, 2000, 'Bone'),
    });
    expect(result.map((v) => v.id)).toEqual([10, 20]);
  });

  it('applies the query to the appended volumes', () => {
    const result = withDownloadedComicVolumes([], {
      1: makeComicDownload(1, 20, 1000, 'Bone'),
      2: makeComicDownload(2, 30, 2000, 'Saga'),
    }, 'bone');
    expect(result.map((v) => v.id)).toEqual([20]);
  });
});
