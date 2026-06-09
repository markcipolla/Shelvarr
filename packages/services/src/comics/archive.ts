/**
 * Comic archive utilities for streaming/extracting comic files.
 * Supports PDF, CBZ/ZIP (streamed), and CBR/RAR (extracted + re-zipped to CBZ).
 */
import { createReadStream, readFileSync, statSync } from 'fs';
import { extname } from 'path';
import { Readable } from 'stream';
import { createRequire } from 'module';
import { getServiceConfig } from '../config';

// Use createRequire to resolve native/CJS packages from this module's location.
// import.meta.url is available in ESM (Node.js and Next.js App Router server).
const _require = createRequire(import.meta.url);

export interface ComicArchiveResult {
  contentType: string;
  body: ReadableStream | Buffer;
  filename: string;
}

/**
 * Remap a filepath using KAPOWARR_PATH_MAP ("from:to").
 * E.g. if pathMap = "/media/kapowarr:/comics", a filepath starting with
 * "/media/kapowarr" will have that prefix replaced with "/comics".
 */
export function remapComicPath(filepath: string): string {
  const pathMap = getServiceConfig().kapowarr.pathMap;
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

/**
 * Open a comic archive and return the content to stream to the client.
 * - PDF → stream raw bytes, Content-Type: application/pdf
 * - CBZ/ZIP → stream raw bytes, Content-Type: application/x-cbz
 * - CBR/RAR → extract images, re-zip to CBZ, Content-Type: application/x-cbz
 */
export async function openComicArchive(filepath: string): Promise<ComicArchiveResult> {
  const real = remapComicPath(filepath);

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
    // Read the RAR file and extract images, then re-zip as CBZ
    const rarData = readFileSync(real);

    // Load wasm binary from node-unrar-js distribution
    // resolve('node-unrar-js') → .../node-unrar-js/dist/index.js
    const unrarPkg = _require.resolve('node-unrar-js');
    const unrarDistDir = unrarPkg.slice(0, unrarPkg.lastIndexOf('/'));
    const wasmPath = unrarDistDir + '/js/unrar.wasm';
    const wasmBinary = readFileSync(wasmPath).buffer as ArrayBuffer;

    // Import dynamically since it's a CommonJS module re-exported
    const { createExtractorFromData } = await import('node-unrar-js');
    const extractor = await createExtractorFromData({
      wasmBinary,
      data: rarData.buffer as ArrayBuffer,
    });

    const { files } = extractor.extract();

    // Collect image files and sort by name (numeric ordering)
    const IMAGE_RE = /\.(jpe?g|png|gif|webp)$/i;
    const imageFiles: Array<{ name: string; data: Uint8Array }> = [];

    for (const file of files) {
      if (file.fileHeader.flags.directory) continue;
      if (!IMAGE_RE.test(file.fileHeader.name)) continue;
      if (!file.extraction) continue;
      imageFiles.push({ name: file.fileHeader.name, data: file.extraction });
    }

    // Sort by name to maintain reading order
    imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

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
