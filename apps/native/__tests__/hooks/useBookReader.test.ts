import { renderHook, act } from '@testing-library/react-native';
import { useBookReader } from '../../src/hooks/useBookReader';
import { useReaderStore } from '../../src/stores/useReaderStore';
import { useSettingsStore } from '../../src/stores/useSettingsStore';
import { useDownloadStore } from '../../src/stores/useDownloadStore';
import { syncProgress, syncComicProgress, flushProgress } from '../../src/services/progressSync';
import { deleteBookFiles } from '../../src/services/fileManager';
import { getFileExtension } from '../../src/utils/fileTypes';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));
jest.mock('../../src/stores/useReaderStore');
jest.mock('../../src/stores/useSettingsStore');
jest.mock('../../src/stores/useDownloadStore');
jest.mock('../../src/services/progressSync');
jest.mock('../../src/services/fileManager');
jest.mock('../../src/utils/fileTypes');

const mockSetPage = jest.fn();
const mockStartReading = jest.fn();
const mockStopReading = jest.fn();
const mockRemoveDownload = jest.fn();

const mockUseReaderStore = useReaderStore as unknown as jest.Mock;
const mockUseSettingsStore = useSettingsStore as unknown as jest.Mock;
const mockUseDownloadStore = useDownloadStore as unknown as jest.Mock;
const mockSyncProgress = syncProgress as jest.Mock;
const mockSyncComicProgress = syncComicProgress as jest.Mock;
const mockFlushProgress = flushProgress as jest.Mock;
const mockDeleteBookFiles = deleteBookFiles as jest.Mock;
const mockGetFileExtension = getFileExtension as jest.Mock;

function setupMocks(opts: { autoDelete?: boolean; download?: any } = {}) {
  const readerState = {
    setPage: mockSetPage,
    startReading: mockStartReading,
    stopReading: mockStopReading,
  };
  mockUseReaderStore.mockImplementation((selector?: any) =>
    selector ? selector(readerState) : readerState
  );
  mockUseSettingsStore.mockImplementation((selector: any) =>
    selector({ autoDeleteAfterReading: opts.autoDelete ?? false })
  );
  const downloadState = {
    downloads: opts.download ? { 'book-1': opts.download } : {},
    removeDownload: mockRemoveDownload,
  };
  mockUseDownloadStore.mockImplementation((selector: any) =>
    selector(downloadState)
  );
  mockFlushProgress.mockResolvedValue(undefined);
  mockDeleteBookFiles.mockResolvedValue(undefined);
  mockGetFileExtension.mockReturnValue('epub');
}

describe('useBookReader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns onPageChange, onReaderExit, startReading', () => {
    setupMocks();
    const { result } = renderHook(() => useBookReader('book-1'));
    expect(result.current.onPageChange).toBeDefined();
    expect(result.current.onReaderExit).toBeDefined();
    expect(result.current.startReading).toBe(mockStartReading);
  });

  it('onPageChange syncs progress for non-completed pages', () => {
    setupMocks();
    const { result } = renderHook(() => useBookReader('book-1'));

    act(() => {
      result.current.onPageChange(5, 100);
    });

    expect(mockSetPage).toHaveBeenCalledWith(5);
    expect(mockSyncProgress).toHaveBeenCalledWith('book-1', 5, false);
    expect(mockFlushProgress).not.toHaveBeenCalled();
  });

  it('onPageChange flushes and syncs on completion', () => {
    setupMocks();
    const { result } = renderHook(() => useBookReader('book-1'));

    act(() => {
      result.current.onPageChange(100, 100);
    });

    expect(mockSetPage).toHaveBeenCalledWith(100);
    expect(mockFlushProgress).toHaveBeenCalledWith('book-1');
    expect(mockSyncProgress).toHaveBeenCalledWith('book-1', 100, true);
    // flushProgress called twice on completion
    expect(mockFlushProgress).toHaveBeenCalledTimes(2);
  });

  it('onPageChange syncs comic progress (with total) for non-completed pages', () => {
    setupMocks();
    const { result } = renderHook(() =>
      useBookReader('comic-11', { kind: 'comic', issueId: 11 })
    );

    act(() => {
      result.current.onPageChange(5, 20);
    });

    expect(mockSetPage).toHaveBeenCalledWith(5);
    expect(mockSyncComicProgress).toHaveBeenCalledWith(11, 5, false, 20);
    expect(mockSyncProgress).not.toHaveBeenCalled();
    expect(mockFlushProgress).not.toHaveBeenCalled();
  });

  it('onPageChange flushes and syncs comic progress on completion', () => {
    setupMocks();
    const { result } = renderHook(() =>
      useBookReader('comic-11', { kind: 'comic', issueId: 11 })
    );

    act(() => {
      result.current.onPageChange(20, 20);
    });

    expect(mockSyncComicProgress).toHaveBeenCalledWith(11, 20, true, 20);
    expect(mockFlushProgress).toHaveBeenCalledWith('comic-11');
    expect(mockFlushProgress).toHaveBeenCalledTimes(2);
  });

  it('onReaderExit flushes progress and stops reading', async () => {
    setupMocks();
    const { result } = renderHook(() => useBookReader('book-1'));

    await act(async () => {
      await result.current.onReaderExit();
    });

    expect(mockFlushProgress).toHaveBeenCalledWith('book-1');
    expect(mockStopReading).toHaveBeenCalled();
  });

  it('onReaderExit auto-deletes when enabled with download', async () => {
    const download = { bookId: 'book-1', format: 'epub', filePath: '/f', downloadedAt: 1 };
    setupMocks({ autoDelete: true, download });
    const { result } = renderHook(() => useBookReader('book-1'));

    await act(async () => {
      await result.current.onReaderExit();
    });

    expect(mockGetFileExtension).toHaveBeenCalledWith('epub');
    expect(mockDeleteBookFiles).toHaveBeenCalledWith('book-1', 'epub');
    expect(mockRemoveDownload).toHaveBeenCalledWith('book-1');
  });

  it('onReaderExit does not auto-delete when disabled', async () => {
    const download = { bookId: 'book-1', format: 'epub', filePath: '/f', downloadedAt: 1 };
    setupMocks({ autoDelete: false, download });
    const { result } = renderHook(() => useBookReader('book-1'));

    await act(async () => {
      await result.current.onReaderExit();
    });

    expect(mockDeleteBookFiles).not.toHaveBeenCalled();
  });

  it('onReaderExit does not auto-delete when no download', async () => {
    setupMocks({ autoDelete: true });
    const { result } = renderHook(() => useBookReader('book-1'));

    await act(async () => {
      await result.current.onReaderExit();
    });

    expect(mockDeleteBookFiles).not.toHaveBeenCalled();
  });

  it('onReaderExit handles delete failure gracefully', async () => {
    const download = { bookId: 'book-1', format: 'epub', filePath: '/f', downloadedAt: 1 };
    setupMocks({ autoDelete: true, download });
    mockDeleteBookFiles.mockRejectedValue(new Error('delete failed'));
    const { result } = renderHook(() => useBookReader('book-1'));

    await act(async () => {
      await result.current.onReaderExit();
    });

    // Should not throw, removeDownload should not be called
    expect(mockRemoveDownload).not.toHaveBeenCalled();
  });
});
