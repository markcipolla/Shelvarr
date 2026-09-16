/**
 * Comic archive utilities for streaming/extracting comic files.
 * Supports PDF, CBZ/ZIP (streamed), and CBR/RAR (extracted + re-zipped to CBZ).
 */
import { createReadStream, readFileSync, statSync } from 'fs';
import { extname } from 'path';
import { Readable } from 'stream';
import { getServiceConfig } from '../config';

export interface ComicArchiveResult {
  contentType: string;
  body: ReadableStream | Buffer;
  filename: string;
}

/**
 * Remap a filepath recorded by a previous manager, using the migration path
 * map ("from:to").
 *
 * E.g. with `"/comics-1:/libraries/comics"`, a path starting `/comics-1` is
 * rewritten to `/libraries/comics`. Volumes Shelvarr manages record their own
 * paths and need no remapping.
 */
export function remapComicPath(filepath: string): string {
  const pathMap = getServiceConfig().comicPaths.pathMap;
  if (!pathMap) return filepath;
  const sep = pathMap.indexOf(':');
  if (sep < 0) return filepath;
  const from = pathMap.slice(0, sep);
  const to = pathMap.slice(sep + 1);
  if (filepath.startsWith(from)) {
    return to + filepath.slice(from.length);
  }
  return filepath;
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
 * Open a comic archive and return the content to stream to the client.
 * - PDF → stream raw bytes, Content-Type: application/pdf
 * - CBZ/ZIP → stream raw bytes, Content-Type: application/x-cbz
 * - CBR/RAR → extract images, re-zip to CBZ, Content-Type: application/x-cbz
 */
export interface OpenComicArchiveOptions {
  /**
   * Apply the migration prefix remap. Only paths recorded by a previous
   * manager need it; Shelvarr's own library paths are already local, so
   * managed volumes pass `false`.
   */
  remap?: boolean;
}

export async function openComicArchive(
  filepath: string,
  options: OpenComicArchiveOptions = {}
): Promise<ComicArchiveResult> {
  const real = options.remap === false ? filepath : remapComicPath(filepath);

  // Verify file exists (throws ENOENT otherwise, which we map to 404)
  statSync(real);

  const ext = extname(real).toLowerCase().replace('.', '');
  const basename = real.split('/').pop() || 'comic';
  const basenameWithoutExt = basename.replace(/\.[^.]+$/, '');

  if (ext === 'pdf') {
    const stream = createReadStream(real);
    const webStream = Readable.toWeb(stream) as ReadableStream;
    return {
      contentType: 'application/pdf',
      body: webStream,
      filename: basename,
    };
  }

  if (ext === 'cbz' || ext === 'zip') {
    const stream = createReadStream(real);
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
    const imageFiles = await extractComicImages(real, ext);

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
