import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer, type Server } from 'http';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { zipSync, strToU8 } from 'fflate';

import { initServiceConfig } from '@shelvarr/services';
import { extractChapters } from '@shelvarr/services/audiobook/epub';
import {
  chunkText,
  getKokoroConfig,
  listVoices,
  SETTING_KEYS,
} from '@shelvarr/services/audiobook/kokoro';
import {
  generateAudiobook,
  readManifest,
  resolveTrack,
  audiobookDir,
} from '@shelvarr/services/audiobook/index';

/** Build a minimal but realistic EPUB on disk and return its path. */
function writeTestEpub(dir: string): string {
  const doc = (title: string, body: string) => `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head>
<body><h1>${title}</h1>${body}</body></html>`;

  const longPara = 'The quick brown fox jumped over the lazy dog. '.repeat(120);

  const files = {
    'mimetype': strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`),
    'OEBPS/content.opf': strToU8(`<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <manifest>
    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
  </manifest>
  <spine>
    <itemref idref="cover"/>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
  </spine>
</package>`),
    // Below the minimum length, so it should not become a track.
    'OEBPS/cover.xhtml': strToU8(doc('Cover', '<p>Cover</p>')),
    'OEBPS/text/ch1.xhtml': strToU8(
      doc('Chapter One: A &amp; B', `<p>${longPara}</p><p>Caf&#233; &mdash; na&#239;ve.</p><style>p{color:red}</style>`)
    ),
    'OEBPS/text/ch2.xhtml': strToU8(
      doc('Chapter/Two: "Quoted"', `<p>${'Short but real chapter text. '.repeat(10)}</p>`)
    ),
  };

  const epubPath = join(dir, 'Test Author - Test Book.epub');
  writeFileSync(epubPath, Buffer.from(zipSync(files)));
  return epubPath;
}

describe('Audiobook generation', () => {
  let workDir: string;
  let epubPath: string;
  let server: Server;
  let requests: Array<Record<string, unknown>>;
  let db: { setSetting: (k: string, v: unknown) => void; execute: (sql: string, p?: unknown[]) => unknown } | null = null;

  before(async () => {
    workDir = mkdtempSync(join(tmpdir(), 'shelvarr-audiobook-test-'));
    epubPath = writeTestEpub(workDir);
    requests = [];

    // Stub standing in for kokoro-fastapi's OpenAI-compatible endpoint.
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        if (req.url === '/v1/audio/voices') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
            .end(JSON.stringify({ voices: ['af_bella', 'bm_george'] }));
          return;
        }
        if (req.url !== '/v1/audio/speech') {
          res.writeHead(404).end();
          return;
        }
        requests.push(JSON.parse(body));
        res.writeHead(200, { 'Content-Type': 'audio/mpeg' })
          .end(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(64, 1)]));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };

    initServiceConfig({
      env: 'test',
      port: 3000,
      dataDir: workDir,
      libraryRoot: workDir,
      dbPath: join(workDir, 'test.db'),
      komga: { url: null, apiKey: null },
      kapowarr: { url: null, apiKey: null, pathMap: null },
      kokoro: { url: `http://127.0.0.1:${port}`, voice: 'af_bella', model: 'kokoro', speed: 1 },
      supportedExtensions: ['.epub'],
      rateLimits: { hardcover: 60 },
      hardcoverToken: null,
    });

    // A database is only needed for the settings-precedence tests; without the
    // native module the service must still work from environment config alone.
    try {
      const mod = await import('@shelvarr/db');
      mod.initDatabase(join(workDir, 'test.db'));
      db = { setSetting: mod.setSetting, execute: mod.execute };
    } catch {
      db = null;
    }
  });

  after(() => {
    server?.close();
    rmSync(workDir, { recursive: true, force: true });
  });

  describe('extractChapters', () => {
    it('returns spine documents in reading order, skipping short ones', () => {
      const chapters = extractChapters(epubPath);
      assert.strictEqual(chapters.length, 2);
      assert.strictEqual(chapters[0]!.index, 1);
      assert.strictEqual(chapters[1]!.index, 2);
    });

    it('reads the chapter title from the first heading', () => {
      assert.strictEqual(extractChapters(epubPath)[0]!.title, 'Chapter One: A & B');
    });

    it('decodes entities and strips markup', () => {
      const { text } = extractChapters(epubPath)[0]!;
      assert.ok(text.includes('Café — naïve.'));
      assert.ok(!text.includes('color:red'), 'style blocks should be removed');
      assert.ok(!/[<>]/.test(text), 'no tags should survive');
    });

    it('throws on a file that is not an EPUB', () => {
      const bogus = join(workDir, 'not-an-epub.epub');
      writeFileSync(bogus, 'this is not a zip');
      assert.throws(() => extractChapters(bogus));
    });
  });

  describe('chunkText', () => {
    it('splits long text into pieces within the size limit', () => {
      const chunks = chunkText(extractChapters(epubPath)[0]!.text);
      assert.ok(chunks.length > 1);
      assert.ok(chunks.every((c) => c.length <= 1500));
      assert.ok(chunks.every((c) => c.trim().length > 0));
    });

    it('preserves every word', () => {
      const text = extractChapters(epubPath)[0]!.text;
      assert.strictEqual(
        chunkText(text).join(' ').replace(/\s+/g, ' '),
        text.replace(/\s+/g, ' ')
      );
    });

    it('breaks a single oversized sentence', () => {
      const chunks = chunkText('word '.repeat(1000), 100);
      assert.ok(chunks.length > 1);
      assert.ok(chunks.every((c) => c.length <= 100));
    });
  });

  describe('generateAudiobook', () => {
    it('writes one mp3 per chapter next to the source file', async () => {
      const result = await generateAudiobook(
        { bookId: 42, bookPath: epubPath, title: 'Test Book' },
        {}
      );

      const outDir = audiobookDir(epubPath);
      assert.strictEqual(outDir, join(workDir, 'Test Author - Test Book Audiobook'));

      const written = readdirSync(outDir).sort();
      assert.deepStrictEqual(written, [
        '001 - Chapter One A & B.mp3',
        '002 - ChapterTwo Quoted.mp3',
        'audiobook.json',
      ]);
      assert.strictEqual(result.chapters, 2);
      assert.strictEqual(result.reused, 0);
    });

    it('leaves no partial files behind', () => {
      assert.ok(!readdirSync(audiobookDir(epubPath)).some((f) => f.endsWith('.part')));
    });

    it('sends one mp3 request per chunk with the configured voice', () => {
      assert.ok(requests.length > 0);
      assert.ok(requests.every((r) => r['response_format'] === 'mp3'));
      assert.ok(requests.every((r) => r['voice'] === 'af_bella' && r['model'] === 'kokoro'));
      assert.ok(requests.every((r) => String(r['input']).trim().length > 0));
    });

    it('concatenates chunk audio into the chapter track', () => {
      const chunks = chunkText(extractChapters(epubPath)[0]!.text);
      const track = join(audiobookDir(epubPath), '001 - Chapter One A & B.mp3');
      assert.strictEqual(statSync(track).size, 67 * chunks.length);
    });

    it('reports monotonic progress that ends at the total', async () => {
      const progress: Array<[number, number]> = [];
      const result = await generateAudiobook(
        { bookId: 42, bookPath: epubPath, title: 'Test Book' },
        { onProgress: (c, t) => progress.push([c, t]), force: true }
      );

      const last = progress.at(-1)!;
      assert.strictEqual(last[0], last[1]);
      assert.strictEqual(last[1], result.chunks);
      assert.ok(progress.every((p, i) => i === 0 || p[0] >= progress[i - 1]![0]));
    });

    it('reuses existing tracks on a re-run', async () => {
      const before = requests.length;
      const result = await generateAudiobook(
        { bookId: 42, bookPath: epubPath, title: 'Test Book' },
        {}
      );
      assert.strictEqual(result.reused, 2);
      assert.strictEqual(requests.length, before, 'no TTS calls for existing tracks');
    });

    it('re-narrates everything when forced', async () => {
      const before = requests.length;
      const result = await generateAudiobook(
        { bookId: 42, bookPath: epubPath, title: 'Test Book' },
        { force: true }
      );
      assert.strictEqual(result.reused, 0);
      assert.ok(requests.length > before);
    });

    it('aborts when the signal is already cancelled', async () => {
      const controller = new AbortController();
      controller.abort();
      await assert.rejects(
        () => generateAudiobook(
          { bookId: 42, bookPath: epubPath, title: 'Test Book' },
          { signal: controller.signal, force: true }
        ),
        /cancel/i
      );
    });

    it('rejects non-EPUB files', async () => {
      const pdf = join(workDir, 'book.pdf');
      writeFileSync(pdf, 'pdf');
      await assert.rejects(
        () => generateAudiobook({ bookId: 1, bookPath: pdf, title: 'PDF' }, {}),
        /EPUB only/
      );
    });
  });

  describe('readManifest', () => {
    it('records the book, voice and tracks', () => {
      const manifest = readManifest(epubPath);
      assert.ok(manifest);
      assert.strictEqual(manifest.bookId, 42);
      assert.strictEqual(manifest.title, 'Test Book');
      assert.strictEqual(manifest.voice, 'af_bella');
      assert.strictEqual(manifest.tracks.length, 2);
    });

    it('returns null when no audiobook exists', () => {
      assert.strictEqual(readManifest(join(workDir, 'Nonexistent.epub')), null);
    });
  });

  describe('getKokoroConfig', () => {
    /** Remove saved settings so each case starts from environment config. */
    const clearSettings = () => {
      for (const key of Object.values(SETTING_KEYS)) {
        db?.execute('DELETE FROM settings WHERE key = ?', [key]);
      }
    };

    it('falls back to environment config when nothing is saved', () => {
      clearSettings();
      const config = getKokoroConfig();
      assert.strictEqual(config.voice, 'af_bella');
      assert.strictEqual(config.model, 'kokoro');
      assert.strictEqual(config.speed, 1);
    });

    it('prefers saved settings over environment config', (t) => {
      if (!db) return t.skip('database unavailable');
      clearSettings();

      db.setSetting(SETTING_KEYS.voice, 'bm_george');
      db.setSetting(SETTING_KEYS.model, 'kokoro-v1');
      db.setSetting(SETTING_KEYS.speed, '1.25');

      const config = getKokoroConfig();
      assert.strictEqual(config.voice, 'bm_george');
      assert.strictEqual(config.model, 'kokoro-v1');
      assert.strictEqual(config.speed, 1.25);

      clearSettings();
    });

    it('ignores blank and unparseable saved values', (t) => {
      if (!db) return t.skip('database unavailable');
      clearSettings();

      db.setSetting(SETTING_KEYS.voice, '   ');
      db.setSetting(SETTING_KEYS.speed, 'not-a-number');

      const config = getKokoroConfig();
      assert.strictEqual(config.voice, 'af_bella', 'blank voice falls back to env');
      assert.strictEqual(config.speed, 1, 'unparseable speed falls back to env');

      clearSettings();
    });

    it('uses a saved voice when narrating', async (t) => {
      if (!db) return t.skip('database unavailable');
      clearSettings();
      db.setSetting(SETTING_KEYS.voice, 'bm_george');

      const before = requests.length;
      await generateAudiobook(
        { bookId: 42, bookPath: epubPath, title: 'Test Book' },
        { force: true }
      );

      assert.ok(requests.length > before);
      assert.ok(
        requests.slice(before).every((r) => r['voice'] === 'bm_george'),
        'saved voice should reach the TTS request'
      );
      assert.strictEqual(readManifest(epubPath)?.voice, 'bm_george');

      clearSettings();
    });
  });

  describe('listVoices', () => {
    it('returns the voices the server offers', async () => {
      const { port } = server.address() as { port: number };
      assert.deepStrictEqual(await listVoices(`http://127.0.0.1:${port}`), [
        'af_bella',
        'bm_george',
      ]);
    });

    it('accepts a base URL that already ends in /v1', async () => {
      const { port } = server.address() as { port: number };
      const voices = await listVoices(`http://127.0.0.1:${port}/v1`);
      assert.ok(voices.includes('af_bella'));
    });

    it('throws when the server rejects the request', async () => {
      const { port } = server.address() as { port: number };
      await assert.rejects(() => listVoices(`http://127.0.0.1:${port}/nope`), /HTTP 404/);
    });
  });

  describe('resolveTrack', () => {
    it('resolves a real track', () => {
      const track = '001 - Chapter One A & B.mp3';
      assert.strictEqual(
        resolveTrack(epubPath, track),
        join(audiobookDir(epubPath), track)
      );
    });

    it('refuses paths that escape the audiobook directory', () => {
      assert.strictEqual(resolveTrack(epubPath, '../../etc/passwd'), null);
      assert.strictEqual(resolveTrack(epubPath, 'a/../../secret.mp3'), null);
    });

    it('refuses non-mp3 and missing files', () => {
      assert.strictEqual(resolveTrack(epubPath, 'audiobook.json'), null);
      assert.strictEqual(resolveTrack(epubPath, '999 - nope.mp3'), null);
    });
  });
});
