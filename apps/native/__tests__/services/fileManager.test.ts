jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock-document-dir/',
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false, isDirectory: false }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  readAsStringAsync: jest.fn().mockResolvedValue(''),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  createDownloadResumable: jest.fn().mockReturnValue({
    downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///mock/download.file' }),
  }),
}));

import {
  ensureDirectories,
  downloadBookFile,
  deleteBookFiles,
  listExtractedFiles,
  cleanAllDownloads,
  readExtractedPageCount,
} from '../../src/services/fileManager';

const fsMock = jest.requireMock('expo-file-system/legacy');
const mockedGetInfo = fsMock.getInfoAsync as jest.Mock;
const mockedMakeDir = fsMock.makeDirectoryAsync as jest.Mock;
const mockedDelete = fsMock.deleteAsync as jest.Mock;
const mockedReadDir = fsMock.readDirectoryAsync as jest.Mock;
const mockedCreateDl = fsMock.createDownloadResumable as jest.Mock;
const mockedMove = fsMock.moveAsync as jest.Mock;
const mockedReadAs = fsMock.readAsStringAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

/** The shape expo's download-progress callback is invoked with. */
type ProgressCallback = (progress: {
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
}) => void;

describe('ensureDirectories', () => {
  it('creates directories that do not exist', async () => {
    mockedGetInfo.mockResolvedValue({ exists: false });
    await ensureDirectories();
    expect(mockedMakeDir).toHaveBeenCalledTimes(2);
    expect(mockedMakeDir).toHaveBeenCalledWith(expect.any(String), { intermediates: true });
  });

  it('skips directories that already exist', async () => {
    mockedGetInfo.mockResolvedValue({ exists: true });
    await ensureDirectories();
    expect(mockedMakeDir).not.toHaveBeenCalled();
  });
});

describe('downloadBookFile', () => {
  it('downloads to a sidecar, moves it into place and returns the final path', async () => {
    mockedGetInfo.mockResolvedValue({ exists: true }); // ensureDirectories pass
    const mockDl = {
      downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///dl/b1.epub.part', status: 200 }),
    };
    mockedCreateDl.mockReturnValue(mockDl);

    const result = await downloadBookFile(
      'http://example.com/file',
      'b1',
      '.epub',
      { Authorization: 'Basic abc' }
    );
    expect(result).toMatch(/b1\.epub$/);
    expect(result).not.toMatch(/\.part$/);
    expect(mockedCreateDl).toHaveBeenCalledWith(
      'http://example.com/file',
      expect.stringContaining('b1.epub.part'),
      { headers: { Authorization: 'Basic abc' } },
      expect.any(Function)
    );
    expect(mockedMove).toHaveBeenCalledWith({
      from: 'file:///dl/b1.epub.part',
      to: expect.stringContaining('b1.epub'),
    });
  });

  it('leaves nothing behind when the download throws partway', async () => {
    mockedGetInfo.mockResolvedValue({ exists: true });
    const mockDl = {
      downloadAsync: jest.fn().mockRejectedValue(new Error('Network request failed')),
    };
    mockedCreateDl.mockReturnValue(mockDl);

    await expect(
      downloadBookFile('http://example.com/file', 'b1', '.epub', {})
    ).rejects.toThrow('Network request failed');

    // The truncated sidecar is cleaned up, and nothing was moved into the
    // place the cache check looks at.
    expect(mockedDelete).toHaveBeenCalledWith(
      expect.stringContaining('b1.epub.part'),
      { idempotent: true }
    );
    expect(mockedMove).not.toHaveBeenCalled();
  });

  it('calls onProgress callback', async () => {
    mockedGetInfo.mockResolvedValue({ exists: true });
    const onProgress = jest.fn();
    let progressCallback: ProgressCallback;
    mockedCreateDl.mockImplementation((_url: string, _path: string, _opts: any, cb: ProgressCallback) => {
      progressCallback = cb;
      return {
        downloadAsync: jest.fn().mockImplementation(async () => {
          progressCallback!({ totalBytesWritten: 50, totalBytesExpectedToWrite: 100 });
          return { uri: 'file:///dl/b.epub.part', status: 200 };
        }),
      };
    });

    await downloadBookFile('http://example.com/file', 'b1', '.epub', {}, onProgress);
    expect(onProgress).toHaveBeenCalledWith(0.5);
  });

  it('reports 0 progress when the expected size is unknown (no Content-Length)', async () => {
    mockedGetInfo.mockResolvedValue({ exists: true });
    const onProgress = jest.fn();
    mockedCreateDl.mockImplementation((_url: string, _path: string, _opts: any, cb: ProgressCallback) => ({
      downloadAsync: jest.fn().mockImplementation(async () => {
        // expo reports -1 when the server omits Content-Length
        cb({ totalBytesWritten: 12967268, totalBytesExpectedToWrite: -1 });
        return { uri: 'file:///dl/b.epub.part', status: 200 };
      }),
    }));

    await downloadBookFile('http://example.com/file', 'b1', '.epub', {}, onProgress);
    expect(onProgress).toHaveBeenCalledWith(0);
    const reported = onProgress.mock.calls.map((c) => c[0]);
    expect(reported.every((p) => p >= 0 && p <= 1)).toBe(true);
  });

  it('throws when download returns null', async () => {
    mockedGetInfo.mockResolvedValue({ exists: true });
    const mockDl = { downloadAsync: jest.fn().mockResolvedValue(null) };
    mockedCreateDl.mockReturnValue(mockDl);

    await expect(
      downloadBookFile('http://example.com/file', 'b1', '.epub', {})
    ).rejects.toThrow('Download failed');
  });
});

describe('deleteBookFiles', () => {
  it('deletes file, sidecar and directory when they exist', async () => {
    mockedGetInfo.mockResolvedValue({ exists: true });
    await deleteBookFiles('b1', '.epub');
    expect(mockedDelete).toHaveBeenCalledTimes(3);
    expect(mockedDelete).toHaveBeenCalledWith(
      expect.stringContaining('b1.epub.part'),
      { idempotent: true }
    );
  });

  it('only clears the sidecar when the files do not exist', async () => {
    mockedGetInfo.mockResolvedValue({ exists: false });
    await deleteBookFiles('b1', '.epub');
    expect(mockedDelete).toHaveBeenCalledTimes(1);
    expect(mockedDelete).toHaveBeenCalledWith(
      expect.stringContaining('b1.epub.part'),
      { idempotent: true }
    );
  });

  it('swallows errors during deletion', async () => {
    mockedGetInfo.mockRejectedValue(new Error('fail'));
    await expect(deleteBookFiles('b1', '.epub')).resolves.toBeUndefined();
  });
});

describe('listExtractedFiles', () => {
  it('returns sorted image files', async () => {
    mockedGetInfo.mockResolvedValue({ exists: true });
    mockedReadDir.mockResolvedValue(['page2.jpg', 'page1.jpg', 'readme.txt', 'img.png']);
    const result = await listExtractedFiles('b1');
    expect(result).toEqual(['img.png', 'page1.jpg', 'page2.jpg']);
  });

  it('returns empty array when directory does not exist', async () => {
    mockedGetInfo.mockResolvedValue({ exists: false });
    const result = await listExtractedFiles('b1');
    expect(result).toEqual([]);
  });
});

describe('readExtractedPageCount', () => {
  it('returns the count recorded when extraction finished', async () => {
    mockedGetInfo.mockResolvedValue({ exists: true });
    mockedReadAs.mockResolvedValue(JSON.stringify({ pages: 24 }));
    await expect(readExtractedPageCount('comic-7')).resolves.toBe(24);
  });

  it('returns null when the marker is missing — a half-extracted directory', async () => {
    mockedGetInfo.mockResolvedValue({ exists: false });
    await expect(readExtractedPageCount('comic-7')).resolves.toBeNull();
  });

  it('returns null when the marker is unreadable or malformed', async () => {
    mockedGetInfo.mockResolvedValue({ exists: true });
    mockedReadAs.mockResolvedValue('not json');
    await expect(readExtractedPageCount('comic-7')).resolves.toBeNull();

    mockedReadAs.mockResolvedValue(JSON.stringify({ pages: 0 }));
    await expect(readExtractedPageCount('comic-7')).resolves.toBeNull();
  });
});

describe('cleanAllDownloads', () => {
  it('deletes both directories', async () => {
    await cleanAllDownloads();
    expect(mockedDelete).toHaveBeenCalledTimes(2);
  });

  it('swallows errors', async () => {
    mockedDelete.mockRejectedValue(new Error('fail'));
    await expect(cleanAllDownloads()).resolves.toBeUndefined();
  });
});
