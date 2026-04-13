import {
  getMediaFormat,
  getFormatFromName,
  getFileExtension,
  isComicFormat,
} from '../../src/utils/fileTypes';

describe('getMediaFormat', () => {
  it.each([
    ['application/epub+zip', 'epub'],
    ['application/pdf', 'pdf'],
    ['application/x-cbz', 'cbz'],
    ['application/zip', 'cbz'],
    ['application/vnd.comicbook+zip', 'cbz'],
    ['application/x-cbr', 'cbr'],
    ['application/x-rar-compressed', 'cbr'],
    ['application/x-rar-compressed;verion=4', 'cbr'],
    ['application/x-rar-compressed;version=4', 'cbr'],
    ['application/x-rar-compressed;version=5', 'cbr'],
    ['application/vnd.comicbook-rar', 'cbr'],
    ['application/vnd.rar', 'cbr'],
    ['application/x-rar', 'cbr'],
  ])('maps %s to %s', (mediaType, expected) => {
    expect(getMediaFormat(mediaType)).toBe(expected);
  });

  it('handles uppercase and whitespace', () => {
    expect(getMediaFormat('  APPLICATION/PDF  ')).toBe('pdf');
  });

  it('strips parameters to find base type match', () => {
    expect(getMediaFormat('application/x-rar-compressed;someParam=foo')).toBe('cbr');
  });

  it('returns unknown for unrecognized media type', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    expect(getMediaFormat('text/plain')).toBe('unknown');
    expect(warnSpy).toHaveBeenCalledWith('Unknown media type:', 'text/plain');
    warnSpy.mockRestore();
  });
});

describe('getFormatFromName', () => {
  it.each([
    ['book.epub', 'epub'],
    ['book.EPUB', 'epub'],
    ['doc.pdf', 'pdf'],
    ['comic.cbz', 'cbz'],
    ['comic.cbr', 'cbr'],
    ['archive.zip', 'cbz'],
    ['archive.rar', 'cbr'],
  ])('infers format from %s', (fileName, expected) => {
    expect(getFormatFromName(fileName)).toBe(expected);
  });

  it('returns unknown for unrecognized extension', () => {
    expect(getFormatFromName('file.txt')).toBe('unknown');
  });
});

describe('getFileExtension', () => {
  it.each([
    ['epub', '.epub'],
    ['pdf', '.pdf'],
    ['cbz', '.cbz'],
    ['cbr', '.cbr'],
    ['unknown', ''],
  ] as const)('returns correct extension for %s', (format, expected) => {
    expect(getFileExtension(format)).toBe(expected);
  });
});

describe('isComicFormat', () => {
  it('returns true for cbz', () => {
    expect(isComicFormat('cbz')).toBe(true);
  });

  it('returns true for cbr', () => {
    expect(isComicFormat('cbr')).toBe(true);
  });

  it('returns false for non-comic formats', () => {
    expect(isComicFormat('epub')).toBe(false);
    expect(isComicFormat('pdf')).toBe(false);
    expect(isComicFormat('unknown')).toBe(false);
  });
});
