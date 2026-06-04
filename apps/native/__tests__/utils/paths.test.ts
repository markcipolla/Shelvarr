jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock-document-dir/',
}));

import {
  getDownloadsDir,
  getExtractedDir,
  getBookDownloadPath,
  getBookExtractDir,
} from '../../src/utils/paths';

describe('paths', () => {
  it('getDownloadsDir returns correct path', () => {
    expect(getDownloadsDir()).toBe('file:///mock-document-dir/shelvarr-downloads/');
  });

  it('getExtractedDir returns correct path', () => {
    expect(getExtractedDir()).toBe('file:///mock-document-dir/shelvarr-extracted/');
  });

  it('getBookDownloadPath returns correct path', () => {
    expect(getBookDownloadPath('book123', '.epub')).toBe(
      'file:///mock-document-dir/shelvarr-downloads/book123.epub'
    );
  });

  it('getBookExtractDir returns correct path', () => {
    expect(getBookExtractDir('book123')).toBe(
      'file:///mock-document-dir/shelvarr-extracted/book123/'
    );
  });
});
