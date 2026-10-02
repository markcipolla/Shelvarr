/**
 * Comic archive utilities for streaming/extracting comic files.
 * Supports PDF, CBZ/ZIP (streamed), and CBR/RAR (extracted + re-zipped to CBZ).
 */
import { createReadStream, readFileSync, statSync } from 'fs';
import { readFile } from 'fs/promises';
import { extname } from 'path';
import { Readable } from 'stream';

export interface ComicArchiveResult {
  contentType: string;
  body: ReadableStream | Buffer;
  filename: string;
}

/** Image extensions recognized as comic pages, across both archive formats. */
const IMAGE_RE = /\.(jpe?g|png|gif|webp)$/i;

export interface ExtractedImage {
  name: string;
  data: Uint8Array;
}

/**
 * Extract every image entry from a CBZ/ZIP or CBR/RAR archive, sorted into
 * reading order.
 *
 * Shared by {@link openComicArchive} (which re-zips a CBR's images into a
 * CBZ for the whole-file route) and the per-page cache in `comics/pages.ts`
 * (which writes each image to its own file), so the format-specific
 * unzip/unrar handling lives in exactly one place. `ext` is the lowercase
 * extension without a leading dot, as already computed by callers.
 */
export async function extractComicImages(filepath: string, ext: string): Promise<ExtractedImage[]> {
  if (ext === 'cbz' || ext === 'zip') {
    const { unzipSync } = await import('fflate');
    const data = readFileSync(filepath);
    const entries = unzipSync(data);

    const images: ExtractedImage[] = [];
    for (const [name, bytes] of Object.entries(entries)) {
      if (!IMAGE_RE.test(name)) continue;
      images.push({ name, data: bytes });
    }
    images.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    return images;
  }

  if (ext === 'cbr' || ext === 'rar') {
    // Read the RAR file and extract images.
    const rarData = readFileSync(filepath);

    // node-unrar-js is kept external (serverExternalPackages in next.config),
    // so let it self-load its bundled unrar.wasm via its own __dirname. Do NOT
    // resolve the wasm path with require.resolve here: Next's bundler rewrites
    // require.resolve to a numeric webpack module id, which then breaks (e.g.
    // "<id>.lastIndexOf is not a function").
    const { createExtractorFromData } = await import('node-unrar-js');
    const extractor = await createExtractorFromData({
      data: rarData.buffer as ArrayBuffer,
    });

    const { files } = extractor.extract();

    const images: ExtractedImage[] = [];
    for (const file of files) {
      if (file.fileHeader.flags.directory) continue;
      if (!IMAGE_RE.test(file.fileHeader.name)) continue;
      if (!file.extraction) continue;
      images.push({ name: file.fileHeader.name, data: file.extraction });
    }

    // Sort by name to maintain reading order
    images.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    return images;
  }

  throw new Error(`Unsupported comic format for page extraction: ${ext || 'unknown'}`);
}

/**
 * Pull a single entry out of a CBZ/ZIP or CBR/RAR without decompressing the
 * rest of it.
 *
 * {@link extractComicImages} exists to get *everything* out of an archive;
 * this is the opposite errand — "is ComicInfo.xml in here, and what does it
 * say?" — and the difference in cost matters, because the scanner asks it of
 * every file in a volume folder. Both back-ends can filter: fflate only
 * inflates entries its `filter` accepts, and node-unrar-js takes a
 * per-header predicate on `extract()`. A solid RAR still has to walk the
 * members before ours to reach it — that is what "solid" means — but nothing
 * is decompressed out for them.
 *
 * **Deliberately asynchronous, unlike everything else in this file.** The
 * sibling functions here are synchronous and the module doc on
 * `comics/pages.ts` is largely an apology for it: one person opening a large
 * CBR stalls the event loop for everyone. That is survivable there because
 * it happens once per issue and is cached. It would not be survivable here,
 * because a scan walks *every* file in a volume folder — a hundred-issue
 * volume would mean a hundred blocking reads and inflations back to back.
 * So this one reads with `fs/promises` and hands the inflation to fflate's
 * callback API, which does the work off-thread.
 *
 * What is not solved is peak memory: the archive is still read whole before
 * one entry is picked out of it. Avoiding that means seeking the zip central
 * directory from the file's tail, which is a real piece of work for a cost
 * that is already bounded to one archive at a time — the same peak
 * `openComicArchive` has always had.
 *
 * Returns `null` when no entry matches, and throws whatever the reader
 * throws for an unreadable file: what a broken archive means is the caller's
 * decision, not this function's.
 */
export async function extractComicEntry(
  filepath: string,
  ext: string,
  matches: (name: string) => boolean
): Promise<Uint8Array | null> {
  if (ext === 'cbz' || ext === 'zip') {
    const { unzip } = await import('fflate');
    const data = await readFile(filepath);
    const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
      unzip(data, { filter: (file) => matches(file.name) }, (err, unzipped) => {
        if (err) reject(err);
        else resolve(unzipped);
      });
    });
    return Object.values(entries)[0] ?? null;
  }

  if (ext === 'cbr' || ext === 'rar') {
    const rarData = await readFile(filepath);
    // Buffers under 4 KiB are views into Node's shared pool, so `.buffer`
    // alone would hand unrar the whole pool. Slice to this file's own bytes.
    const bytes = rarData.buffer.slice(
      rarData.byteOffset,
      rarData.byteOffset + rarData.byteLength
    ) as ArrayBuffer;

    // Same caution as extractComicImages: let node-unrar-js self-load its
    // bundled unrar.wasm, never resolve the path with require.resolve.
    const { createExtractorFromData } = await import('node-unrar-js');
    const extractor = await createExtractorFromData({ data: bytes });

    const { files } = extractor.extract({
      files: (header) => !header.flags.directory && matches(header.name),
    });
    // `files` is a generator and extraction happens as it is walked, so the
    // loop is what actually does the work.
    for (const file of files) {
      if (file.extraction) return file.extraction;
    }
    return null;
  }

  return null;
}

/**
 * Open a comic archive and return the content to stream to the client.
 * - PDF → stream raw bytes, Content-Type: application/pdf
 * - CBZ/ZIP → stream raw bytes, Content-Type: application/x-cbz
 * - CBR/RAR → extract images, re-zip to CBZ, Content-Type: application/x-cbz
 */
export async function openComicArchive(filepath: string): Promise<ComicArchiveResult> {
  // Verify file exists (throws ENOENT otherwise, which we map to 404)
  statSync(filepath);

  const ext = extname(filepath).toLowerCase().replace('.', '');
  const basename = filepath.split('/').pop() || 'comic';
  const basenameWithoutExt = basename.replace(/\.[^.]+$/, '');

  if (ext === 'pdf') {
    const stream = createReadStream(filepath);
    const webStream = Readable.toWeb(stream) as ReadableStream;
    return {
      contentType: 'application/pdf',
      body: webStream,
      filename: basename,
    };
  }

  if (ext === 'cbz' || ext === 'zip') {
    const stream = createReadStream(filepath);
    const webStream = Readable.toWeb(stream) as ReadableStream;
    return {
      contentType: 'application/x-cbz',
      body: webStream,
      filename: ext === 'cbz' ? basename : `${basenameWithoutExt}.cbz`,
    };
  }

  if (ext === 'cbr' || ext === 'rar') {
    // node-unrar-js is kept external (serverExternalPackages in next.config),
    // so let it self-load its bundled unrar.wasm via its own __dirname. Do NOT
    // resolve the wasm path with require.resolve here: Next's bundler rewrites
    // require.resolve to a numeric webpack module id, which then breaks (e.g.
    // "<id>.lastIndexOf is not a function"). extractComicImages carries this
    // same caution forward for its own node-unrar-js import.
    const imageFiles = await extractComicImages(filepath, ext);

    // Build a zip (CBZ) using fflate
    const { zipSync } = await import('fflate');
    const zipInput: Record<string, Uint8Array> = {};
    for (const img of imageFiles) {
      // Flatten to just the base filename to avoid nested paths in the zip
      const imgName = img.name.split(/[/\\]/).pop() || img.name;
      zipInput[imgName] = img.data;
    }

    const zipped = zipSync(zipInput);
    const cbzBuffer = Buffer.from(zipped);

    return {
      contentType: 'application/x-cbz',
      body: cbzBuffer,
      filename: `${basenameWithoutExt}.cbz`,
    };
  }

  throw new Error(`Unsupported comic format: ${ext || 'unknown'}`);
}
