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

import {
  ensureDirectories,
  downloadBookFile,
  deleteBookFiles,
  listExtractedFiles,
  cleanAllDownloads,
} from '../../src/services/fileManager';

const fsMock = jest.requireMock('expo-file-system/legacy');
const mockedGetInfo = fsMock.getInfoAsync as jest.Mock;
const mockedMakeDir = fsMock.makeDirectoryAsync as jest.Mock;
const mockedDelete = fsMock.deleteAsync as jest.Mock;
const mockedReadDir = fsMock.readDirectoryAsync as jest.Mock;
const mockedCreateDl = fsMock.createDownloadResumable as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

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
  it('downloads a file and returns its URI', async () => {
    mockedGetInfo.mockResolvedValue({ exists: true }); // ensureDirectories pass
    const mockDl = { downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///dl/book.epub' }) };
    mockedCreateDl.mockReturnValue(mockDl);

    const result = await downloadBookFile(
      'http://example.com/file',
      'b1',
      '.epub',
      { Authorization: 'Basic abc' }
    );
    expect(result).toBe('file:///dl/book.epub');
    expect(mockedCreateDl).toHaveBeenCalledWith(
      'http://example.com/file',
      expect.stringContaining('b1.epub'),
      { headers: { Authorization: 'Basic abc' } },
      expect.any(Function)
    );
  });

  it('calls onProgress callback', async () => {
    mockedGetInfo.mockResolvedValue({ exists: true });
    const onProgress = jest.fn();
    let progressCallback: Function;
    mockedCreateDl.mockImplementation((_url: string, _path: string, _opts: any, cb: Function) => {
      progressCallback = cb;
      return {
        downloadAsync: jest.fn().mockImplementation(async () => {
          progressCallback!({ totalBytesWritten: 50, totalBytesExpectedToWrite: 100 });
          return { uri: 'file:///dl/b.epub' };
        }),
      };
    });

    await downloadBookFile('http://example.com/file', 'b1', '.epub', {}, onProgress);
    expect(onProgress).toHaveBeenCalledWith(0.5);
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
  it('deletes file and directory when they exist', async () => {
    mockedGetInfo.mockResolvedValue({ exists: true });
    await deleteBookFiles('b1', '.epub');
    expect(mockedDelete).toHaveBeenCalledTimes(2);
  });

  it('skips deletion when files do not exist', async () => {
    mockedGetInfo.mockResolvedValue({ exists: false });
    await deleteBookFiles('b1', '.epub');
    expect(mockedDelete).not.toHaveBeenCalled();
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
