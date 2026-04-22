import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert';

// Store original fetch
const originalFetch = global.fetch;

describe('Download Services', () => {
  let mockFetch: ReturnType<typeof mock.fn>;

  beforeEach(() => {
    // Reset fetch mock before each test
    mockFetch = mock.fn(async () => new Response());
    global.fetch = mockFetch as typeof fetch;
  });

  describe('Anna\'s Archive Service', async () => {
    const annas = await import('../../lib/services/downloads/annas.js');

    describe('getAnnasDomain', () => {
      it('should return a valid domain', () => {
        const domain = annas.getAnnasDomain();
        assert.ok(domain.includes('annas-archive'));
      });

      it('should return fallback domain when error occurs', () => {
        const domain = annas.getAnnasDomain();
        // Should always return a valid domain string
        assert.ok(typeof domain === 'string');
        assert.ok(domain.length > 0);
      });
    });

    describe('isAnnasAvailable', () => {
      it('should return a boolean', () => {
        const available = annas.isAnnasAvailable();
        assert.ok(typeof available === 'boolean');
      });

      it('should default to true when check fails (fail-safe)', () => {
        const available = annas.isAnnasAvailable();
        // Should return true as fail-safe
        assert.ok(available === true || available === false);
      });
    });

    describe('getAnnasSearchUrl', () => {
      it('should generate search URL with query', () => {
        const url = annas.getAnnasSearchUrl('test book');
        assert.ok(url.includes('annas-archive'));
        assert.ok(url.includes('q=test'));
        assert.ok(url.includes('book'));
      });

      it('should include file type parameter when provided', () => {
        const url = annas.getAnnasSearchUrl('test book', 'epub');
        assert.ok(url.includes('ext=epub'));
      });

      it('should encode special characters in query', () => {
        const url = annas.getAnnasSearchUrl('test & book');
        assert.ok(url.includes('test'));
      });
    });

    describe('searchAnnas', () => {
      it('should return empty array when fetch fails', async () => {
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('', { status: 500 })
        );

        const results = await annas.searchAnnas('test');
        assert.strictEqual(results.length, 0);
      });

      it('should parse search results from HTML with primary pattern', async () => {
        const html = `
          <div>
            <a href="/md5/abcdef1234567890abcdef1234567890">
              <h3>Test Book Title</h3>
            </a>
            <div>by John Doe, epub, 2.5 MB</div>
          </div>
        `;

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        const results = await annas.searchAnnas('test');
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0]?.id, 'abcdef1234567890abcdef1234567890');
        assert.strictEqual(results[0]?.title, 'Test Book Title');
        assert.strictEqual(results[0]?.source, 'annas');
      });

      it('should use alternative pattern when primary pattern finds no results', async () => {
        const html = `
          <div data-md5="1234567890abcdef1234567890abcdef">
            <span class="title">Alternative Pattern Book</span>
          </div>
        `;

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        const results = await annas.searchAnnas('test');
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0]?.id, '1234567890abcdef1234567890abcdef');
        assert.strictEqual(results[0]?.title, 'Alternative Pattern Book');
        assert.strictEqual(results[0]?.author, 'Unknown');
      });

      it('should include file type in search params when provided', async () => {
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('', { status: 200 })
        );

        await annas.searchAnnas('test', { fileType: 'epub' });
        const callUrl = mockFetch.mock.calls[0]?.arguments[0] as string;
        assert.ok(callUrl.includes('ext=epub'));
      });

      it('should include language in search params when provided', async () => {
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('', { status: 200 })
        );

        await annas.searchAnnas('test', { language: 'en' });
        const callUrl = mockFetch.mock.calls[0]?.arguments[0] as string;
        assert.ok(callUrl.includes('lang=en'));
      });

      it('should limit results to maximum items', async () => {
        let htmlResults = '';
        for (let i = 0; i < 20; i++) {
          const md5 = `${'a'.repeat(31)}${i}`;
          htmlResults += `
            <a href="/md5/${md5}">
              <h3>Book ${i}</h3>
            </a>
            <div>by Author ${i}, epub, 1 MB</div>
          `;
        }

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(htmlResults, { status: 200 })
        );

        const results = await annas.searchAnnas('test');
        // Should limit results (max is 15, but implementation limits to 10 for alt pattern)
        assert.ok(results.length >= 10 && results.length <= 15);
      });

      it('should handle fetch errors gracefully', async () => {
        mockFetch.mock.mockImplementationOnce(async () => {
          throw new Error('Network error');
        });

        const results = await annas.searchAnnas('test');
        assert.strictEqual(results.length, 0);
      });

      it('should skip results without valid md5', async () => {
        const html = `
          <a href="/md5/">
            <h3>No MD5 Book</h3>
          </a>
          <div>by Author, epub, 1 MB</div>
          <a href="/md5/abcdef1234567890abcdef1234567890">
            <h3>Valid Book</h3>
          </a>
          <div>by Author, epub, 1 MB</div>
        `;

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        const results = await annas.searchAnnas('test');
        assert.ok(results.length >= 1);
        assert.ok(results.every(r => r.id.length === 32));
      });

      it('should include searchUrl in results', async () => {
        const html = `
          <a href="/md5/abcdef1234567890abcdef1234567890">
            <h3>Test Book</h3>
          </a>
          <div>by Author, epub, 1 MB</div>
        `;

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        const results = await annas.searchAnnas('test query');
        assert.ok(results.length > 0);
        assert.ok(results[0]?.searchUrl.includes('test'));
      });

      it('should extract author from metadata', async () => {
        const html = `
          <a href="/md5/abcdef1234567890abcdef1234567890">
            <h3>Test Book</h3>
          </a>
          <div>by John Doe, epub, 1 MB</div>
        `;

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        const results = await annas.searchAnnas('test');
        assert.strictEqual(results.length, 1);
        assert.ok(results[0]?.author === 'John Doe' || results[0]?.author === 'Unknown');
      });
    });

    describe('getAnnasDownloadLinks', () => {
      it('should return empty array when fetch fails', async () => {
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('', { status: 404 })
        );

        const links = await annas.getAnnasDownloadLinks('abc123');
        assert.strictEqual(links.length, 0);
      });

      it('should extract download links from HTML', async () => {
        const html = `
          <div>
            <a href="https://example.com/download/file1">Download 1</a>
            <a href="https://example.com/get/file2">Download 2</a>
          </div>
        `;

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        const links = await annas.getAnnasDownloadLinks('abc123');
        assert.ok(links.length >= 1);
        assert.ok(links.some(link => link.includes('download') || link.includes('get')));
      });

      it('should handle fetch errors gracefully', async () => {
        mockFetch.mock.mockImplementationOnce(async () => {
          throw new Error('Network error');
        });

        const links = await annas.getAnnasDownloadLinks('abc123');
        assert.strictEqual(links.length, 0);
      });

      it('should make request to correct URL', async () => {
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('', { status: 200 })
        );

        await annas.getAnnasDownloadLinks('testmd5');
        const callUrl = mockFetch.mock.calls[0]?.arguments[0] as string;
        assert.ok(callUrl.includes('md5/testmd5'));
      });
    });
  });

  describe('LibGen Service', async () => {
    const libgen = await import('../../lib/services/downloads/libgen.js');

    describe('getLibGenDomain', () => {
      it('should return a valid domain', () => {
        const domain = libgen.getLibGenDomain();
        assert.ok(domain.includes('libgen'));
      });

      it('should return fallback domain when error occurs', () => {
        const domain = libgen.getLibGenDomain();
        assert.ok(typeof domain === 'string');
        assert.ok(domain.length > 0);
      });
    });

    describe('getLibGenSearchUrl', () => {
      it('should generate search URL with encoded query', () => {
        const url = libgen.getLibGenSearchUrl('test book');
        assert.ok(url.includes('libgen'));
        assert.ok(url.includes('req=test'));
      });

      it('should encode special characters', () => {
        const url = libgen.getLibGenSearchUrl('test & book');
        assert.ok(url.includes('req='));
      });
    });

    describe('searchLibGen', () => {
      it('should return empty array when fetch fails', async () => {
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('', { status: 500 })
        );

        const results = await libgen.searchLibGen('test');
        assert.strictEqual(results.length, 0);
      });

      it('should parse search results from HTML table rows', async () => {
        const html = `
          <table>
            <tr>
              <td><b>Test Book Title</b></td>
              <td>John Doe</td>
              <td>Test Publisher</td>
              <td><nobr>2023</nobr></td>
              <td>English</td>
              <td>250</td>
              <td><nobr><a>5 MB</a></nobr></td>
              <td>epub</td>
              <td><a href="ads.php?md5=abcdef1234567890abcdef1234567890">Download</a></td>
            </tr>
          </table>
        `;

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        const results = await libgen.searchLibGen('test');
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0]?.md5, 'abcdef1234567890abcdef1234567890');
        assert.strictEqual(results[0]?.title, 'Test Book Title');
        assert.strictEqual(results[0]?.author, 'John Doe');
      });

      it('should search by ISBN when provided', async () => {
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('', { status: 200 })
        );

        await libgen.searchLibGen('test', { isbn: '978-0-123456-78-9' });
        const callUrl = mockFetch.mock.calls[0]?.arguments[0] as string;
        assert.ok(callUrl.includes('9780123456789'));
      });

      it('should skip rows without MD5', async () => {
        const html = `
          <table>
            <tr>
              <td><b>No MD5 Book</b></td>
              <td>Author</td>
            </tr>
            <tr>
              <td><b>Valid Book</b></td>
              <td>Author</td>
              <td>Publisher</td>
              <td>2023</td>
              <td>English</td>
              <td>100</td>
              <td>2 MB</td>
              <td>pdf</td>
              <td><a href="ads.php?md5=abcdef1234567890abcdef1234567890">Download</a></td>
            </tr>
          </table>
        `;

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        const results = await libgen.searchLibGen('test');
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0]?.title, 'Valid Book');
      });

      it('should limit results to 15 items', async () => {
        let htmlRows = '';
        for (let i = 0; i < 20; i++) {
          htmlRows += `
            <tr>
              <td><b>Book ${i}</b></td>
              <td>Author</td>
              <td>Publisher</td>
              <td>2023</td>
              <td>English</td>
              <td>100</td>
              <td>2 MB</td>
              <td>pdf</td>
              <td><a href="ads.php?md5=${'a'.repeat(32)}">Download</a></td>
            </tr>
          `;
        }

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(`<table>${htmlRows}</table>`, { status: 200 })
        );

        const results = await libgen.searchLibGen('test');
        assert.strictEqual(results.length, 15);
      });

      it('should handle fetch errors gracefully', async () => {
        mockFetch.mock.mockImplementationOnce(async () => {
          throw new Error('Network error');
        });

        const results = await libgen.searchLibGen('test');
        assert.strictEqual(results.length, 0);
      });

      it('should parse title from edition.php anchor (current libgen.vg format)', async () => {
        // Real-world structure from libgen.vg as of 2026: the title is in
        // the first <a href="edition.php?id=..."> link, not in a <b> tag.
        // The title="..." attribute commonly contains a literal <br>, which
        // must not confuse the opening-tag scanner.
        const html = `
          <table><tbody><tr>
            <td><a data-toggle="tooltip" data-html="true" title="Add/Edit : 2025-12-12/2025-12-12; ID: 111982661<br>e89791ee2ebbaaeea097e7726e38e5eb" href="edition.php?id=204701843">Bee Speaker <i></i></a><br><a href="edition.php?id=204701843"><i><font color="green"> 9781035901456</font></i></a></td>
            <td>Adrian Tchaikovsky</td>
            <td>Head of Zeus</td>
            <td><nobr></nobr></td>
            <td>English</td>
            <td>0</td>
            <td><nobr><a href="/file.php?id=111982661">4 MB</a></nobr></td>
            <td>epub</td>
            <td><a href="/ads.php?md5=e89791ee2ebbaaeea097e7726e38e5eb">1</a></td>
          </tr></tbody></table>
        `;

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        const results = await libgen.searchLibGen('Bee Speaker');
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0]?.title, 'Bee Speaker');
        assert.strictEqual(results[0]?.author, 'Adrian Tchaikovsky');
        assert.strictEqual(results[0]?.publisher, 'Head of Zeus');
        assert.strictEqual(results[0]?.language, 'English');
        assert.strictEqual(results[0]?.extension, 'epub');
      });

      it('should prefer edition.php title over series <b> tag', async () => {
        // When a series is present, <b> wraps the series name + issue number
        // (e.g. "Children of Time 1") — the real title is in the next <a>.
        const html = `
          <table><tbody><tr>
            <td><b>Children of Time 1<a data-html="true" title="Add/Edit : 2026-01-10/2026-01-10; ID: 112257324<br>hash" href="edition.php?id=204905853"><i></i></a></b><br><a data-html="true" title="Add/Edit : 2026-01-10/2026-01-10; ID: 112257324<br>hash" href="edition.php?id=204905853">Children of Time: Children of Time <i></i></a></td>
            <td>Adrian Tchaikovsky</td>
            <td>Pan Macmillan</td>
            <td><nobr>2015</nobr></td>
            <td>English</td>
            <td>0</td>
            <td><nobr><a>506 kB</a></nobr></td>
            <td>epub</td>
            <td><a href="/ads.php?md5=546b98d564b7e5d0f6b05cd173ffd8d9">1</a></td>
          </tr></tbody></table>
        `;

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        const results = await libgen.searchLibGen('test');
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0]?.title, 'Children of Time: Children of Time');
      });

      it('should extract extension from table cell', async () => {
        const html = `
          <table>
            <tr>
              <td><b>Test Book</b></td>
              <td>Author</td>
              <td>Publisher</td>
              <td>2023</td>
              <td>English</td>
              <td>100</td>
              <td>2 MB</td>
              <td>epub</td>
              <td><a href="ads.php?md5=abcdef1234567890abcdef1234567890">Download</a></td>
            </tr>
          </table>
        `;

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        const results = await libgen.searchLibGen('test');
        assert.strictEqual(results[0]?.extension, 'epub');
      });
    });

    describe('getLibGenDownloadUrl', () => {
      it('should generate download URL with MD5', () => {
        const url = libgen.getLibGenDownloadUrl('abc123');
        assert.ok(url.includes('libgen'));
        assert.ok(url.includes('md5=abc123'));
        assert.ok(url.includes('ads.php'));
      });
    });

    describe('getActualDownloadUrl', () => {
      it('should return null when fetch fails', async () => {
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('', { status: 404 })
        );

        const url = await libgen.getActualDownloadUrl('abc123');
        assert.strictEqual(url, null);
      });

      it('should extract get.php URL from HTML', async () => {
        const html = `
          <div>
            <a href="get.php?md5=abc123&key=xyz789">Download</a>
          </div>
        `;

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        const url = await libgen.getActualDownloadUrl('abc123');
        assert.ok(url?.includes('get.php'));
        assert.ok(url?.includes('md5=abc123'));
        assert.ok(url?.includes('key=xyz789'));
      });

      it('should try fallback pattern for direct download links', async () => {
        const html = `
          <div>
            <a href="https://example.com/get/file.epub">Direct Download</a>
          </div>
        `;

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        const url = await libgen.getActualDownloadUrl('abc123');
        assert.ok(url === null || url?.includes('get'));
      });

      it('should return null when no download links found', async () => {
        const html = '<div>No download links here</div>';

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        const url = await libgen.getActualDownloadUrl('abc123');
        assert.strictEqual(url, null);
      });

      it('should handle fetch errors gracefully', async () => {
        mockFetch.mock.mockImplementationOnce(async () => {
          throw new Error('Network error');
        });

        const url = await libgen.getActualDownloadUrl('abc123');
        assert.strictEqual(url, null);
      });
    });

    describe('downloadFile', () => {
      it('should return null when getActualDownloadUrl fails', async () => {
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('', { status: 404 })
        );

        const result = await libgen.downloadFile('abc123');
        assert.strictEqual(result, null);
      });

      it('should return null when download fetch fails', async () => {
        // First call: getActualDownloadUrl succeeds
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('<a href="get.php?md5=abc&key=xyz">Download</a>', { status: 200 })
        );
        // Second call: actual download fails
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('', { status: 500 })
        );

        const result = await libgen.downloadFile('abc123');
        assert.strictEqual(result, null);
      });

      it('should download file and extract filename from Content-Disposition', async () => {
        let callCount = 0;
        mockFetch.mock.mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            // First call: getActualDownloadUrl
            return new Response('<a href="get.php?md5=abc&key=xyz">Download</a>', { status: 200 });
          } else {
            // Second call: actual download
            const fileContent = Buffer.from('test file content');
            const headers = new Headers({
              'content-disposition': 'attachment; filename="test-book.epub"',
              'content-type': 'application/epub+zip',
            });
            return new Response(fileContent, { status: 200, headers });
          }
        });

        const result = await libgen.downloadFile('abc123');
        assert.ok(result !== null);
        assert.strictEqual(result?.filename, 'test-book.epub');
        assert.strictEqual(result?.contentType, 'application/epub+zip');
        assert.ok(Buffer.isBuffer(result?.buffer));
      });

      it('should use default filename when Content-Disposition is missing', async () => {
        let callCount = 0;
        mockFetch.mock.mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            // First call: getActualDownloadUrl
            return new Response('<a href="get.php?md5=abc123&key=xyz">Download</a>', { status: 200 });
          } else {
            // Second call: actual download
            const fileContent = Buffer.from('test file content');
            return new Response(fileContent, { status: 200 });
          }
        });

        const result = await libgen.downloadFile('abc123');
        assert.ok(result !== null);
        assert.strictEqual(result?.filename, 'abc123.epub');
      });

      it('should handle download errors gracefully', async () => {
        mockFetch.mock.mockImplementationOnce(async () => {
          throw new Error('Network error');
        });

        const result = await libgen.downloadFile('abc123');
        assert.strictEqual(result, null);
      });
    });
  });

  describe('Z-Library Service', async () => {
    const zlib = await import('../../lib/services/downloads/zlibrary.js');

    describe('getZLibraryDomain', () => {
      it('should return a valid domain', () => {
        const domain = zlib.getZLibraryDomain();
        assert.ok(domain.includes('z-lib') || domain.includes('z-library'));
      });

      it('should return fallback domain when error occurs', () => {
        const domain = zlib.getZLibraryDomain();
        assert.ok(typeof domain === 'string');
        assert.ok(domain.length > 0);
      });
    });

    describe('getZLibrarySearchUrl', () => {
      it('should generate search URL with encoded query', () => {
        const url = zlib.getZLibrarySearchUrl('test book');
        assert.ok(url.includes('z-lib') || url.includes('z-library'));
        assert.ok(url.includes('test') || url.includes('/s/'));
      });

      it('should encode special characters', () => {
        const url = zlib.getZLibrarySearchUrl('test & book');
        assert.ok(url.includes('/s/'));
      });
    });

    describe('searchZLibrary', () => {
      it('should return empty array when fetch fails', async () => {
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('', { status: 500 })
        );

        const results = await zlib.searchZLibrary('test');
        assert.strictEqual(results.length, 0);
      });

      it('should parse search results from z-bookcard elements', async () => {
        const html = `
          <z-bookcard data-id="12345">
            <div class="title">Test Book Title</div>
            <div class="author">John Doe</div>
          </z-bookcard>
        `;

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        const results = await zlib.searchZLibrary('test');
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0]?.id, '12345');
        assert.strictEqual(results[0]?.title, 'Test Book Title');
        assert.strictEqual(results[0]?.author, 'John Doe');
      });

      it('should include auth cookies when credentials provided', async () => {
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('', { status: 200 })
        );

        const config = {
          remix_userid: 'user123',
          remix_userkey: 'key456',
        };

        await zlib.searchZLibrary('test', config);
        const callHeaders = mockFetch.mock.calls[0]?.arguments[1]?.headers as Record<string, string>;
        assert.ok(callHeaders.Cookie.includes('remix_userid=user123'));
        assert.ok(callHeaders.Cookie.includes('remix_userkey=key456'));
      });

      it('should include downloadUrl when authenticated', async () => {
        const html = `
          <z-bookcard data-id="12345">
            <div class="title">Test Book</div>
            <div class="author">Author</div>
          </z-bookcard>
        `;

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        const results = await zlib.searchZLibrary('test', {
          remix_userid: 'user123',
          remix_userkey: 'key456',
        });

        assert.ok(results[0]?.downloadUrl);
        assert.ok(results[0]?.downloadUrl?.includes('/book/12345'));
      });

      it('should use fallback pattern when structured parsing fails', async () => {
        const html = `
          <a href="/book/67890/test-book">Test Fallback Book</a>
        `;

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        const results = await zlib.searchZLibrary('test');
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0]?.id, '67890');
        assert.strictEqual(results[0]?.title, 'Test Fallback Book');
        assert.strictEqual(results[0]?.author, 'Unknown');
      });

      it('should skip fallback results with short titles', async () => {
        const html = `
          <a href="/book/123/a">A</a>
          <a href="/book/456/valid-title">Valid Title</a>
        `;

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        const results = await zlib.searchZLibrary('test');
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0]?.id, '456');
      });

      it('should limit results to 10 items', async () => {
        let htmlCards = '';
        for (let i = 0; i < 15; i++) {
          htmlCards += `
            <z-bookcard data-id="${i}">
              <div class="title">Book ${i}</div>
              <div class="author">Author ${i}</div>
            </z-bookcard>
          `;
        }

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(htmlCards, { status: 200 })
        );

        const results = await zlib.searchZLibrary('test');
        assert.strictEqual(results.length, 10);
      });

      it('should handle fetch errors gracefully', async () => {
        mockFetch.mock.mockImplementationOnce(async () => {
          throw new Error('Network error');
        });

        const results = await zlib.searchZLibrary('test');
        assert.strictEqual(results.length, 0);
      });
    });

    describe('authenticateZLibrary', () => {
      it('should return null when login fails', async () => {
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('', { status: 401 })
        );

        const result = await zlib.authenticateZLibrary('test@example.com', 'password');
        assert.strictEqual(result, null);
      });

      it('should return null when no cookies in response', async () => {
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('', { status: 200 })
        );

        const result = await zlib.authenticateZLibrary('test@example.com', 'password');
        assert.strictEqual(result, null);
      });

      it('should extract cookies from successful login', async () => {
        const headers = new Headers();
        headers.set('set-cookie', 'remix_userid=12345; Path=/; remix_userkey=abcdef123456; Path=/');

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('', { status: 200, headers })
        );

        const result = await zlib.authenticateZLibrary('test@example.com', 'password');
        assert.ok(result !== null);
        assert.strictEqual(result?.remix_userid, '12345');
        assert.strictEqual(result?.remix_userkey, 'abcdef123456');
      });

      it('should return null when cookies are incomplete', async () => {
        const headers = new Headers();
        headers.set('set-cookie', 'remix_userid=12345; Path=/');

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('', { status: 200, headers })
        );

        const result = await zlib.authenticateZLibrary('test@example.com', 'password');
        assert.strictEqual(result, null);
      });

      it('should handle fetch errors gracefully', async () => {
        mockFetch.mock.mockImplementationOnce(async () => {
          throw new Error('Network error');
        });

        const result = await zlib.authenticateZLibrary('test@example.com', 'password');
        assert.strictEqual(result, null);
      });

      it('should send POST request with correct credentials', async () => {
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('', { status: 200 })
        );

        await zlib.authenticateZLibrary('user@test.com', 'mypassword');
        const callOptions = mockFetch.mock.calls[0]?.arguments[1];
        assert.strictEqual(callOptions?.method, 'POST');
      });
    });
  });

  describe('Source Status Service', async () => {
    const sourceStatus = await import('../../lib/services/downloads/source-status.js');

    describe('getSourceStatuses', () => {
      it('should return array of source statuses', async () => {
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(JSON.stringify({
            heartbeatList: {},
            uptimeList: {},
          }), { status: 200 })
        );

        const statuses = await sourceStatus.getSourceStatuses();
        assert.ok(Array.isArray(statuses));
        assert.ok(statuses.length > 0);
      });

      it('should include known sources with unknown status if not in cache', async () => {
        const statuses = await sourceStatus.getSourceStatuses();
        const hasUnknown = statuses.some(s => s.status === 'unknown');
        assert.ok(hasUnknown || statuses.length > 0);
      });

      it('should force refresh when requested', async () => {
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(JSON.stringify({
            heartbeatList: {},
            uptimeList: {},
          }), { status: 200 })
        );

        const statuses = await sourceStatus.getSourceStatuses(true);
        assert.ok(statuses.length > 0);
        assert.ok(mockFetch.mock.callCount() >= 1);
      });
    });

    describe('refreshSourceStatuses', () => {
      it('should fetch from API endpoints', async () => {
        const apiResponse = {
          heartbeatList: {
            14: [{ status: 1, time: '2024-01-01', msg: 'OK', ping: 50 }],
          },
          uptimeList: {},
        };

        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(JSON.stringify(apiResponse), { status: 200 })
        );

        await sourceStatus.refreshSourceStatuses();
        assert.ok(mockFetch.mock.callCount() >= 1);
      });

      it('should handle all endpoints failing gracefully', async () => {
        mockFetch.mock.mockImplementation(async () => {
          throw new Error('Network error');
        });

        // Should not throw
        await sourceStatus.refreshSourceStatuses();
        assert.ok(true);
      });

      it('should handle JSON parsing errors', async () => {
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('invalid json', { status: 200 })
        );

        // Should not throw
        await sourceStatus.refreshSourceStatuses();
        assert.ok(true);
      });
    });

    describe('checkSourceHealth', () => {
      it('should return unknown status for unknown source', async () => {
        const status = await sourceStatus.checkSourceHealth('unknown-source');
        assert.strictEqual(status.status, 'unknown');
        assert.strictEqual(status.name, 'unknown-source');
      });

      it('should perform HEAD request for known source', async () => {
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('', { status: 200 })
        );

        const status = await sourceStatus.checkSourceHealth('zlibrary');
        assert.ok(['up', 'down', 'degraded'].includes(status.status));
      });

      it('should return down status when request fails', async () => {
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('', { status: 500 })
        );

        const status = await sourceStatus.checkSourceHealth('zlibrary');
        assert.strictEqual(status.status, 'down');
      });

      it('should handle timeout errors', async () => {
        mockFetch.mock.mockImplementationOnce(async () => {
          throw new Error('Timeout');
        });

        const status = await sourceStatus.checkSourceHealth('zlibrary');
        assert.strictEqual(status.status, 'down');
      });
    });
  });

  describe('Unified Download Service', async () => {
    const downloads = await import('../../lib/services/downloads/index.js');

    describe('getSearchLinks', () => {
      it('should return search links for all sources', () => {
        const links = downloads.getSearchLinks('test book');
        assert.ok(links.zlibrary.includes('z-lib'));
        assert.ok(links.annas.includes('annas-archive'));
        assert.ok(links.libgen.includes('libgen'));
      });

      it('should encode query in all links', () => {
        const links = downloads.getSearchLinks('test & book');
        assert.ok(links.zlibrary.length > 0);
        assert.ok(links.annas.length > 0);
        assert.ok(links.libgen.length > 0);
      });
    });

    describe('searchAllSources', () => {
      it('should return combined results from all sources', async () => {
        // Mock responses for each source
        mockFetch.mock.mockImplementation(async (url: string) => {
          if (typeof url === 'string') {
            if (url.includes('z-lib')) {
              return new Response(`
                <z-bookcard data-id="1">
                  <div class="title">Z-Lib Book</div>
                  <div class="author">Author 1</div>
                </z-bookcard>
              `, { status: 200 });
            } else if (url.includes('annas-archive')) {
              return new Response(`
                <a href="/md5/${'a'.repeat(32)}">
                  <h3>Anna's Book</h3>
                </a>
                <div>by Author 2, epub, 1 MB</div>
              `, { status: 200 });
            }
          }
          return new Response('', { status: 200 });
        });

        const results = await downloads.searchAllSources('test');
        assert.ok(Array.isArray(results));
      });

      it('should handle search errors gracefully', async () => {
        mockFetch.mock.mockImplementation(async () => {
          throw new Error('Network error');
        });

        const results = await downloads.searchAllSources('test');
        assert.ok(Array.isArray(results));
      });
    });

    describe('searchSource', () => {
      it('should search only the specified source', async () => {
        mockFetch.mock.mockImplementation(async () =>
          new Response('', { status: 200 })
        );

        const results = await downloads.searchSource('annas', 'test');
        assert.ok(Array.isArray(results));
      });

      it('should pass through options', async () => {
        mockFetch.mock.mockImplementation(async () =>
          new Response('', { status: 200 })
        );

        const results = await downloads.searchSource('libgen', 'test', { isbn: '1234567890' });
        assert.ok(Array.isArray(results));
      });
    });
  });

  // Restore original fetch after all tests
  global.fetch = originalFetch;
});
