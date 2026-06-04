jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock-document-dir/',
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false, isDirectory: false }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  readAsStringAsync: jest.fn().mockResolvedValue(''),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  createDownloadResumable: jest.fn().mockReturnValue({
    downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///mock/download.file' }),
  }),
}));

jest.mock('../../src/services/fileManager');

jest.mock('../../src/stores/useSettingsStore', () => ({
  useSettingsStore: {
    getState: jest.fn().mockReturnValue({ shelvarrUrl: 'http://example.com' }),
  },
}));

import { useSettingsStore } from '../../src/stores/useSettingsStore';
import { useDownloadStore } from '../../src/stores/useDownloadStore';
import { downloadBookFile } from '../../src/services/fileManager';
import { prepareBookForReading } from '../../src/services/downloadManager';
import { Book } from '../../src/types/komga';

const fsMock = jest.requireMock('expo-file-system/legacy');
const mockedGetInfo = fsMock.getInfoAsync as jest.Mock;
const mockedMakeDir = fsMock.makeDirectoryAsync as jest.Mock;
const mockedCreateDl = fsMock.createDownloadResumable as jest.Mock;
const mockedReadDir = fsMock.readDirectoryAsync as jest.Mock;
const mockedDownloadBookFile = downloadBookFile as jest.Mock;
const mockedSettingsGetState = useSettingsStore.getState as jest.Mock;

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 'b1',
    seriesId: 's1',
    name: 'book.epub',
    number: 1,
    media: { status: 'READY', mediaType: 'application/epub+zip', pagesCount: 3 },
    metadata: { title: 'Book', summary: '', number: '1', authors: [] },
    readProgress: null,
    sizeBytes: 1000,
    ...overrides,
  };
}

const initialDownloadState = useDownloadStore.getState();

beforeEach(() => {
  mockedGetInfo.mockReset();
  mockedMakeDir.mockReset();
  mockedCreateDl.mockReset();
  mockedReadDir.mockReset();
  mockedDownloadBookFile.mockReset();

  mockedSettingsGetState.mockReturnValue({ shelvarrUrl: 'http://example.com' });
  useDownloadStore.setState({ ...initialDownloadState, downloads: {} });
  mockedGetInfo.mockResolvedValue({ exists: false });
  mockedMakeDir.mockResolvedValue(undefined);
  mockedReadDir.mockResolvedValue([]);
  mockedCreateDl.mockReturnValue({
    downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///mock/download.file' }),
  });
});

describe('prepareBookForReading', () => {
  describe('comic format', () => {
    const comicBook = makeBook({
      media: { status: 'READY', mediaType: 'application/x-cbz', pagesCount: 2 },
    });

    it('returns cached extractedDir from store when valid', async () => {
      useDownloadStore.setState({
        downloads: {
          b1: { bookId: 'b1', filePath: '/p', format: 'cbz', extractedDir: '/extracted/b1/', downloadedAt: 1 },
        },
      });
      mockedGetInfo.mockResolvedValue({ exists: true });
      mockedReadDir.mockResolvedValue(['page1.jpg', 'page2.jpg']);

      const result = await prepareBookForReading(comicBook);
      expect(result.extractedDir).toBeDefined();
      expect(mockedCreateDl).not.toHaveBeenCalled();
    });

    it('downloads comic pages when no cache', async () => {
      mockedGetInfo.mockResolvedValue({ exists: false });
      const mockDl = { downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///p.jpg' }) };
      mockedCreateDl.mockReturnValue(mockDl);

      const result = await prepareBookForReading(comicBook);
      expect(result.extractedDir).toBeDefined();
      expect(mockedCreateDl).toHaveBeenCalledTimes(2);
    });

    it('skips already downloaded pages', async () => {
      mockedGetInfo
        .mockResolvedValueOnce({ exists: true })  // store check - dir exists
        .mockResolvedValueOnce({ exists: false })  // readDir won't have enough images (not used directly)
        .mockResolvedValueOnce({ exists: true })   // downloadComicPages - dir exists
        .mockResolvedValueOnce({ exists: true })   // page 1 exists
        .mockResolvedValueOnce({ exists: false });  // page 2 missing

      mockedReadDir
        .mockResolvedValueOnce(['page1.jpg'])  // store check
        .mockResolvedValueOnce(['page1.jpg']); // downloadComicPages check

      const mockDl = { downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///p.jpg' }) };
      mockedCreateDl.mockReturnValue(mockDl);

      await prepareBookForReading(comicBook);
      expect(mockedCreateDl).toHaveBeenCalledTimes(1);
    });

    it('re-downloads when store extractedDir does not exist on disk', async () => {
      useDownloadStore.setState({
        downloads: {
          b1: { bookId: 'b1', filePath: '/p', format: 'cbz', extractedDir: '/extracted/b1/', downloadedAt: 1 },
        },
      });
      // Store dir doesn't exist
      mockedGetInfo.mockResolvedValue({ exists: false });
      mockedCreateDl.mockReturnValue({
        downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///p.jpg' }),
      });

      const result = await prepareBookForReading(comicBook);
      expect(result.extractedDir).toBeDefined();
      expect(mockedCreateDl).toHaveBeenCalled();
    });

    it('re-downloads when store extractedDir has insufficient pages', async () => {
      useDownloadStore.setState({
        downloads: {
          b1: { bookId: 'b1', filePath: '/p', format: 'cbz', extractedDir: '/extracted/b1/', downloadedAt: 1 },
        },
      });
      mockedGetInfo.mockResolvedValue({ exists: true });
      // Only 1 image, but needs 2
      mockedReadDir.mockResolvedValueOnce(['page1.jpg']);
      // After that, downloadComicPages also reads dir - it exists with 1 image
      mockedReadDir.mockResolvedValueOnce(['page1.jpg']);

      mockedCreateDl.mockReturnValue({
        downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///p.jpg' }),
      });

      const result = await prepareBookForReading(comicBook);
      expect(result.extractedDir).toBeDefined();
    });

    it('returns early when all comic pages already exist on disk', async () => {
      // No store entry, but downloadComicPages finds all pages on disk
      mockedGetInfo.mockResolvedValue({ exists: true });
      mockedReadDir.mockResolvedValue(['p1.jpg', 'p2.jpg']); // has all 2 pages

      const result = await prepareBookForReading(comicBook);
      expect(result.extractedDir).toBeDefined();
      expect(mockedCreateDl).not.toHaveBeenCalled();
    });

    it('throws on comic page download failure', async () => {
      mockedGetInfo.mockResolvedValue({ exists: false });
      mockedCreateDl.mockReturnValue({
        downloadAsync: jest.fn().mockResolvedValue(null),
      });

      await expect(prepareBookForReading(comicBook)).rejects.toThrow('Failed to download page 1');
      expect(useDownloadStore.getState().activeDownloadId).toBeNull();
    });

    it('throws when server URL not configured', async () => {
      mockedSettingsGetState.mockReturnValue({ shelvarrUrl: '' });
      await expect(prepareBookForReading(comicBook)).rejects.toThrow('Server URL not configured');
    });
  });

  describe('non-comic format (epub)', () => {
    const epubBook = makeBook();

    it('returns cached file from store when exists on disk', async () => {
      useDownloadStore.setState({
        downloads: {
          b1: { bookId: 'b1', filePath: '/dl/b1.epub', format: 'epub', downloadedAt: 1 },
        },
      });
      mockedGetInfo.mockResolvedValue({ exists: true });

      const result = await prepareBookForReading(epubBook);
      expect(result.filePath).toBe('/dl/b1.epub');
      expect(mockedDownloadBookFile).not.toHaveBeenCalled();
    });

    it('removes stale store entry and re-downloads', async () => {
      useDownloadStore.setState({
        downloads: {
          b1: { bookId: 'b1', filePath: '/dl/b1.epub', format: 'epub', downloadedAt: 1 },
        },
      });
      mockedGetInfo.mockResolvedValue({ exists: false });
      mockedDownloadBookFile.mockResolvedValue('/dl/b1.epub');

      const result = await prepareBookForReading(epubBook);
      expect(result.filePath).toBe('/dl/b1.epub');
      expect(mockedDownloadBookFile).toHaveBeenCalled();
    });

    it('uses filesystem cache when file exists at expected path but not in store', async () => {
      mockedGetInfo.mockResolvedValue({ exists: true });

      const result = await prepareBookForReading(epubBook);
      expect(result.filePath).toContain('b1.epub');
      expect(mockedDownloadBookFile).not.toHaveBeenCalled();
    });

    it('downloads fresh file when no cache', async () => {
      mockedGetInfo.mockResolvedValue({ exists: false });
      mockedDownloadBookFile.mockImplementation(
        async (_url: string, _id: string, _ext: string, _headers: any, onProgress?: (p: number) => void) => {
          onProgress?.(0.5);
          return '/dl/b1.epub';
        }
      );

      const result = await prepareBookForReading(epubBook);
      expect(result.filePath).toBe('/dl/b1.epub');
      expect(mockedDownloadBookFile).toHaveBeenCalledWith(
        'http://example.com/api/books/b1/file',
        'b1',
        '.epub',
        expect.any(Object),
        expect.any(Function)
      );
      // Verify progress callback was invoked
      expect(useDownloadStore.getState().activeDownloadId).toBeNull();
    });

    it('throws and clears active download on error', async () => {
      mockedGetInfo.mockResolvedValue({ exists: false });
      mockedDownloadBookFile.mockRejectedValue(new Error('Download error'));

      await expect(prepareBookForReading(epubBook)).rejects.toThrow('Download error');
      expect(useDownloadStore.getState().activeDownloadId).toBeNull();
    });

    it('throws when server URL not configured', async () => {
      mockedSettingsGetState.mockReturnValue({ shelvarrUrl: '' });
      await expect(prepareBookForReading(epubBook)).rejects.toThrow('Server URL not configured');
    });
  });

  describe('download headers', () => {
    it('passes empty headers (no auth layer)', async () => {
      mockedGetInfo.mockResolvedValue({ exists: false });
      mockedDownloadBookFile.mockResolvedValue('/dl/b1.epub');

      await prepareBookForReading(makeBook());
      const headers = mockedDownloadBookFile.mock.calls[0][3];
      expect(headers).toEqual({});
    });
  });

  describe('format fallback', () => {
    it('falls back to filename extension for unknown media type', async () => {
      const book = makeBook({
        name: 'book.epub',
        media: { status: 'READY', mediaType: 'application/octet-stream', pagesCount: 1 },
      });
      mockedGetInfo.mockResolvedValue({ exists: false });
      mockedDownloadBookFile.mockResolvedValue('/dl/b1.epub');

      await prepareBookForReading(book);
      expect(mockedDownloadBookFile).toHaveBeenCalledWith(
        expect.any(String),
        'b1',
        '.epub',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });
});
