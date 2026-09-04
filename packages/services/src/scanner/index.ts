import { existsSync, readdirSync, rmdirSync, statSync, unlinkSync } from 'fs';
import { join, extname, basename, dirname, resolve, sep } from 'path';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { query, queryOne, execute, hardcoverStatusLabel, progressUserId } from '@shelvarr/db';
import { getLibraryById } from '../library';
import { getServiceConfig } from '../config';
import { describeWriteFailure } from '../utils/fs-errors';
import { createLogger } from '../utils/logger';
import type { Book } from '@shelvarr/types';

const log = createLogger('scanner');

interface BookRow {
  id: number;
  library_id: number;
  file_path: string;
  file_hash: string | null;
  file_size: number | null;
  title: string | null;
  authors: string | null;
  series: string | null;  // JSON array of [seriesName, position] tuples
  series_name: string | null;  // Primary series name
  series_number: number | null;  // Primary series position
  isbn: string | null;
  publisher: string | null;
  publish_date: string | null;
  description: string | null;
  cover_url: string | null;
  extension: string | null;
  metadata_source: string | null;
  metadata_id: string | null;
  created_at: string;
  updated_at: string;
  // Optional progress columns populated by joins
  rp_page?: number | null;
  rp_completed?: number | null;
  ep_progression?: number | null;
  // Optional Hardcover reading status id, populated by a join
  hc_status?: number | null;
}

function computeProgress(row: BookRow): Pick<Book, 'progressPercent' | 'progressCompleted'> {
  const hasProgressJoin =
    row.rp_page !== undefined || row.rp_completed !== undefined || row.ep_progression !== undefined;
  if (!hasProgressJoin) return {};

  const completed = row.rp_completed === 1;
  let percent: number | null = null;
  if (row.ep_progression != null && row.ep_progression > 0) {
    percent = Math.round(row.ep_progression * 100);
  } else if (completed) {
    percent = 100;
  } else if (row.rp_page != null && row.rp_page > 0) {
    // Page-based progress without a known total — mark as "started" without a useful percent
    percent = null;
  }
  return { progressPercent: percent, progressCompleted: completed };
}

function computeHardcoverStatus(row: BookRow): Pick<Book, 'hardcoverStatus'> {
  if (row.hc_status === undefined) return {};
  return { hardcoverStatus: hardcoverStatusLabel(row.hc_status) };
}

function rowToBook(row: BookRow): Book {
  return {
    id: row.id,
    libraryId: row.library_id,
    filePath: row.file_path,
    fileHash: row.file_hash,
    fileSize: row.file_size ? Number(row.file_size) : null,
    title: row.title,
    authors: row.authors,
    series: row.series,
    seriesName: row.series_name,
    seriesNumber: row.series_number,
    isbn: row.isbn,
    publisher: row.publisher,
    publishDate: row.publish_date,
    description: row.description,
    coverUrl: row.cover_url,
    extension: row.extension,
    metadataSource: row.metadata_source,
    metadataId: row.metadata_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...computeProgress(row),
    ...computeHardcoverStatus(row),
  };
}

// Joins each book to one person's reading position. Aliased as `b`, exposing
// `rp_*` and `ep_progression`. Takes two parameters — the user id, twice —
// which must be bound before anything else in the query.
const PROGRESS_JOIN = `
  LEFT JOIN read_progress rp ON rp.book_id = b.id AND rp.user_id = ?
  LEFT JOIN epub_progression ep ON ep.book_id = b.id AND ep.user_id = ?`;

// Joins each book to its cached Hardcover reading status (when the book is
// matched to a Hardcover record). Aliased as `b`, exposing `hc_status`.
// Server-wide: Hardcover is configured once, with one account's token.
const HARDCOVER_STATUS_JOIN = `
  LEFT JOIN hardcover_reading_status hs
    ON hs.hardcover_id = b.metadata_id AND b.metadata_source = 'hardcover'`;

export interface ScanResult {
  success: boolean;
  libraryId: number;
  added: number;
  updated: number;
  removed: number;
  total: number;
  errors: string[];
}

export interface ScanProgress {
  phase: 'scanning' | 'processing' | 'complete';
  current: number;
  total: number;
  currentFile?: string;
}

type ProgressCallback = (progress: ScanProgress) => void;

function parseFilename(filePath: string): { title: string; authors: string[] } {
  const filename = basename(filePath, extname(filePath));

  // Common patterns:
  // "Author - Title"
  // "Title - Author"
  // "Author - Series #1 - Title"
  // Just "Title"

  const dashParts = filename.split(' - ').map(s => s.trim()).filter(Boolean);

  if (dashParts.length >= 2) {
    // Assume first part is author if it looks like a name (short, no numbers)
    const first = dashParts[0] ?? '';
    const last = dashParts[dashParts.length - 1] ?? '';
    const isLikelyAuthor = first.length < 50 && !/\d/.test(first);

    if (isLikelyAuthor && first) {
      return {
        authors: [first],
        title: dashParts.slice(1).join(' - '),
      };
    }

    // Otherwise treat last part as author
    if (last) {
      return {
        title: dashParts.slice(0, -1).join(' - '),
        authors: [last],
      };
    }
  }

  // Just use filename as title
  return {
    title: filename,
    authors: [],
  };
}

function computeFileHash(filePath: string, sampleSize = 64 * 1024): string {
  // Read first 64KB for quick hash (full hash would be slow for large files)
  const buffer = Buffer.alloc(sampleSize);
  const fd = readFileSync(filePath);
  const bytesToRead = Math.min(sampleSize, fd.length);
  fd.copy(buffer, 0, 0, bytesToRead);

  return createHash('md5').update(buffer.subarray(0, bytesToRead)).digest('hex');
}

function findBookFiles(dir: string, extensions: string[]): string[] {
  const files: string[] = [];

  function walk(currentDir: string): void {
    try {
      const entries = readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);

        // Skip hidden files/directories
        if (entry.name.startsWith('.')) continue;

        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Skip directories we can't read
      console.warn(`Cannot read directory: ${currentDir}`);
    }
  }

  walk(dir);
  return files;
}

export async function scanLibrary(
  libraryId: number,
  onProgress?: ProgressCallback
): Promise<ScanResult> {
  const library = await getLibraryById(libraryId);

  if (!library) {
    return {
      success: false,
      libraryId,
      added: 0,
      updated: 0,
      removed: 0,
      total: 0,
      errors: ['Library not found'],
    };
  }

  const result: ScanResult = {
    success: true,
    libraryId,
    added: 0,
    updated: 0,
    removed: 0,
    total: 0,
    errors: [],
  };

  // Find all book files
  onProgress?.({ phase: 'scanning', current: 0, total: 0 });
  const files = findBookFiles(library.path, getServiceConfig().supportedExtensions);
  result.total = files.length;

  // Get existing books for this library
  const existingBooks = await query<{ id: number; file_path: string }>(
    'SELECT id, file_path FROM books WHERE library_id = ?',
    [libraryId]
  );

  const existingPaths = new Set(existingBooks.map(b => b.file_path));
  const foundPaths = new Set(files);

  // Process files
  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    if (!filePath) continue;

    onProgress?.({
      phase: 'processing',
      current: i + 1,
      total: files.length,
      currentFile: filePath,
    });

    try {
      const stats = statSync(filePath);
      const fileSize = stats.size;
      const fileHash = computeFileHash(filePath);
      const ext = extname(filePath).replace('.', '').toLowerCase() || null;

      if (existingPaths.has(filePath)) {
        // Update existing book (backfills extension for rows scanned before it was tracked)
        await execute(
          'UPDATE books SET file_size = ?, file_hash = ?, extension = COALESCE(extension, ?), updated_at = CURRENT_TIMESTAMP WHERE file_path = ?',
          [fileSize, fileHash, ext, filePath]
        );
        result.updated++;
      } else {
        // Add new book
        const parsed = parseFilename(filePath);
        await execute(
          'INSERT INTO books (library_id, file_path, file_size, file_hash, extension, title, authors) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [libraryId, filePath, fileSize, fileHash, ext, parsed.title, JSON.stringify(parsed.authors)]
        );
        result.added++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Error processing ${filePath}: ${message}`);
    }
  }

  // Remove books that no longer exist
  for (const book of existingBooks) {
    if (!foundPaths.has(book.file_path)) {
      await execute('DELETE FROM books WHERE id = ?', [book.id]);
      result.removed++;
    }
  }

  onProgress?.({ phase: 'complete', current: files.length, total: files.length });

  return result;
}

export interface BookQuery {
  libraryId?: number;
  search?: string;
  page?: number;
  pageSize?: number;
  unmatchedOnly?: boolean;
  matchedOnly?: boolean;
}

export interface BookListResult {
  books: Book[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getBooks(queryParams: BookQuery = {}): Promise<BookListResult> {
  const page = Math.max(1, queryParams.page || 1);
  // Allow up to 10000 for internal operations (e.g., metadata fetch), default 20 for UI
  const pageSize = Math.min(10000, Math.max(1, queryParams.pageSize || 20));
  const offset = (page - 1) * pageSize;

  let whereClause = 'WHERE 1=1';
  const params: unknown[] = [];

  if (queryParams.libraryId) {
    whereClause += ' AND library_id = ?';
    params.push(queryParams.libraryId);
  }

  if (queryParams.search) {
    whereClause += ' AND (title LIKE ? OR authors LIKE ? OR file_path LIKE ?)';
    const searchTerm = `%${queryParams.search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  if (queryParams.unmatchedOnly) {
    whereClause += ' AND metadata_source IS NULL';
  }

  if (queryParams.matchedOnly) {
    whereClause += ' AND metadata_source IS NOT NULL';
  }

  // Get total count
  const countRow = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM books ${whereClause}`,
    params
  );

  const total = countRow?.count || 0;
  const totalPages = Math.ceil(total / pageSize);

  // Get paginated results
  // Sort: books without metadata first, then alphabetically by title
  const rows = query<BookRow>(
    `SELECT b.*, hs.status_id AS hc_status
       FROM books b ${HARDCOVER_STATUS_JOIN}
     ${whereClause}
     ORDER BY
       CASE WHEN b.metadata_source IS NULL THEN 0 ELSE 1 END,
       COALESCE(b.title, b.file_path) COLLATE NOCASE
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return {
    books: rows.map(rowToBook),
    total,
    page,
    pageSize,
    totalPages,
  };
}

export async function getRecentBooks(userId: number, limit: number): Promise<Book[]> {
  const rows = query<BookRow>(
    `SELECT b.*,
       rp.page AS rp_page,
       rp.completed AS rp_completed,
       ep.progression AS ep_progression,
       hs.status_id AS hc_status
     FROM books b
     ${PROGRESS_JOIN}
     ${HARDCOVER_STATUS_JOIN}
     WHERE b.metadata_source IS NOT NULL
     ORDER BY b.created_at DESC
     LIMIT ?`,
    [progressUserId(userId), progressUserId(userId), Math.max(1, Math.min(100, limit))]
  );
  return rows.map(rowToBook);
}

// "Currently reading" spans this person's own reading progress and books
// marked "currently reading" on Hardcover (status 2) that nobody has started
// locally. The Hardcover half is server-wide; the progress half is not.
export async function getCurrentlyReadingBooks(userId: number, limit: number): Promise<Book[]> {
  const rows = query<BookRow>(
    `SELECT b.*,
       rp.page AS rp_page,
       rp.completed AS rp_completed,
       ep.progression AS ep_progression,
       hs.status_id AS hc_status
     FROM books b
     ${PROGRESS_JOIN}
     ${HARDCOVER_STATUS_JOIN}
     WHERE (rp.completed IS NULL OR rp.completed = 0)
       AND ((rp.page IS NOT NULL AND rp.page > 0)
            OR (ep.progression IS NOT NULL AND ep.progression > 0 AND ep.progression < 0.98)
            OR hs.status_id = 2)
     ORDER BY COALESCE(ep.updated_at, rp.updated_at, hs.synced_at) DESC
     LIMIT ?`,
    [progressUserId(userId), progressUserId(userId), Math.max(1, Math.min(100, limit))]
  );
  return rows.map(rowToBook);
}

// Books marked "want to read" on Hardcover that this person hasn't started
// locally — surfaced on the home "Next Up" row. Newest-tracked first.
export async function getWantToReadBooks(userId: number, limit: number): Promise<Book[]> {
  const rows = query<BookRow>(
    `SELECT b.*,
       rp.page AS rp_page,
       rp.completed AS rp_completed,
       hs.status_id AS hc_status
     FROM books b
     JOIN hardcover_reading_status hs
       ON hs.hardcover_id = b.metadata_id AND b.metadata_source = 'hardcover'
     LEFT JOIN read_progress rp ON b.id = rp.book_id AND rp.user_id = ?
     WHERE hs.status_id = 1
       AND (rp.completed IS NULL OR rp.completed = 0)
       AND (rp.page IS NULL OR rp.page = 0)
     ORDER BY hs.synced_at DESC, b.title COLLATE NOCASE
     LIMIT ?`,
    [progressUserId(userId), Math.max(1, Math.min(100, limit))]
  );
  return rows.map(rowToBook);
}

export async function getBookById(id: number): Promise<Book | null> {
  const row = await queryOne<BookRow>('SELECT * FROM books WHERE id = ?', [id]);
  return row ? rowToBook(row) : null;
}

export async function updateBook(
  id: number,
  updates: Partial<Pick<Book, 'title' | 'authors' | 'series' | 'seriesName' | 'seriesNumber' | 'isbn' | 'publisher' | 'publishDate' | 'description' | 'coverUrl' | 'metadataSource' | 'metadataId'>>
): Promise<{ success: boolean; book?: Book; error?: string }> {
  const existing = await getBookById(id);
  if (!existing) {
    return { success: false, error: 'Book not found' };
  }

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.authors !== undefined) {
    fields.push('authors = ?');
    values.push(updates.authors);
  }
  if (updates.series !== undefined) {
    fields.push('series = ?');
    values.push(updates.series);
  }
  if (updates.seriesName !== undefined) {
    fields.push('series_name = ?');
    values.push(updates.seriesName);
  }
  if (updates.seriesNumber !== undefined) {
    fields.push('series_number = ?');
    values.push(updates.seriesNumber);
  }
  if (updates.isbn !== undefined) {
    fields.push('isbn = ?');
    values.push(updates.isbn);
  }
  if (updates.publisher !== undefined) {
    fields.push('publisher = ?');
    values.push(updates.publisher);
  }
  if (updates.publishDate !== undefined) {
    fields.push('publish_date = ?');
    values.push(updates.publishDate);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.coverUrl !== undefined) {
    fields.push('cover_url = ?');
    values.push(updates.coverUrl);
  }
  if (updates.metadataSource !== undefined) {
    fields.push('metadata_source = ?');
    values.push(updates.metadataSource);
  }
  if (updates.metadataId !== undefined) {
    fields.push('metadata_id = ?');
    values.push(updates.metadataId);
  }

  if (fields.length === 0) {
    return { success: true, book: existing };
  }

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  try {
    execute(
      `UPDATE books SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    const book = await getBookById(id);
    return { success: true, book: book! };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export interface DeleteBookOptions {
  /** Also remove the book's file from disk. Off by default. */
  deleteFiles?: boolean;
}

export interface DeleteBookResult {
  success: boolean;
  error?: string;
  /** True when the file was actually removed from disk. */
  deletedFile?: boolean;
}

/**
 * Remove a book from the database, optionally taking its file with it.
 *
 * The file is only deleted when it lives inside its library — a path that has
 * wandered outside is a sign of a stale or hand-edited row, and deleting it
 * would reach into someone else's files.
 */
export async function deleteBook(
  id: number,
  options: DeleteBookOptions = {}
): Promise<DeleteBookResult> {
  const existing = await getBookById(id);
  if (!existing) {
    return { success: false, error: 'Book not found' };
  }

  let deletedFile = false;
  if (options.deleteFiles) {
    const removal = await deleteBookFile(existing);
    if (!removal.success) {
      return { success: false, error: removal.error };
    }
    deletedFile = removal.deleted;
  }

  try {
    await execute('DELETE FROM books WHERE id = ?', [id]);
    return { success: true, deletedFile };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/** Sidecar files a Calibre-style export leaves next to the book itself. */
const SIDECAR_PATTERNS = ['.opf', 'cover.jpg', 'cover.png', 'metadata.opf'];

/**
 * Delete a book's file, its metadata sidecars, and any directories the
 * removal leaves empty (stopping at the library root).
 */
async function deleteBookFile(
  book: Book
): Promise<{ success: boolean; deleted: boolean; error?: string }> {
  const library = await getLibraryById(book.libraryId);
  if (!library) {
    return { success: false, deleted: false, error: 'Library not found' };
  }

  const libraryRoot = resolve(library.path);
  const filePath = resolve(book.filePath);
  if (!filePath.startsWith(libraryRoot + sep)) {
    return {
      success: false,
      deleted: false,
      error: `Refusing to delete ${book.filePath} — it is outside the library`,
    };
  }

  let deleted = false;
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      deleted = true;
      log.info('Deleted book file', { bookId: book.id, filePath });
    }
  } catch (error) {
    // A wrongly-owned bind mount is the usual cause, and unlink answers to the
    // containing directory's permissions rather than the file's own.
    const failure = describeWriteFailure(dirname(filePath), error, 'delete from');
    return {
      success: false,
      deleted: false,
      error: `Failed to delete ${basename(filePath)}: ${failure.message}`,
    };
  }

  // Best effort from here: the book's row should still go even if the tidy-up
  // of its leftovers fails. The sidecars only get swept when nothing else in
  // the directory is a book — in a flat library they belong to a sibling.
  try {
    const bookDir = dirname(filePath);
    if (bookDir !== libraryRoot && existsSync(bookDir)) {
      const remaining = readdirSync(bookDir);
      const extensions = getServiceConfig().supportedExtensions;
      const holdsAnotherBook = remaining.some(file =>
        extensions.some(ext => file.toLowerCase().endsWith(ext))
      );

      if (!holdsAnotherBook) {
        for (const file of remaining) {
          const lower = file.toLowerCase();
          if (SIDECAR_PATTERNS.some(p => lower.endsWith(p) || lower === p)) {
            try {
              unlinkSync(join(bookDir, file));
            } catch {
              // ignore individual cleanup errors
            }
          }
        }
        removeEmptyDirs(bookDir, libraryRoot);
      }
    }
  } catch {
    // ignore cleanup errors
  }

  return { success: true, deleted };
}

/** Walk up from `dir` removing empty directories, never past `stopAt`. */
function removeEmptyDirs(dir: string, stopAt: string): void {
  let current = dir;
  while (current !== stopAt && current.startsWith(stopAt + sep)) {
    if (!existsSync(current) || readdirSync(current).length > 0) return;
    rmdirSync(current);
    current = dirname(current);
  }
}

/**
 * Add a new book to the database (for downloaded files)
 */
export async function addBook(data: {
  libraryId: number;
  filePath: string;
  title?: string;
  authors?: string | null;
  extension?: string;
  fileSize?: number;
}): Promise<number> {
  const result = await execute(
    `INSERT INTO books (library_id, file_path, title, authors, extension, file_size, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      data.libraryId,
      data.filePath,
      data.title || null,
      data.authors || null,
      data.extension || null,
      data.fileSize || null,
    ]
  );

  return result.lastInsertRowid as number;
}
