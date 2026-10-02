/**
 * Extract-once page cache for comics and CBZ/CBR books alike.
 *
 * `openComicArchive` (archive.ts) does the whole job in one call: for a CBR
 * it synchronously reads the whole file, unrars every entry, and re-zips them
 * into a CBZ in memory, all on the request that happens to open the issue.
 * That cost — potentially seconds of blocked event loop for a large archive —
 * is paid on *every* open, by *every* reader, because nothing is kept
 * between requests.
 *
 * This module pays it once. The first request for an item's pages (through
 * either `/pages` or `/pages/:n`) extracts every image to its own file under
 * a per-item cache directory; every later request for that item just reads
 * a file off disk.
 *
 * Nothing here is actually comic-specific — a CBZ/CBR shelved as a "book" is
 * the same archive format, extracted the same way. Callers distinguish their
 * cache entries with `EnsurePagesOptions.namespace` ('comic', the default, or
 * 'book'), which only changes which cache-root subdirectory an entry lands
 * in, so a comic issue and a book never collide even if both happened to
 * reuse the same id number.
 *
 * PDF decision: a PDF has no independent "page image" the way a CBZ/CBR
 * does — its pages are rendered from PDF content streams, not stored as
 * discrete image files an extractor can just copy out. Building that
 * rendering pipeline is a materially different feature (and a different
 * card), so PDFs are explicitly out of scope for this API for now: an issue
 * whose file is a PDF makes `ensureIssuePagesExtracted` throw
 * {@link PdfNotPaginatedError}, and the existing whole-file route
 * (`/api/comics/issues/:id/file`) remains the only way to read one.
 *
 * Worker-thread extraction: explicitly out of scope here too. Moving the
 * CPU-bound unrar/inflate work off the main thread would stop it blocking
 * the event loop even on the first, cache-populating request — but this
 * codebase already has a documented fragility around bundling node-unrar-js's
 * wasm under Next's webpack bundler (see the comment in archive.ts about
 * `require.resolve` breaking), and introducing `worker_threads` risks a
 * similar integration headache that only a real running server can surface,
 * not a unit test. Left as a follow-up. The cache below is still a major win
 * on its own: the blocking cost drops from "every open" to "once per issue".
 */
import { createHash } from 'crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { extname, join } from 'path';

import { extractComicImages } from './archive';
import { readImageDimensions } from './dimensions';
import { getServiceConfig } from '../config';
import { createLogger } from '../utils/logger';

const log = createLogger('comics-pages');

/** Image extensions a cached page file can have. */
const IMAGE_RE = /\.(jpe?g|png|gif|webp)$/i;

/**
 * Sidecar file inside a cache directory holding each page's pixel
 * dimensions, so the reader can tell a double-page spread from an ordinary
 * page without downloading every page first.
 *
 * Kept beside the pages rather than in the database because it describes the
 * *extraction*, not the issue: it is only ever valid for the exact file the
 * cache key was derived from, and it should disappear with the cache
 * directory when that file is replaced. Its name has no image extension, so
 * {@link readCachedPageFiles} never mistakes it for a page.
 */
const DIMENSIONS_FILE = 'dimensions.json';

/**
 * How much of a cached page file to read when backfilling dimensions for a
 * cache directory extracted before this existed.
 *
 * Every format's size header sits in the first few hundred bytes, except
 * JPEG, where a large EXIF block or an embedded thumbnail can push the
 * start-of-frame marker further in. 64 KB clears that with room to spare
 * while keeping the backfill from reading whole multi-megabyte scans back
 * off disk — on a long issue the difference is tens of megabytes of blocking
 * I/O on somebody's first page request. A page whose header somehow sits
 * past the window simply gets null dimensions and is shown unsplit.
 */
const HEADER_PROBE_BYTES = 64 * 1024;

/**
 * How long an extracted cache directory is kept before it becomes eligible
 * for cleanup on the next cache miss.
 *
 * This is a minimal stopgap, not a real sweep: it only ever runs as a side
 * effect of populating a new cache entry, so a server where every issue has
 * already been opened once never revisits old directories at all. If that
 * proves insufficient, a proper scheduled sweep — mirroring
 * `comics/scratch.ts` and the `comic_resume`-style scheduled tasks — would be
 * the natural follow-up; it is not built here.
 */
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** A PDF has no per-page image to serve; see the module doc comment. */
export class PdfNotPaginatedError extends Error {
  constructor() {
    super('PDF issues are not paginated by this API; use the whole-file route instead.');
    this.name = 'PdfNotPaginatedError';
  }
}

/** Which cache-root subdirectory an entry belongs to; see the module doc comment. */
export type PageCacheNamespace = 'comic' | 'book';

export interface EnsurePagesOptions {
  /** Defaults to 'comic'. */
  namespace?: PageCacheNamespace;
}

/**
 * One page's pixel size, or nulls where it could not be read.
 *
 * Nulls are normal, not a failure: a corrupt page, a format whose header
 * this build does not recognise, or a JPEG with an unusually long preamble
 * all land here, and all of them mean the same thing to a reader — show the
 * page whole and do not try to be clever about it.
 */
export interface PageDimensions {
  /** 1-based page number, matching the `/pages/:n` route. */
  n: number;
  w: number | null;
  h: number | null;
}

export interface IssuePages {
  /** Absolute path to this item's cache directory. */
  dir: string;
  /** Cached page filenames, already in reading order — index 0 is page 1. */
  files: string[];
  /** Page sizes, in the same order as {@link files}. */
  pages: PageDimensions[];
}

function cacheRoot(namespace: PageCacheNamespace): string {
  return join(getServiceConfig().dataDir, `${namespace}-pages-cache`);
}

/**
 * Key a cache directory off the file actually on disk (path + size + mtime),
 * not just the id, so a file replaced on disk — a re-download, a
 * higher-quality re-scan — earns a fresh extraction instead of serving pages
 * from whatever used to be at that path. A hash keeps the directory name
 * short and filesystem-safe regardless of what the source path looks like.
 */
function cacheKey(namespace: PageCacheNamespace, id: number, real: string, size: number, mtimeMs: number): string {
  const hash = createHash('sha1').update(`${real}:${size}:${mtimeMs}`).digest('hex').slice(0, 16);
  return `${namespace}-${id}-${hash}`;
}

/** Existing cached page filenames for a cache directory, in reading order. */
function readCachedPageFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => IMAGE_RE.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Read the first {@link HEADER_PROBE_BYTES} of a file without pulling the
 * whole thing into memory. Returns an empty array on any I/O trouble — the
 * caller's answer for "I could not size this page" is the same as for "this
 * page has no readable header", so there is nothing to distinguish.
 */
function readFileHeader(path: string): Uint8Array {
  let fd: number | null = null;
  try {
    fd = openSync(path, 'r');
    const buffer = Buffer.allocUnsafe(HEADER_PROBE_BYTES);
    const read = readSync(fd, buffer, 0, HEADER_PROBE_BYTES, 0);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, read);
  } catch {
    return new Uint8Array(0);
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // Nothing useful to do about a failed close, and the caller has its answer.
      }
    }
  }
}

/** Persist page dimensions beside the extracted pages. Best-effort. */
function writeDimensions(dir: string, pages: PageDimensions[]): void {
  try {
    writeFileSync(join(dir, DIMENSIONS_FILE), JSON.stringify(pages));
  } catch (error) {
    log.warn('Could not write comic page dimensions', { dir, error: String(error) });
  }
}

/**
 * Read the dimensions sidecar back, or null when it is absent, unreadable or
 * no longer describes this directory.
 *
 * The length check is what makes it safe to have added this to an API that
 * already shipped: cache directories extracted before the sidecar existed
 * have no file, and a directory whose sidecar disagrees with the pages
 * actually on disk is treated as having none rather than being trusted into
 * handing the reader dimensions belonging to a different page.
 */
function readDimensions(dir: string, expected: number): PageDimensions[] | null {
  const path = join(dir, DIMENSIONS_FILE);
  if (!existsSync(path)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(parsed) || parsed.length !== expected) return null;
    return parsed.map((entry, index) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      return {
        n: index + 1,
        w: typeof row['w'] === 'number' ? row['w'] : null,
        h: typeof row['h'] === 'number' ? row['h'] : null,
      };
    });
  } catch (error) {
    log.warn('Could not read comic page dimensions', { dir, error: String(error) });
    return null;
  }
}

/**
 * Size every page in an already-extracted cache directory, and write the
 * result out so it never has to happen again.
 *
 * Only reached for directories extracted before dimensions were recorded, or
 * for one whose sidecar went missing. Reads headers only — see
 * {@link HEADER_PROBE_BYTES}.
 */
function backfillDimensions(dir: string, files: string[]): PageDimensions[] {
  const pages = files.map((file, index) => {
    const size = readImageDimensions(readFileHeader(join(dir, file)));
    return { n: index + 1, w: size?.width ?? null, h: size?.height ?? null };
  });
  writeDimensions(dir, pages);
  log.info('Backfilled comic page dimensions', { dir, pages: pages.length });
  return pages;
}

/**
 * Delete cache directories older than {@link MAX_CACHE_AGE_MS}, other than
 * the one just created for this request. Best-effort: a directory this
 * process cannot remove (permissions, a concurrent reader) is logged and left
 * for next time rather than failing the request that triggered it.
 */
function evictStaleCacheDirs(root: string, keep: string): void {
  if (!existsSync(root)) return;

  const now = Date.now();
  for (const name of readdirSync(root)) {
    if (name === keep) continue;
    const dirPath = join(root, name);
    try {
      const stat = statSync(dirPath);
      if (!stat.isDirectory()) continue;
      if (now - stat.mtimeMs <= MAX_CACHE_AGE_MS) continue;
      rmSync(dirPath, { recursive: true, force: true });
      log.info('Evicted stale comic page cache', { dir: name });
    } catch (error) {
      log.warn('Could not evaluate comic page cache dir for eviction', { dir: name, error: String(error) });
    }
  }
}

/**
 * Extract (or reuse a cached extraction of) every page image for an issue.
 *
 * On a cache hit this is just a directory read. On a miss it does the same
 * synchronous, blocking extraction `openComicArchive` does — that part is
 * unavoidable without worker threads (see the module doc comment) — but only
 * once per distinct file, ever.
 */
export async function ensureIssuePagesExtracted(
  id: number,
  filepath: string,
  options: EnsurePagesOptions = {}
): Promise<IssuePages> {
  const namespace = options.namespace ?? 'comic';

  // Verify the file exists (throws ENOENT otherwise, which callers map to 404).
  const stat = statSync(filepath);

  const ext = extname(filepath).toLowerCase().replace('.', '');
  if (ext === 'pdf') throw new PdfNotPaginatedError();

  const root = cacheRoot(namespace);
  const key = cacheKey(namespace, id, filepath, stat.size, stat.mtimeMs);
  const dir = join(root, key);

  if (existsSync(dir)) {
    const files = readCachedPageFiles(dir);
    const pages = readDimensions(dir, files.length) ?? backfillDimensions(dir, files);
    return { dir, files, pages };
  }

  const images = await extractComicImages(filepath, ext);

  mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  const pages: PageDimensions[] = [];
  images.forEach((image, index) => {
    const pageExt = IMAGE_RE.test(image.name) ? extname(image.name).toLowerCase() : '.jpg';
    const filename = `${String(index + 1).padStart(5, '0')}${pageExt}`;
    writeFileSync(join(dir, filename), image.data);
    files.push(filename);
    // Sized here rather than on a later request because the bytes are
    // already in hand: reading a header out of memory costs nothing next to
    // the extraction that just produced it.
    const size = readImageDimensions(image.data);
    pages.push({ n: index + 1, w: size?.width ?? null, h: size?.height ?? null });
  });
  writeDimensions(dir, pages);

  evictStaleCacheDirs(root, key);

  return { dir, files, pages };
}

/** The absolute path to a cached page's file, extracting first if needed. */
export async function getIssuePagePath(
  id: number,
  filepath: string,
  pageNumber: number,
  options: EnsurePagesOptions = {}
): Promise<string | null> {
  const { dir, files } = await ensureIssuePagesExtracted(id, filepath, options);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > files.length) return null;
  const filename = files[pageNumber - 1];
  if (!filename) return null;
  return join(dir, filename);
}
