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
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { extname, join } from 'path';

import { extractComicImages, remapComicPath } from './archive';
import { getServiceConfig } from '../config';
import { createLogger } from '../utils/logger';

const log = createLogger('comics-pages');

/** Image extensions a cached page file can have. */
const IMAGE_RE = /\.(jpe?g|png|gif|webp)$/i;

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
  /** Same meaning as {@link OpenComicArchiveOptions.remap} in archive.ts. */
  remap?: boolean;
  /** Defaults to 'comic'. */
  namespace?: PageCacheNamespace;
}

export interface IssuePages {
  /** Absolute path to this item's cache directory. */
  dir: string;
  /** Cached page filenames, already in reading order — index 0 is page 1. */
  files: string[];
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
  const real = options.remap === false ? filepath : remapComicPath(filepath);

  // Verify the file exists (throws ENOENT otherwise, which callers map to 404).
  const stat = statSync(real);

  const ext = extname(real).toLowerCase().replace('.', '');
  if (ext === 'pdf') throw new PdfNotPaginatedError();

  const root = cacheRoot(namespace);
  const key = cacheKey(namespace, id, real, stat.size, stat.mtimeMs);
  const dir = join(root, key);

  if (existsSync(dir)) {
    return { dir, files: readCachedPageFiles(dir) };
  }

  const images = await extractComicImages(real, ext);

  mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  images.forEach((image, index) => {
    const pageExt = IMAGE_RE.test(image.name) ? extname(image.name).toLowerCase() : '.jpg';
    const filename = `${String(index + 1).padStart(5, '0')}${pageExt}`;
    writeFileSync(join(dir, filename), image.data);
    files.push(filename);
  });

  evictStaleCacheDirs(root, key);

  return { dir, files };
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
