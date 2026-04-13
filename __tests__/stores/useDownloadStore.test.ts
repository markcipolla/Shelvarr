import { useDownloadStore } from '../../src/stores/useDownloadStore';
import { DownloadedBook } from '../../src/types/komga';

const initialState = useDownloadStore.getState();

beforeEach(() => {
  useDownloadStore.setState(initialState);
});

const makeBook = (bookId: string): DownloadedBook => ({
  bookId,
  filePath: `/path/${bookId}.epub`,
  format: 'EPUB',
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
