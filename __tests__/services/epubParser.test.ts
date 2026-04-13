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

import JSZip from 'jszip';
import { parseEpub } from '../../src/services/epubParser';

const fsMock = jest.requireMock('expo-file-system/legacy');
const mockedReadString = fsMock.readAsStringAsync as jest.Mock;

const containerXml = `<?xml version="1.0"?>
<container>
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

const opfXml = `<?xml version="1.0"?>
<package>
  <metadata>
    <dc:title>Test Book</dc:title>
  </metadata>
  <manifest>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
    <item id="img1" href="images/cover.jpg" media-type="image/jpeg"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>`;

const opfXmlAltOrder = `<?xml version="1.0"?>
<package>
  <metadata>
    <dc:title>Alt Book</dc:title>
  </metadata>
  <manifest>
    <item href="chapterA.xhtml" id="chA" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chA"/>
  </spine>
</package>`;

const ncxXml = `<?xml version="1.0"?>
<ncx>
  <navMap>
    <navPoint id="np1">
      <navLabel><text>Introduction</text></navLabel>
      <content src="chapter1.xhtml#start"/>
    </navPoint>
    <navPoint id="np2">
      <navLabel><text>  Chapter Two  </text></navLabel>
      <content src="chapter2.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`;

const ch1Html = '<html><body><img src="../images/cover.jpg"/><p>Ch1</p></body></html>';
const ch2Html = '<html><body><img src="images/cover.jpg"/><p>Ch2</p></body></html>';

function setupZipMock(files: Record<string, { text?: string; base64?: string } | null>) {
  const mockZip = {
    file: jest.fn((path: string) => {
      const entry = files[path];
      if (entry === null || entry === undefined) return null;
      return {
        async: jest.fn((type: string) => {
          if (type === 'text') return Promise.resolve(entry.text ?? '');
          if (type === 'base64') return Promise.resolve(entry.base64 ?? '');
          return Promise.resolve('');
        }),
      };
    }),
  };
  (JSZip.loadAsync as jest.Mock).mockResolvedValue(mockZip);
  return mockZip;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedReadString.mockResolvedValue('base64data');
});

describe('parseEpub', () => {
  it('parses a complete EPUB with chapters, images, and NCX titles', async () => {
    setupZipMock({
      'META-INF/container.xml': { text: containerXml },
      'OEBPS/content.opf': { text: opfXml },
      'OEBPS/chapter1.xhtml': { text: ch1Html },
      'OEBPS/chapter2.xhtml': { text: ch2Html },
      'OEBPS/images/cover.jpg': { base64: 'abc123' },
      'OEBPS/toc.ncx': { text: ncxXml },
    });

    const result = await parseEpub('/path/to/book.epub', 'b1');
    expect(result.title).toBe('Test Book');
    expect(result.chapters).toHaveLength(2);
    expect(result.basePath).toBe('OEBPS/');
    expect(result.imageMap['images/cover.jpg']).toBe('data:image/jpeg;base64,abc123');

    // NCX titles should be applied
    expect(result.chapters[0].title).toBe('Introduction');
    expect(result.chapters[1].title).toBe('Chapter Two');
  });

  it('resolves relative image paths in chapter HTML', async () => {
    setupZipMock({
      'META-INF/container.xml': { text: containerXml },
      'OEBPS/content.opf': { text: opfXml },
      'OEBPS/chapter1.xhtml': { text: ch1Html },
      'OEBPS/chapter2.xhtml': { text: ch2Html },
      'OEBPS/images/cover.jpg': { base64: 'abc123' },
      'OEBPS/toc.ncx': { text: ncxXml },
    });

    const result = await parseEpub('/path/to/book.epub', 'b1');
    // ch1 has src="../images/cover.jpg" which should resolve
    expect(result.chapters[0].html).toContain('data:image/jpeg;base64,abc123');
    // ch2 has src="images/cover.jpg" which should also resolve
    expect(result.chapters[1].html).toContain('data:image/jpeg;base64,abc123');
  });

  it('handles alternate attribute order in manifest', async () => {
    setupZipMock({
      'META-INF/container.xml': { text: containerXml },
      'OEBPS/content.opf': { text: opfXmlAltOrder },
      'OEBPS/chapterA.xhtml': { text: '<html><body>A</body></html>' },
    });

    const result = await parseEpub('/path/to/book.epub', 'b1');
    expect(result.title).toBe('Alt Book');
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].id).toBe('chA');
  });

  it('throws when container.xml is missing', async () => {
    setupZipMock({
      'META-INF/container.xml': null,
    });

    await expect(parseEpub('/path/to/book.epub', 'b1')).rejects.toThrow(
      'Invalid EPUB: missing container.xml'
    );
  });

  it('throws when no rootfile found', async () => {
    setupZipMock({
      'META-INF/container.xml': { text: '<container><rootfiles></rootfiles></container>' },
    });

    await expect(parseEpub('/path/to/book.epub', 'b1')).rejects.toThrow(
      'Invalid EPUB: no rootfile found'
    );
  });

  it('throws when OPF file is missing', async () => {
    setupZipMock({
      'META-INF/container.xml': { text: containerXml },
      'OEBPS/content.opf': null,
    });

    await expect(parseEpub('/path/to/book.epub', 'b1')).rejects.toThrow(
      'Invalid EPUB: missing OPF file'
    );
  });

  it('handles missing NCX gracefully', async () => {
    const opfNoNcx = `<?xml version="1.0"?>
<package>
  <metadata><dc:title>No NCX</dc:title></metadata>
  <manifest>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="ch1"/></spine>
</package>`;

    setupZipMock({
      'META-INF/container.xml': { text: containerXml },
      'OEBPS/content.opf': { text: opfNoNcx },
      'OEBPS/chapter1.xhtml': { text: '<html><body>Text</body></html>' },
    });

    const result = await parseEpub('/path/to/book.epub', 'b1');
    expect(result.chapters[0].title).toBe('Chapter 1');
  });

  it('handles missing title in OPF', async () => {
    const opfNoTitle = `<?xml version="1.0"?>
<package>
  <metadata></metadata>
  <manifest>
    <item id="ch1" href="ch.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="ch1"/></spine>
</package>`;

    setupZipMock({
      'META-INF/container.xml': { text: containerXml },
      'OEBPS/content.opf': { text: opfNoTitle },
      'OEBPS/ch.xhtml': { text: '<html></html>' },
    });

    const result = await parseEpub('/path/to/book.epub', 'b1');
    expect(result.title).toBe('Unknown');
  });

  it('skips manifest items with no matching zip file', async () => {
    setupZipMock({
      'META-INF/container.xml': { text: containerXml },
      'OEBPS/content.opf': { text: opfXml },
      'OEBPS/chapter1.xhtml': null, // missing
      'OEBPS/chapter2.xhtml': { text: '<html>Ch2</html>' },
      'OEBPS/images/cover.jpg': null, // missing image
      'OEBPS/toc.ncx': { text: ncxXml },
    });

    const result = await parseEpub('/path/to/book.epub', 'b1');
    expect(result.chapters).toHaveLength(1);
    expect(result.imageMap).toEqual({});
  });

  it('handles NCX file missing from zip', async () => {
    const opfWithNcx = `<?xml version="1.0"?>
<package>
  <metadata><dc:title>T</dc:title></metadata>
  <manifest>
    <item id="ch1" href="ch.xhtml" media-type="application/xhtml+xml"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine><itemref idref="ch1"/></spine>
</package>`;

    setupZipMock({
      'META-INF/container.xml': { text: containerXml },
      'OEBPS/content.opf': { text: opfWithNcx },
      'OEBPS/ch.xhtml': { text: '<html>text</html>' },
      'OEBPS/toc.ncx': null,
    });

    const result = await parseEpub('/path/to/book.epub', 'b1');
    expect(result.chapters[0].title).toBe('Chapter 1');
  });

  it('resolves image with stripped ../ prefix', async () => {
    const opf = `<?xml version="1.0"?>
<package>
  <metadata><dc:title>T</dc:title></metadata>
  <manifest>
    <item id="ch1" href="text/ch.xhtml" media-type="application/xhtml+xml"/>
    <item id="img1" href="img.png" media-type="image/png"/>
  </manifest>
  <spine><itemref idref="ch1"/></spine>
</package>`;
    const html = '<html><img src="../../img.png"/></html>';

    setupZipMock({
      'META-INF/container.xml': { text: containerXml },
      'OEBPS/content.opf': { text: opf },
      'OEBPS/text/ch.xhtml': { text: html },
      'OEBPS/img.png': { base64: 'png64' },
    });

    const result = await parseEpub('/path/to/book.epub', 'b1');
    expect(result.chapters[0].html).toContain('data:image/png;base64,png64');
  });

  it('skips spine items not in manifest', async () => {
    const opf = `<?xml version="1.0"?>
<package>
  <metadata><dc:title>T</dc:title></metadata>
  <manifest>
    <item id="ch1" href="ch.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="missing_item"/>
    <itemref idref="ch1"/>
  </spine>
</package>`;

    setupZipMock({
      'META-INF/container.xml': { text: containerXml },
      'OEBPS/content.opf': { text: opf },
      'OEBPS/ch.xhtml': { text: '<html>text</html>' },
    });

    const result = await parseEpub('/path/to/book.epub', 'b1');
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].id).toBe('ch1');
  });

  it('keeps default chapter title when NCX has no matching entry', async () => {
    const opf = `<?xml version="1.0"?>
<package>
  <metadata><dc:title>T</dc:title></metadata>
  <manifest>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>`;

    // NCX only has title for chapter1, not chapter2
    const ncx = `<?xml version="1.0"?>
<ncx>
  <navMap>
    <navPoint id="np1">
      <navLabel><text>Intro</text></navLabel>
      <content src="chapter1.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`;

    setupZipMock({
      'META-INF/container.xml': { text: containerXml },
      'OEBPS/content.opf': { text: opf },
      'OEBPS/chapter1.xhtml': { text: '<html>ch1</html>' },
      'OEBPS/chapter2.xhtml': { text: '<html>ch2</html>' },
      'OEBPS/toc.ncx': { text: ncx },
    });

    const result = await parseEpub('/path/to/book.epub', 'b1');
    expect(result.chapters[0].title).toBe('Intro');
    expect(result.chapters[1].title).toBe('Chapter 2'); // default title
  });

  it('leaves unresolvable image src unchanged', async () => {
    const opf = `<?xml version="1.0"?>
<package>
  <metadata><dc:title>T</dc:title></metadata>
  <manifest>
    <item id="ch1" href="ch.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="ch1"/></spine>
</package>`;

    setupZipMock({
      'META-INF/container.xml': { text: containerXml },
      'OEBPS/content.opf': { text: opf },
      'OEBPS/ch.xhtml': { text: '<html><img src="missing.jpg"/></html>' },
    });

    const result = await parseEpub('/path/to/book.epub', 'b1');
    expect(result.chapters[0].html).toContain('src="missing.jpg"');
  });
});
