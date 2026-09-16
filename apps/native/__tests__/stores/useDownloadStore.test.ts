import { useDownloadStore } from '../../src/stores/useDownloadStore';
import { DownloadedBook } from '../../src/types/api';
import { getInfoAsync, readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy';

const mockGetInfo = getInfoAsync as jest.Mock;
const mockReadString = readAsStringAsync as jest.Mock;
const mockWriteString = writeAsStringAsync as jest.Mock;

const initialState = useDownloadStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  useDownloadStore.setState({ ...initialState, downloads: {}, hydrated: false });
  mockGetInfo.mockResolvedValue({ exists: false });
  mockReadString.mockResolvedValue('');
  mockWriteString.mockResolvedValue(undefined);
});

const makeBook = (bookId: string): DownloadedBook => ({
  bookId,
  filePath: `/path/${bookId}.epub`,
  format: 'epub',
  downloadedAt: Date.now(),
});

describe('useDownloadStore', () => {
  describe('setDownload', () => {
    it('adds a download to the map', () => {
      const book = makeBook('b1');
      useDownloadStore.getState().setDownload('b1', book);
      expect(useDownloadStore.getState().downloads['b1']).toEqual(book);
    });

    it('adds multiple downloads', () => {
      useDownloadStore.getState().setDownload('b1', makeBook('b1'));
      useDownloadStore.getState().setDownload('b2', makeBook('b2'));
      expect(Object.keys(useDownloadStore.getState().downloads)).toHaveLength(2);
    });
  });

  describe('removeDownload', () => {
    it('removes a download from the map', () => {
      useDownloadStore.getState().setDownload('b1', makeBook('b1'));
      useDownloadStore.getState().setDownload('b2', makeBook('b2'));
      useDownloadStore.getState().removeDownload('b1');
      expect(useDownloadStore.getState().downloads['b1']).toBeUndefined();
      expect(useDownloadStore.getState().downloads['b2']).toBeDefined();
    });

    it('handles removing non-existent download', () => {
      useDownloadStore.getState().removeDownload('nonexistent');
      expect(useDownloadStore.getState().downloads).toEqual({});
    });
  });

  describe('touchLastRead', () => {
    it('stamps the entry and persists it', () => {
      useDownloadStore.getState().setDownload('b1', makeBook('b1'));
      useDownloadStore.getState().touchLastRead('b1', 12345);
      expect(useDownloadStore.getState().downloads['b1'].lastReadAt).toBe(12345);
      expect(mockWriteString).toHaveBeenCalledTimes(2);
    });

    it('defaults to now', () => {
      useDownloadStore.getState().setDownload('b1', makeBook('b1'));
      const before = Date.now();
      useDownloadStore.getState().touchLastRead('b1');
      expect(useDownloadStore.getState().downloads['b1'].lastReadAt).toBeGreaterThanOrEqual(before);
    });

    it('ignores a book that was never downloaded', () => {
      useDownloadStore.getState().touchLastRead('nope');
      expect(useDownloadStore.getState().downloads).toEqual({});
      expect(mockWriteString).not.toHaveBeenCalled();
    });
  });

  describe('clearDownloads', () => {
    it('empties the map and persists it', () => {
      useDownloadStore.getState().setDownload('b1', makeBook('b1'));
      useDownloadStore.getState().clearDownloads();
      expect(useDownloadStore.getState().downloads).toEqual({});
      expect(mockWriteString).toHaveBeenLastCalledWith(expect.any(String), '{}');
    });
  });

  describe('loadDownloads', () => {
    it('keeps a download recorded while it was still reading', () => {
      // Hydration is kicked off unawaited at startup. A book opened before it
      // lands must not be dropped when the older manifest arrives.
      mockGetInfo.mockResolvedValue({ exists: true });
      mockReadString.mockResolvedValue(JSON.stringify({ b1: makeBook('b1') }));

      const hydrating = useDownloadStore.getState().loadDownloads();
      useDownloadStore.getState().setDownload('b2', makeBook('b2'));

      return hydrating.then(() => {
        const { downloads } = useDownloadStore.getState();
        expect(downloads['b1']).toBeDefined();
        expect(downloads['b2']).toBeDefined();
      });
    });

    it('reads the manifest once when called twice in a row', async () => {
      mockGetInfo.mockResolvedValue({ exists: true });
      mockReadString.mockResolvedValue(JSON.stringify({ b1: makeBook('b1') }));

      await Promise.all([
        useDownloadStore.getState().loadDownloads(),
        useDownloadStore.getState().loadDownloads(),
      ]);

      expect(mockReadString).toHaveBeenCalledTimes(1);
    });

    it('returns early once hydrated', async () => {
      useDownloadStore.setState({ hydrated: true });
      await useDownloadStore.getState().loadDownloads();
      expect(mockGetInfo).not.toHaveBeenCalled();
    });

    it('marks hydrated when no manifest exists', async () => {
      mockGetInfo.mockResolvedValue({ exists: false });
      await useDownloadStore.getState().loadDownloads();
      expect(useDownloadStore.getState().hydrated).toBe(true);
      expect(useDownloadStore.getState().downloads).toEqual({});
    });

    it('falls back to an empty map when the manifest parses to null', async () => {
      mockGetInfo.mockResolvedValue({ exists: true });
      mockReadString.mockResolvedValue('null');
      await useDownloadStore.getState().loadDownloads();
      expect(useDownloadStore.getState().downloads).toEqual({});
      expect(useDownloadStore.getState().hydrated).toBe(true);
    });

    it('marks hydrated when reading the manifest throws', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockGetInfo.mockResolvedValue({ exists: true });
      mockReadString.mockRejectedValue(new Error('read error'));
      await useDownloadStore.getState().loadDownloads();
      expect(useDownloadStore.getState().hydrated).toBe(true);
    });
  });

  describe('persisting', () => {
    it('warns rather than throwing when the manifest cannot be written', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockWriteString.mockRejectedValue(new Error('disk full'));

      useDownloadStore.getState().setDownload('b1', makeBook('b1'));
      await Promise.resolve();
      await Promise.resolve();

      expect(warn).toHaveBeenCalledWith(
        'Failed to persist downloads manifest:',
        expect.any(Error)
      );
      // The in-memory entry stands: the file is on disk either way.
      expect(useDownloadStore.getState().downloads['b1']).toBeDefined();
    });
  });

  describe('setActiveDownload', () => {
    it('sets active download id and progress', () => {
      useDownloadStore.getState().setActiveDownload('b1', 0.5);
      const state = useDownloadStore.getState();
      expect(state.activeDownloadId).toBe('b1');
      expect(state.progress).toBe(0.5);
    });

    it('defaults progress to 0', () => {
      useDownloadStore.getState().setActiveDownload('b1');
      expect(useDownloadStore.getState().progress).toBe(0);
    });

    it('sets null to clear active download', () => {
      useDownloadStore.getState().setActiveDownload('b1', 0.5);
      useDownloadStore.getState().setActiveDownload(null);
      const state = useDownloadStore.getState();
      expect(state.activeDownloadId).toBeNull();
      expect(state.progress).toBe(0);
    });
  });
});
