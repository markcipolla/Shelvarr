jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock-document-dir/',
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  readAsStringAsync: jest.fn().mockResolvedValue('base64data'),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('jszip');

import JSZip from 'jszip';
import { extractComicArchive } from '../../src/services/fileManager';

const fsMock = jest.requireMock('expo-file-system/legacy');
const mockedGetInfo = fsMock.getInfoAsync as jest.Mock;
const mockedMakeDir = fsMock.makeDirectoryAsync as jest.Mock;
const mockedReadAs = fsMock.readAsStringAsync as jest.Mock;
const mockedWriteAs = fsMock.writeAsStringAsync as jest.Mock;

const JSZipMock = JSZip as jest.Mocked<typeof JSZip>;

function makeZipEntry(name: string, data: string) {
  return {
    name,
    dir: false,
    async: jest.fn().mockResolvedValue(data),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetInfo.mockResolvedValue({ exists: false });
});

describe('extractComicArchive', () => {
  it('extracts image entries sorted by name and writes them zero-padded', async () => {
    const entries = {
      'page003.jpg': makeZipEntry('page003.jpg', 'img3'),
      'page001.jpg': makeZipEntry('page001.jpg', 'img1'),
      'page002.png': makeZipEntry('page002.png', 'img2'),
      'README.txt': { name: 'README.txt', dir: false, async: jest.fn().mockResolvedValue('text') },
    };

    (JSZipMock.loadAsync as jest.Mock).mockResolvedValue({ files: entries });
    mockedReadAs.mockResolvedValue('archiveBase64');

    const result = await extractComicArchive('/path/to/file.cbz', 'comic-42');

    expect(result.pageCount).toBe(3);
    expect(result.dir).toMatch(/comic-42/);

    // Should have written 3 image files (not the txt)
    expect(mockedWriteAs).toHaveBeenCalledTimes(3);

    // First call should be 00000.jpg (sorted: page001.jpg)
    const firstCall = mockedWriteAs.mock.calls[0];
    expect(firstCall[0]).toMatch(/00000\.jpg$/);

    const secondCall = mockedWriteAs.mock.calls[1];
    expect(secondCall[0]).toMatch(/00001\.png$/);

    const thirdCall = mockedWriteAs.mock.calls[2];
    expect(thirdCall[0]).toMatch(/00002\.jpg$/);
  });

  it('creates the extract directory if it does not exist', async () => {
    (JSZipMock.loadAsync as jest.Mock).mockResolvedValue({ files: {} });
    mockedGetInfo.mockResolvedValue({ exists: false });

    await extractComicArchive('/path/to/file.cbz', 'comic-99');

    expect(mockedMakeDir).toHaveBeenCalledWith(
      expect.stringContaining('comic-99'),
      { intermediates: true }
    );
  });

  it('skips directory creation when extract dir already exists', async () => {
    (JSZipMock.loadAsync as jest.Mock).mockResolvedValue({ files: {} });
    mockedGetInfo.mockResolvedValue({ exists: true });

    await extractComicArchive('/path/to/file.cbz', 'comic-99');

    expect(mockedMakeDir).not.toHaveBeenCalled();
  });

  it('returns pageCount 0 when zip has no image entries', async () => {
    (JSZipMock.loadAsync as jest.Mock).mockResolvedValue({
      files: {
        'meta.xml': { name: 'meta.xml', dir: false, async: jest.fn() },
      },
    });

    const result = await extractComicArchive('/path/to/file.cbz', 'comic-0');
    expect(result.pageCount).toBe(0);
    expect(mockedWriteAs).not.toHaveBeenCalled();
  });

  it('skips directory entries', async () => {
    (JSZipMock.loadAsync as jest.Mock).mockResolvedValue({
      files: {
        'images/': { name: 'images/', dir: true, async: jest.fn() },
        'images/p1.jpg': makeZipEntry('images/p1.jpg', 'imgdata'),
      },
    });

    const result = await extractComicArchive('/path/to/file.cbz', 'comic-5');
    expect(result.pageCount).toBe(1);
  });
});
