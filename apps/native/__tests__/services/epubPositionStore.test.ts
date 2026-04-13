jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock-document-dir/',
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  readAsStringAsync: jest.fn().mockResolvedValue(''),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  createDownloadResumable: jest.fn().mockReturnValue({
    downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///mock/download.file' }),
  }),
}));

let getEpubPosition: typeof import('../../src/services/epubPositionStore').getEpubPosition;
let saveEpubPosition: typeof import('../../src/services/epubPositionStore').saveEpubPosition;
let mockedRead: jest.Mock;
let mockedWrite: jest.Mock;

beforeEach(() => {
  jest.resetModules();

  // Get the actual mock that the isolated module will use
  const fsMock = require('expo-file-system/legacy');
  mockedRead = fsMock.readAsStringAsync;
  mockedWrite = fsMock.writeAsStringAsync;
  mockedRead.mockReset();
  mockedWrite.mockReset();
  mockedRead.mockResolvedValue('');
  mockedWrite.mockResolvedValue(undefined);

  // Create isolated module to reset the internal cache
  const mod = require('../../src/services/epubPositionStore');
  getEpubPosition = mod.getEpubPosition;
  saveEpubPosition = mod.saveEpubPosition;
});

describe('getEpubPosition', () => {
  it('returns null when no position saved', async () => {
    mockedRead.mockRejectedValue(new Error('not found'));
    const result = await getEpubPosition('b1');
    expect(result).toBeNull();
  });

  it('reads position from file', async () => {
    const data = { b1: { chapter: 2, page: 5 } };
    mockedRead.mockResolvedValue(JSON.stringify(data));
    const result = await getEpubPosition('b1');
    expect(result).toEqual({ chapter: 2, page: 5 });
  });

  it('returns null for unknown bookId', async () => {
    mockedRead.mockResolvedValue(JSON.stringify({ other: { chapter: 1, page: 1 } }));
    const result = await getEpubPosition('unknown');
    expect(result).toBeNull();
  });

  it('uses cache on subsequent calls', async () => {
    mockedRead.mockResolvedValue(JSON.stringify({ b1: { chapter: 1, page: 1 } }));
    await getEpubPosition('b1');
    await getEpubPosition('b1');
    expect(mockedRead).toHaveBeenCalledTimes(1);
  });
});

describe('saveEpubPosition', () => {
  it('saves position and updates cache', async () => {
    mockedRead.mockRejectedValue(new Error('not found'));
    await saveEpubPosition('b1', 3, 10);
    expect(mockedWrite).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify({ b1: { chapter: 3, page: 10 } })
    );

    // Should use cache now
    const result = await getEpubPosition('b1');
    expect(result).toEqual({ chapter: 3, page: 10 });
    expect(mockedRead).toHaveBeenCalledTimes(1); // not called again
  });

  it('preserves existing entries when saving', async () => {
    mockedRead.mockResolvedValue(JSON.stringify({ b1: { chapter: 1, page: 1 } }));
    await saveEpubPosition('b2', 5, 20);
    const written = JSON.parse(mockedWrite.mock.calls[0][1]);
    expect(written.b1).toEqual({ chapter: 1, page: 1 });
    expect(written.b2).toEqual({ chapter: 5, page: 20 });
  });
});
