export const documentDirectory = 'file:///mock-document-dir/';

export const EncodingType = {
  UTF8: 'utf8',
  Base64: 'base64',
};

export const getInfoAsync = jest.fn().mockResolvedValue({ exists: false, isDirectory: false });
export const makeDirectoryAsync = jest.fn().mockResolvedValue(undefined);
export const deleteAsync = jest.fn().mockResolvedValue(undefined);
export const readDirectoryAsync = jest.fn().mockResolvedValue([]);
export const readAsStringAsync = jest.fn().mockResolvedValue('');
export const writeAsStringAsync = jest.fn().mockResolvedValue(undefined);

const mockDownloadResumable = {
  downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///mock/download.file' }),
};
export const createDownloadResumable = jest.fn().mockReturnValue(mockDownloadResumable);
