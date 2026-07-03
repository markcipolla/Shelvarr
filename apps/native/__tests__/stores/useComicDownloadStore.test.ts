import { useComicDownloadStore, DownloadedComic } from '../../src/stores/useComicDownloadStore';
import { getInfoAsync, readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy';

const mockGetInfo = getInfoAsync as jest.Mock;
const mockReadString = readAsStringAsync as jest.Mock;
const mockWriteString = writeAsStringAsync as jest.Mock;

const initialState = useComicDownloadStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  useComicDownloadStore.setState({ ...initialState, downloads: {}, activeIssueId: null, progress: 0, hydrated: false });
  mockGetInfo.mockResolvedValue({ exists: false });
  mockReadString.mockResolvedValue('');
  mockWriteString.mockResolvedValue(undefined);
});

const makeComic = (issueId: number): DownloadedComic => ({
  issueId,
  volumeId: 1,
  kind: 'images',
  extractedDir: `/e/${issueId}/`,
  totalPages: 3,
  downloadedAt: 1,
});

describe('useComicDownloadStore', () => {
  describe('setDownload', () => {
    it('adds a download and persists the manifest', () => {
      const comic = makeComic(1);
      useComicDownloadStore.getState().setDownload(1, comic);
      expect(useComicDownloadStore.getState().downloads[1]).toEqual(comic);
      expect(mockWriteString).toHaveBeenCalled();
    });

    it('adds multiple downloads', () => {
      useComicDownloadStore.getState().setDownload(1, makeComic(1));
      useComicDownloadStore.getState().setDownload(2, makeComic(2));
      expect(Object.keys(useComicDownloadStore.getState().downloads)).toHaveLength(2);
    });

    it('swallows persistence errors', () => {
      mockWriteString.mockRejectedValueOnce(new Error('disk full'));
      expect(() => useComicDownloadStore.getState().setDownload(1, makeComic(1))).not.toThrow();
    });
  });

  describe('removeDownload', () => {
    it('removes a download from the map', () => {
      useComicDownloadStore.getState().setDownload(1, makeComic(1));
      useComicDownloadStore.getState().setDownload(2, makeComic(2));
      useComicDownloadStore.getState().removeDownload(1);
      expect(useComicDownloadStore.getState().downloads[1]).toBeUndefined();
      expect(useComicDownloadStore.getState().downloads[2]).toBeDefined();
    });

    it('handles removing a non-existent download', () => {
      useComicDownloadStore.getState().removeDownload(999);
      expect(useComicDownloadStore.getState().downloads).toEqual({});
    });
  });

  describe('setActiveDownload', () => {
    it('sets active issue id and progress', () => {
      useComicDownloadStore.getState().setActiveDownload(1, 0.5);
      const state = useComicDownloadStore.getState();
      expect(state.activeIssueId).toBe(1);
      expect(state.progress).toBe(0.5);
    });

    it('defaults progress to 0', () => {
      useComicDownloadStore.getState().setActiveDownload(1);
      expect(useComicDownloadStore.getState().progress).toBe(0);
    });

    it('clears the active download with null', () => {
      useComicDownloadStore.getState().setActiveDownload(1, 0.5);
      useComicDownloadStore.getState().setActiveDownload(null);
      const state = useComicDownloadStore.getState();
      expect(state.activeIssueId).toBeNull();
      expect(state.progress).toBe(0);
    });
  });

  describe('loadDownloads', () => {
    it('returns early when already hydrated', async () => {
      useComicDownloadStore.setState({ hydrated: true });
      await useComicDownloadStore.getState().loadDownloads();
      expect(mockGetInfo).not.toHaveBeenCalled();
    });

    it('marks hydrated when no manifest exists', async () => {
      mockGetInfo.mockResolvedValue({ exists: false });
      await useComicDownloadStore.getState().loadDownloads();
      expect(useComicDownloadStore.getState().hydrated).toBe(true);
      expect(useComicDownloadStore.getState().downloads).toEqual({});
    });

    it('loads and parses an existing manifest', async () => {
      mockGetInfo.mockResolvedValue({ exists: true });
      mockReadString.mockResolvedValue(JSON.stringify({ 1: makeComic(1) }));
      await useComicDownloadStore.getState().loadDownloads();
      expect(useComicDownloadStore.getState().downloads[1]).toEqual(makeComic(1));
      expect(useComicDownloadStore.getState().hydrated).toBe(true);
    });

    it('falls back to an empty map when the manifest parses to null', async () => {
      mockGetInfo.mockResolvedValue({ exists: true });
      mockReadString.mockResolvedValue('null');
      await useComicDownloadStore.getState().loadDownloads();
      expect(useComicDownloadStore.getState().downloads).toEqual({});
      expect(useComicDownloadStore.getState().hydrated).toBe(true);
    });

    it('marks hydrated when reading the manifest throws', async () => {
      mockGetInfo.mockResolvedValue({ exists: true });
      mockReadString.mockRejectedValue(new Error('read error'));
      await useComicDownloadStore.getState().loadDownloads();
      expect(useComicDownloadStore.getState().hydrated).toBe(true);
    });
  });
});
