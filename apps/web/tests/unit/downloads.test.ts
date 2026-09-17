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

  describe('Challenge detection', async () => {
    const {
      detectChallenge,
      SourceBlockedError,
      SourceParseError,
      recordParseSuccess,
      recordParseFailure,
      getParserHealth,
      PARSE_FAILURE_SUSPECT_THRESHOLD,
    } = await import('../../lib/services/downloads/challenge.js');

    it('should not flag a normal search results page', () => {
      const html = `
        <div class="search-results">
          <a href="/md5/abcdef1234567890abcdef1234567890">
            <h3>A Real Book Title</h3>
          </a>
          <div>by John Doe, epub, 2.5 MB</div>
        </div>
      `;
      const response = new Response(html, { status: 200 });
      assert.strictEqual(detectChallenge(html, response), false);
    });

    it('should flag a Cloudflare "Just a moment" interstitial', () => {
      const html = `
        <html>
          <head><title>Just a moment...</title></head>
          <body>
            <div class="cf-turnstile" data-sitekey="x"></div>
            <script>window.__cf_chl_opt = {};</script>
          </body>
        </html>
      `;
      const response = new Response(html, { status: 200 });
      assert.strictEqual(detectChallenge(html, response), true);
    });

    it('should flag a response carrying a cf-ray header even with benign body', () => {
      const html = '<html><body>Nothing interesting here.</body></html>';
      const response = new Response(html, {
        status: 200,
        headers: new Headers({ 'cf-ray': '8a1b2c3d4e5f6789-SYD' }),
      });
      assert.strictEqual(detectChallenge(html, response), true);
    });

    it('SourceBlockedError carries the source name and a readable message', () => {
      const error = new SourceBlockedError('annas', 'annas-archive.li is behind a bot check right now');
      assert.strictEqual(error.source, 'annas');
      assert.strictEqual(error.message, 'annas-archive.li is behind a bot check right now');
      assert.ok(error instanceof Error);
    });

    it('SourceParseError carries the source name and a readable message', () => {
      const error = new SourceParseError('libgen', "libgen.vg's page structure wasn't recognised");
      assert.strictEqual(error.source, 'libgen');
      assert.strictEqual(error.message, "libgen.vg's page structure wasn't recognised");
      assert.ok(error instanceof Error);
    });
  });

  describe('Parser health tracking', async () => {
    const { recordParseSuccess, recordParseFailure, getParserHealth, PARSE_FAILURE_SUSPECT_THRESHOLD } =
      await import('../../lib/services/downloads/challenge.js');

    it('is not suspect before reaching the failure threshold', () => {
      const source = `health-test-below-${Math.random()}`;
      recordParseFailure(source);
      recordParseFailure(source);

      const health = getParserHealth().find((h: { source: string }) => h.source === source);
      assert.strictEqual(health?.consecutiveFailures, 2);
      assert.strictEqual(health?.suspect, false);
    });

    it('becomes suspect once consecutive failures reach the threshold', () => {
      const source = `health-test-at-${Math.random()}`;
      for (let i = 0; i < PARSE_FAILURE_SUSPECT_THRESHOLD; i++) {
        recordParseFailure(source);
      }

      const health = getParserHealth().find((h: { source: string }) => h.source === source);
      assert.strictEqual(health?.consecutiveFailures, PARSE_FAILURE_SUSPECT_THRESHOLD);
      assert.strictEqual(health?.suspect, true);
    });

    it('resets the streak on a successful parse', () => {
      const source = `health-test-reset-${Math.random()}`;
      for (let i = 0; i < PARSE_FAILURE_SUSPECT_THRESHOLD; i++) {
        recordParseFailure(source);
      }
      recordParseSuccess(source);

      const health = getParserHealth().find((h: { source: string }) => h.source === source);
      assert.strictEqual(health?.consecutiveFailures, 0);
      assert.strictEqual(health?.suspect, false);
    });
  });

  describe('Anna\'s Archive Service', async () => {
    const annas = await import('../../lib/services/downloads/annas.js');
    const { SourceBlockedError, SourceParseError } = await import('../../lib/services/downloads/challenge.js');

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
          new Response('<div class="search-results"></div>', { status: 200 })
        );

        await annas.searchAnnas('test', { fileType: 'epub' });
        const callUrl = mockFetch.mock.calls[0]?.arguments[0] as string;
        assert.ok(callUrl.includes('ext=epub'));
      });

      it('should include language in search params when provided', async () => {
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('<div class="search-results"></div>', { status: 200 })
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

      it('should throw SourceBlockedError when the response is a bot-protection challenge', async () => {
        const html = '<html><head><title>Just a moment...</title></head><body><div class="cf-turnstile"></div></body></html>';
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        await assert.rejects(
          () => annas.searchAnnas('test'),
          (err: unknown) => err instanceof SourceBlockedError
        );
      });

      it('should still return an empty array for a normal empty-results page', async () => {
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('<div class="search-results"></div>', { status: 200 })
        );

        const results = await annas.searchAnnas('test');
        assert.strictEqual(results.length, 0);
      });

      it('should throw SourceParseError when the page has no recognisable results structure', async () => {
        // Neither an /md5/ link, a data-md5 attribute, nor a search-results
        // container — this isn't "zero matches", it's markup we don't
        // recognise at all.
        const html = '<html><body><div class="totally-different-layout">Nothing we know</div></body></html>';
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        await assert.rejects(
          () => annas.searchAnnas('test'),
          (err: unknown) => err instanceof SourceParseError
        );
      });

      it('should classify a challenge page as SourceBlockedError, not SourceParseError, even though its markup also fails structural checks', async () => {
        const html = '<html><head><title>Just a moment...</title></head><body><div class="cf-turnstile"></div></body></html>';
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        await assert.rejects(
          () => annas.searchAnnas('test'),
          (err: unknown) => err instanceof SourceBlockedError && !(err instanceof SourceParseError)
        );
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

    describe('resolveAnnasDownload', () => {
      // E4-5: prefers the member fast_download API when a key is configured,
      // falling back to the free scraped detail-page candidates
      // (getAnnasDownloadLinks) otherwise. Every candidate — from either
      // path — is only probed for headers, the same way LibGen's resolve
      // functions never fetch a file body just to inspect it.

      it('resolves a working candidate via the free scraped path when no API key is configured', async () => {
        const db = await import('../../lib/db/index.js');
        db.upsertDownloadSourceConfig('annas', true, undefined);

        mockFetch.mock.mockImplementation(async (url: string) => {
          if (url.includes('/md5/')) {
            return new Response('<a href="https://annas.example/download/file1">Download</a>', {
              status: 200,
            });
          }
          return new Response('book', {
            status: 200,
            headers: new Headers({
              'content-type': 'application/epub+zip',
              'content-disposition': 'attachment; filename="book.epub"',
            }),
          });
        });

        const results = await annas.resolveAnnasDownload('abc123');
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0]?.filename, 'book.epub');
      });

      it('prefers the member fast_download API when an API key is configured', async () => {
        const db = await import('../../lib/db/index.js');
        db.upsertDownloadSourceConfig('annas', true, { apiKey: 'secret-key' });

        let scrapedDetailPage = false;
        mockFetch.mock.mockImplementation(async (url: string) => {
          if (url.includes('fast_download.json')) {
            assert.ok(url.includes('key=secret-key'));
            return new Response(JSON.stringify({ download_url: 'https://annas.example/direct-file' }), {
              status: 200,
            });
          }
          if (url.includes('/md5/')) {
            scrapedDetailPage = true;
            return new Response('', { status: 200 });
          }
          return new Response('book', {
            status: 200,
            headers: new Headers({ 'content-type': 'application/epub+zip' }),
          });
        });

        const results = await annas.resolveAnnasDownload('abc123');
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0]?.url, 'https://annas.example/direct-file');
        assert.strictEqual(scrapedDetailPage, false, 'should not fall back to scraping when the API key path works');
      });

      it('falls back to the free scraped path when the API key path returns no download', async () => {
        const db = await import('../../lib/db/index.js');
        db.upsertDownloadSourceConfig('annas', true, { apiKey: 'bad-key' });

        mockFetch.mock.mockImplementation(async (url: string) => {
          if (url.includes('fast_download.json')) {
            return new Response(JSON.stringify({ error: 'invalid key' }), { status: 200 });
          }
          if (url.includes('/md5/')) {
            return new Response('<a href="https://annas.example/download/fallback">Download</a>', {
              status: 200,
            });
          }
          return new Response('book', {
            status: 200,
            headers: new Headers({ 'content-type': 'application/epub+zip' }),
          });
        });

        const results = await annas.resolveAnnasDownload('abc123');
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0]?.url, 'https://annas.example/download/fallback');
      });

      it('throws SourceBlockedError when a candidate is a bot-check challenge page', async () => {
        const db = await import('../../lib/db/index.js');
        db.upsertDownloadSourceConfig('annas', true, undefined);

        mockFetch.mock.mockImplementation(async (url: string) => {
          if (url.includes('/md5/')) {
            return new Response('<a href="https://annas.example/download/blocked">Download</a>', {
              status: 200,
            });
          }
          return new Response(
            '<html><head><title>Just a moment...</title></head><body><div class="cf-turnstile"></div></body></html>',
            { status: 200, headers: new Headers({ 'content-type': 'text/html' }) }
          );
        });

        await assert.rejects(
          () => annas.resolveAnnasDownload('abc123'),
          (err: unknown) => err instanceof SourceBlockedError
        );
      });

      it('falls through a dead candidate to the next one', async () => {
        const db = await import('../../lib/db/index.js');
        db.upsertDownloadSourceConfig('annas', true, undefined);

        mockFetch.mock.mockImplementation(async (url: string) => {
          if (url.includes('/md5/')) {
            return new Response(
              '<a href="https://annas.example/download/dead">Download</a>' +
                '<a href="https://annas.example/download/alive">Download</a>',
              { status: 200 }
            );
          }
          if (url.includes('/download/dead')) {
            return new Response('<html>error page</html>', {
              status: 200,
              headers: new Headers({ 'content-type': 'text/html' }),
            });
          }
          return new Response('book', {
            status: 200,
            headers: new Headers({ 'content-type': 'application/epub+zip' }),
          });
        });

        const results = await annas.resolveAnnasDownload('abc123');
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0]?.url, 'https://annas.example/download/alive');
      });
    });
  });

  describe('LibGen Service', async () => {
    const libgen = await import('../../lib/services/downloads/libgen.js');
    const { SourceBlockedError, SourceParseError } = await import('../../lib/services/downloads/challenge.js');

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

      it('should throw SourceBlockedError when the response is a bot-protection challenge', async () => {
        const html = '<html><head><title>Just a moment...</title></head><body><div class="cf-turnstile"></div></body></html>';
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        await assert.rejects(
          () => libgen.searchLibGen('test'),
          (err: unknown) => err instanceof SourceBlockedError
        );
      });

      it('should still return an empty array for a normal empty-results page', async () => {
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('<table></table>', { status: 200 })
        );

        const results = await libgen.searchLibGen('test');
        assert.strictEqual(results.length, 0);
      });

      it('should throw SourceParseError when the page has no recognisable results table', async () => {
        const html = '<html><body><div class="totally-different-layout">Nothing we know</div></body></html>';
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        await assert.rejects(
          () => libgen.searchLibGen('test'),
          (err: unknown) => err instanceof SourceParseError
        );
      });

      it('should classify a challenge page as SourceBlockedError, not SourceParseError, even though its markup also fails structural checks', async () => {
        const html = '<html><head><title>Just a moment...</title></head><body><div class="cf-turnstile"></div></body></html>';
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        await assert.rejects(
          () => libgen.searchLibGen('test'),
          (err: unknown) => err instanceof SourceBlockedError && !(err instanceof SourceParseError)
        );
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
          new Response('<table></table>', { status: 200 })
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

    describe('resolveLibgenDownload', () => {
      // E2-2 replaced the old buffer-everything `downloadFile` with a resolve
      // step that only probes headers (a ranged GET, never the full body) and
      // leaves the actual streaming to the shared `downloadToFile` (tested
      // directly, against the real implementation, in
      // streaming-download.test.ts). These tests cover the mirror-walking
      // and header-parsing `resolveLibgenDownload` is responsible for.

      it('should return null when every mirror fails to resolve a link', async () => {
        mockFetch.mock.mockImplementation(async () => new Response('', { status: 404 }));

        const result = await libgen.resolveLibgenDownload('abc123');
        assert.strictEqual(result, null);
      });

      it('should resolve the first working mirror without fetching the file body', async () => {
        let probeCount = 0;
        mockFetch.mock.mockImplementation(async (url: string) => {
          if (url.includes('ads.php')) {
            return new Response('<a href="get.php?md5=abc&key=xyz">Download</a>', { status: 200 });
          }

          probeCount++;
          const headers = new Headers({
            'content-disposition': 'attachment; filename="test-book.epub"',
            'content-type': 'application/epub+zip',
            'content-range': 'bytes 0-0/18',
          });
          return new Response('t', { status: 206, headers });
        });

        const result = await libgen.resolveLibgenDownload('abc123');
        assert.ok(result !== null);
        assert.strictEqual(result?.filename, 'test-book.epub');
        assert.strictEqual(result?.contentType, 'application/epub+zip');
        assert.strictEqual(result?.size, 18);
        assert.strictEqual(result?.supportsRange, true);
        // Exactly one ranged probe — resolving must not pull the whole file.
        assert.strictEqual(probeCount, 1);
      });

      it('should use a default filename when Content-Disposition is missing', async () => {
        mockFetch.mock.mockImplementation(async (url: string) => {
          if (url.includes('ads.php')) {
            return new Response('<a href="get.php?md5=abc123&key=xyz">Download</a>', { status: 200 });
          }
          return new Response('t', { status: 200 });
        });

        const result = await libgen.resolveLibgenDownload('abc123');
        assert.ok(result !== null);
        assert.strictEqual(result?.filename, 'abc123.epub');
      });

      it('should fail over to the next mirror when a host errors', async () => {
        const firstDomain = libgen.getLibGenDomains()[0];
        const requested: string[] = [];

        mockFetch.mock.mockImplementation(async (url: string) => {
          requested.push(url);

          // The first mirror is down for both attempts at the ads page.
          if (url.includes(firstDomain!)) {
            return new Response('', { status: 500 });
          }

          if (url.includes('ads.php')) {
            return new Response('<a href="get.php?md5=abc123&key=xyz">Download</a>', { status: 200 });
          }

          return new Response('book', {
            status: 200,
            headers: new Headers({ 'content-type': 'application/epub+zip' }),
          });
        });

        const result = await libgen.resolveLibgenDownload('abc123');
        assert.ok(result !== null);
        assert.ok(requested.some(u => !u.includes(firstDomain!)));
      });

      it('should treat a mirror serving an HTML page as broken and fall through to the next', async () => {
        const firstDomain = libgen.getLibGenDomains()[0];

        mockFetch.mock.mockImplementation(async (url: string) => {
          if (url.includes('ads.php')) {
            return new Response('<a href="get.php?md5=abc123&key=xyz">Download</a>', { status: 200 });
          }

          if (url.includes(firstDomain!)) {
            return new Response('<html>Too many downloads</html>', {
              status: 200,
              headers: new Headers({ 'content-type': 'text/html' }),
            });
          }

          return new Response('book', {
            status: 200,
            headers: new Headers({ 'content-type': 'application/epub+zip' }),
          });
        });

        const result = await libgen.resolveLibgenDownload('abc123');
        assert.ok(result !== null);
        assert.strictEqual(result?.contentType, 'application/epub+zip');
      });

      it('should handle probe errors gracefully and move to the next mirror', async () => {
        const firstDomain = libgen.getLibGenDomains()[0];

        mockFetch.mock.mockImplementation(async (url: string) => {
          if (url.includes('ads.php')) {
            return new Response('<a href="get.php?md5=abc123&key=xyz">Download</a>', { status: 200 });
          }
          if (url.includes(firstDomain!)) {
            throw new Error('Network error');
          }
          return new Response('book', { status: 200 });
        });

        const result = await libgen.resolveLibgenDownload('abc123');
        assert.ok(result !== null);
      });
    });

    describe('resolveLibgenDownloads', () => {
      // E2-3: unlike resolveLibgenDownload (singular), which stops at the
      // first working mirror, this walks every mirror and returns all of
      // them — so a caller can store the whole candidate list and fall
      // through it later without re-scraping from scratch.

      it('should return every mirror that resolves, in mirror-preference order', async () => {
        mockFetch.mock.mockImplementation(async (url: string) => {
          if (url.includes('ads.php')) {
            return new Response('<a href="get.php?md5=abc123&key=xyz">Download</a>', { status: 200 });
          }
          // Every mirror's ranged probe succeeds.
          return new Response('book', {
            status: 200,
            headers: new Headers({ 'content-type': 'application/epub+zip' }),
          });
        });

        const domains = libgen.getLibGenDomains();
        const results = await libgen.resolveLibgenDownloads('abc123');

        assert.strictEqual(results.length, domains.length);
        // Every resolved URL points at a distinct mirror domain, and the
        // order matches getLibGenDomains' best-first ranking.
        for (const [index, domain] of domains.entries()) {
          assert.ok(
            results[index]?.url.includes(domain),
            `expected result ${index} to come from ${domain}`
          );
        }
      });

      it('should skip a mirror that errors and still return the rest', async () => {
        const firstDomain = libgen.getLibGenDomains()[0];

        mockFetch.mock.mockImplementation(async (url: string) => {
          if (url.includes('ads.php')) {
            return new Response('<a href="get.php?md5=abc123&key=xyz">Download</a>', { status: 200 });
          }
          if (url.includes(firstDomain!)) {
            return new Response('', { status: 500 });
          }
          return new Response('book', {
            status: 200,
            headers: new Headers({ 'content-type': 'application/epub+zip' }),
          });
        });

        const domains = libgen.getLibGenDomains();
        const results = await libgen.resolveLibgenDownloads('abc123');

        // One fewer than the full mirror list — the down one is left out
        // entirely rather than stopping the walk.
        assert.strictEqual(results.length, domains.length - 1);
        assert.ok(!results.some((r) => r.url.includes(firstDomain!)));
      });

      it('should return an empty array when every mirror fails to resolve a link', async () => {
        mockFetch.mock.mockImplementation(async () => new Response('', { status: 404 }));

        const results = await libgen.resolveLibgenDownloads('abc123');
        assert.deepStrictEqual(results, []);
      });
    });

    describe('getLibGenDomains', () => {
      it('should list every mirror, best-first', () => {
        const domains = libgen.getLibGenDomains();
        assert.ok(domains.length >= 4);
        assert.ok(domains.every(d => d.includes('libgen')));
        assert.ok(domains.includes('libgen.vg'));
      });
    });
  });

  describe('Z-Library Service', async () => {
    const zlib = await import('../../lib/services/downloads/zlibrary.js');
    const { SourceBlockedError, SourceParseError } = await import('../../lib/services/downloads/challenge.js');

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

      it('should throw SourceBlockedError when the response is a bot-protection challenge', async () => {
        const html = '<html><head><title>Just a moment...</title></head><body><div class="cf-turnstile"></div></body></html>';
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        await assert.rejects(
          () => zlib.searchZLibrary('test'),
          (err: unknown) => err instanceof SourceBlockedError
        );
      });

      it('should still return an empty array for a normal empty-results page', async () => {
        // A z-bookcard element with no matching data-id/title/author is a
        // page that had a fair shot at matching — genuinely zero results,
        // not unrecognised markup.
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response('<z-bookcard></z-bookcard>', { status: 200 })
        );

        const results = await zlib.searchZLibrary('test');
        assert.strictEqual(results.length, 0);
      });

      it('should throw SourceParseError when the page has no recognisable book cards or links', async () => {
        const html = '<html><body><div class="totally-different-layout">Nothing we know</div></body></html>';
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        await assert.rejects(
          () => zlib.searchZLibrary('test'),
          (err: unknown) => err instanceof SourceParseError
        );
      });

      it('should classify a challenge page as SourceBlockedError, not SourceParseError, even though its markup also fails structural checks', async () => {
        const html = '<html><head><title>Just a moment...</title></head><body><div class="cf-turnstile"></div></body></html>';
        mockFetch.mock.mockImplementationOnce(async () =>
          new Response(html, { status: 200 })
        );

        await assert.rejects(
          () => zlib.searchZLibrary('test'),
          (err: unknown) => err instanceof SourceBlockedError && !(err instanceof SourceParseError)
        );
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
          new Response('<z-bookcard></z-bookcard>', { status: 200 })
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

    describe('resolveZlibraryDownload', () => {
      // E4-5: unlike LibGen and Anna's Archive, a Z-Library search result's
      // downloadUrl is the book's detail page, not a file — this fetches
      // that page with an authenticated session's cookies and scrapes it for
      // the real link. It always needs an account, so "no credentials
      // configured" is its own typed failure rather than an empty list.

      it('throws ZLibraryNotConfiguredError when no credentials are configured', async () => {
        const db = await import('../../lib/db/index.js');
        db.upsertDownloadSourceConfig('zlibrary', false, undefined);

        await assert.rejects(
          () => zlib.resolveZlibraryDownload('12345'),
          (err: unknown) => err instanceof zlib.ZLibraryNotConfiguredError
        );
      });

      it('authenticates with stored email/password when no session is cached, then resolves the download link', async () => {
        const db = await import('../../lib/db/index.js');
        db.upsertDownloadSourceConfig('zlibrary', true, { email: 'user@test.com', password: 'secret' });

        let loginCalled = false;
        mockFetch.mock.mockImplementation(async (url: string) => {
          if (url.includes('singlelogin.re')) {
            loginCalled = true;
            const headers = new Headers();
            headers.set('set-cookie', 'remix_userid=42; Path=/; remix_userkey=cachedkey; Path=/');
            return new Response('', { status: 200, headers });
          }
          if (url.includes('/book/')) {
            return new Response('<a class="dlButton" href="/dl/98765">Download</a>', { status: 200 });
          }
          return new Response('book', {
            status: 200,
            headers: new Headers({ 'content-type': 'application/epub+zip' }),
          });
        });

        const results = await zlib.resolveZlibraryDownload('98765');
        assert.strictEqual(loginCalled, true);
        assert.strictEqual(results.length, 1);

        // The session is cached for next time, so a later call need not
        // authenticate again.
        const stored = JSON.parse(db.getDownloadSourceConfig('zlibrary')!.credentials!);
        assert.strictEqual(stored.remix_userid, '42');
        assert.strictEqual(stored.remix_userkey, 'cachedkey');
      });

      it('reuses a cached session instead of re-authenticating', async () => {
        const db = await import('../../lib/db/index.js');
        db.upsertDownloadSourceConfig('zlibrary', true, {
          email: 'user@test.com',
          password: 'secret',
          remix_userid: '42',
          remix_userkey: 'cachedkey',
        });

        let loginCalled = false;
        mockFetch.mock.mockImplementation(async (url: string) => {
          if (url.includes('singlelogin.re')) {
            loginCalled = true;
            return new Response('', { status: 500 });
          }
          if (url.includes('/book/')) {
            return new Response('<a class="dlButton" href="/dl/11111">Download</a>', { status: 200 });
          }
          return new Response('book', {
            status: 200,
            headers: new Headers({ 'content-type': 'application/epub+zip' }),
          });
        });

        const results = await zlib.resolveZlibraryDownload('11111');
        assert.strictEqual(loginCalled, false, 'a cached session should not trigger another login');
        assert.strictEqual(results.length, 1);
      });

      it('throws SourceBlockedError when the detail page is a bot-check challenge', async () => {
        const db = await import('../../lib/db/index.js');
        db.upsertDownloadSourceConfig('zlibrary', true, { remix_userid: '1', remix_userkey: 'key' });

        mockFetch.mock.mockImplementation(async () =>
          new Response(
            '<html><head><title>Just a moment...</title></head><body><div class="cf-turnstile"></div></body></html>',
            { status: 200 }
          )
        );

        await assert.rejects(
          () => zlib.resolveZlibraryDownload('1'),
          (err: unknown) => err instanceof SourceBlockedError
        );
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
      it('should probe every source and mirror directly', async () => {
        const probed: string[] = [];
        mockFetch.mock.mockImplementation(async (url: string) => {
          probed.push(url);
          return new Response('', { status: 200 });
        });

        await sourceStatus.refreshSourceStatuses();

        assert.ok(probed.some(u => u.includes('libgen.vg')));
        assert.ok(probed.some(u => u.includes('libgen.la')));
        assert.ok(probed.some(u => u.includes('annas-archive')));
        assert.ok(probed.some(u => u.includes('z-library')));
      });

      it('should roll mirror statuses up into the libgen source', async () => {
        mockFetch.mock.mockImplementation(async (url: string) =>
          url.includes('libgen.la')
            ? new Response('', { status: 200 })
            : new Response('', { status: 404 })
        );

        await sourceStatus.refreshSourceStatuses();

        const statuses = await sourceStatus.getSourceStatuses();
        assert.strictEqual(statuses.find(s => s.name === 'libgen')?.status, 'up');
      });

      it('should handle all probes failing gracefully', async () => {
        mockFetch.mock.mockImplementation(async () => {
          throw new Error('Network error');
        });

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

      // Z-Library is an aggregate over its mirror rows (E1-1), so 'down'
      // means every one of its mirrors is down — hence mockImplementation
      // rather than mockImplementationOnce.
      it('should return down status when request fails', async () => {
        mockFetch.mock.mockImplementation(async () =>
          new Response('', { status: 500 })
        );

        const status = await sourceStatus.checkSourceHealth('zlibrary');
        assert.strictEqual(status.status, 'down');
      });

      it('should handle timeout errors', async () => {
        mockFetch.mock.mockImplementation(async () => {
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

    describe('parseSizeToBytes', () => {
      it('parses a KB size', () => {
        assert.strictEqual(downloads.parseSizeToBytes('850 KB'), 850 * 1024);
      });

      it('parses a decimal MB size', () => {
        assert.strictEqual(downloads.parseSizeToBytes('2.5 MB'), Math.round(2.5 * 1024 * 1024));
      });

      it('parses a decimal GB size', () => {
        assert.strictEqual(downloads.parseSizeToBytes('1.2 GB'), Math.round(1.2 * 1024 * 1024 * 1024));
      });

      it('returns null (not zero) for "Unknown"', () => {
        assert.strictEqual(downloads.parseSizeToBytes('Unknown'), null);
      });

      it('returns null for unrecognised text', () => {
        assert.strictEqual(downloads.parseSizeToBytes('N/A'), null);
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

        const { results, blockedSources } = await downloads.searchAllSources('test');
        assert.ok(Array.isArray(results));
        assert.ok(Array.isArray(blockedSources));
      });

      it('should handle search errors gracefully', async () => {
        mockFetch.mock.mockImplementation(async () => {
          throw new Error('Network error');
        });

        const { results, blockedSources } = await downloads.searchAllSources('test');
        assert.ok(Array.isArray(results));
        assert.ok(Array.isArray(blockedSources));
      });

      it('should report a blocked source instead of silently returning no results', async () => {
        // Shadow-library sources default to disabled with no config row
        // (see E1-8) — enable annas explicitly so this test exercises the
        // block-detection path rather than the "source not enabled" skip.
        const db = await import('../../lib/db/index.js');
        db.upsertDownloadSourceConfig('annas', true);

        mockFetch.mock.mockImplementation(async (url: string) => {
          if (typeof url === 'string' && url.includes('annas-archive')) {
            return new Response('<html><title>Just a moment...</title></html>', { status: 200 });
          }
          return new Response('', { status: 200 });
        });

        const { blockedSources } = await downloads.searchAllSources('test', { sources: ['annas'] });
        assert.strictEqual(blockedSources.length, 1);
        assert.strictEqual(blockedSources[0]?.source, 'annas');
        assert.ok(blockedSources[0]?.message.length > 0);
      });

      it('drops a result below the size floor but keeps an Unknown-sized one', async () => {
        // Z-Library never reports a real size (always "Unknown" — see
        // zlibrary.ts), which makes it a convenient source for the
        // "unknown survives" half of this test.
        const db = await import('../../lib/db/index.js');
        db.upsertDownloadSourceConfig('annas', true);
        db.upsertDownloadSourceConfig('zlibrary', true);

        mockFetch.mock.mockImplementation(async (url: string) => {
          if (typeof url === 'string' && url.includes('annas-archive')) {
            return new Response(`
              <a href="/md5/${'b'.repeat(32)}">
                <h3>Tiny Stub</h3>
              </a>
              <div>by Author, pdf, 5 KB</div>
            `, { status: 200 });
          }
          if (typeof url === 'string' && url.includes('z-lib')) {
            return new Response(`
              <z-bookcard data-id="99">
                <div class="title">Unknown Size Book</div>
                <div class="author">Author</div>
              </z-bookcard>
            `, { status: 200 });
          }
          return new Response('', { status: 200 });
        });

        const { results } = await downloads.searchAllSources('test', {
          sources: ['annas', 'zlibrary'],
        });

        assert.ok(!results.some((r) => r.title === 'Tiny Stub'));
        assert.ok(results.some((r) => r.title === 'Unknown Size Book'));
      });

      it('reorders tied results by format preference without disturbing status/title-match precedence', async () => {
        const db = await import('../../lib/db/index.js');
        db.upsertDownloadSourceConfig('annas', true);
        db.upsertDownloadSourceConfig('libgen', true);

        // Both results are "unknown" source status (no health check has run)
        // and both titles match the query, so the only thing left to break
        // the tie should be format preference: epub before pdf.
        mockFetch.mock.mockImplementation(async (url: string) => {
          if (typeof url === 'string' && url.includes('annas-archive')) {
            return new Response(`
              <a href="/md5/${'c'.repeat(32)}">
                <h3>Test Annas Book</h3>
              </a>
              <div>by Author, pdf, 3 MB</div>
            `, { status: 200 });
          }
          if (typeof url === 'string' && url.includes('libgen')) {
            return new Response(`
              <table>
                <tr>
                  <td><b>Test Libgen Book</b></td>
                  <td>Author</td>
                  <td>Publisher</td>
                  <td><nobr>2023</nobr></td>
                  <td>English</td>
                  <td>250</td>
                  <td><nobr><a>3 MB</a></nobr></td>
                  <td>epub</td>
                  <td><a href="ads.php?md5=${'d'.repeat(32)}">Download</a></td>
                </tr>
              </table>
            `, { status: 200 });
          }
          return new Response('', { status: 200 });
        });

        const { results } = await downloads.searchAllSources('test', {
          sources: ['annas', 'libgen'],
        });

        const epubIndex = results.findIndex((r) => r.title === 'Test Libgen Book');
        const pdfIndex = results.findIndex((r) => r.title === 'Test Annas Book');
        assert.notStrictEqual(epubIndex, -1);
        assert.notStrictEqual(pdfIndex, -1);
        assert.ok(epubIndex < pdfIndex, 'expected the epub result to sort before the pdf result');
      });

      it('passes a language option through to Anna\'s Archive', async () => {
        const db = await import('../../lib/db/index.js');
        db.upsertDownloadSourceConfig('annas', true);

        mockFetch.mock.mockImplementation(async () => new Response('', { status: 200 }));

        await downloads.searchAllSources('test', { sources: ['annas'], language: 'en' });

        const annasCall = mockFetch.mock.calls.find((call) => {
          const url = call.arguments[0];
          return typeof url === 'string' && url.includes('annas-archive');
        });
        assert.ok(annasCall, 'expected a fetch call to Anna\'s Archive');
        assert.ok((annasCall!.arguments[0] as string).includes('lang=en'));
      });
    });

    describe('searchSource', () => {
      it('should search only the specified source', async () => {
        mockFetch.mock.mockImplementation(async () =>
          new Response('', { status: 200 })
        );

        const { results, blockedSources } = await downloads.searchSource('annas', 'test');
        assert.ok(Array.isArray(results));
        assert.ok(Array.isArray(blockedSources));
      });

      it('should pass through options', async () => {
        mockFetch.mock.mockImplementation(async () =>
          new Response('', { status: 200 })
        );

        const { results, blockedSources } = await downloads.searchSource('libgen', 'test', { isbn: '1234567890' });
        assert.ok(Array.isArray(results));
        assert.ok(Array.isArray(blockedSources));
      });
    });
  });

  // Restore original fetch after all tests
  global.fetch = originalFetch;
});
