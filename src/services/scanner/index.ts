import { readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { getDatabase } from '../../db/index.js';
import { getLibraryById } from '../library/index.js';
import config from '../../config/index.js';
import type { Book } from '../../types/index.js';

interface BookRow {
  id: number;
  library_id: number;
  file_path: string;
  file_hash: string | null;
  file_size: number | null;
  title: string | null;
  authors: string | null;
  series_name: string | null;
  series_number: number | null;
  isbn: string | null;
  publisher: string | null;
  publish_date: string | null;
  description: string | null;
  cover_url: string | null;
  metadata_source: string | null;
  metadata_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToBook(row: BookRow): Book {
  return {
    id: row.id,
    libraryId: row.library_id,
    filePath: row.file_path,
    fileHash: row.file_hash,
    fileSize: row.file_size,
    title: row.title,
    authors: row.authors,
    seriesName: row.series_name,
    seriesNumber: row.series_number,
    isbn: row.isbn,
    publisher: row.publisher,
    publishDate: row.publish_date,
    description: row.description,
    coverUrl: row.cover_url,
    metadataSource: row.metadata_source,
    metadataId: row.metadata_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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
  const library = getLibraryById(libraryId);

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

  const db = getDatabase();

  // Find all book files
  onProgress?.({ phase: 'scanning', current: 0, total: 0 });
  const files = findBookFiles(library.path, config.supportedExtensions);
  result.total = files.length;

  // Get existing books for this library
  const existingBooks = db
    .prepare('SELECT id, file_path FROM books WHERE library_id = ?')
    .all(libraryId) as Array<{ id: number; file_path: string }>;

  const existingPaths = new Set(existingBooks.map(b => b.file_path));
  const foundPaths = new Set(files);

  // Prepare statements
  const insertStmt = db.prepare(`
    INSERT INTO books (library_id, file_path, file_size, file_hash, title, authors)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const updateStmt = db.prepare(`
    UPDATE books SET file_size = ?, file_hash = ?, updated_at = CURRENT_TIMESTAMP
    WHERE file_path = ?
  `);

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

      if (existingPaths.has(filePath)) {
        // Update existing book
        updateStmt.run(fileSize, fileHash, filePath);
        result.updated++;
      } else {
        // Add new book
        const parsed = parseFilename(filePath);
        insertStmt.run(
          libraryId,
          filePath,
          fileSize,
          fileHash,
          parsed.title,
          JSON.stringify(parsed.authors)
        );
        result.added++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Error processing ${filePath}: ${message}`);
    }
  }

  // Remove books that no longer exist
  const removeStmt = db.prepare('DELETE FROM books WHERE id = ?');
  for (const book of existingBooks) {
    if (!foundPaths.has(book.file_path)) {
      removeStmt.run(book.id);
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
}

export interface BookListResult {
  books: Book[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function getBooks(query: BookQuery = {}): BookListResult {
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
  const offset = (page - 1) * pageSize;

  let whereClause = 'WHERE 1=1';
  const params: unknown[] = [];

  if (query.libraryId) {
    whereClause += ' AND library_id = ?';
    params.push(query.libraryId);
  }

  if (query.search) {
    whereClause += ' AND (title LIKE ? OR authors LIKE ? OR file_path LIKE ?)';
    const searchTerm = `%${query.search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  const db = getDatabase();

  // Get total count
  const countRow = db
    .prepare(`SELECT COUNT(*) as count FROM books ${whereClause}`)
    .get(...params) as { count: number };

  const total = countRow.count;
  const totalPages = Math.ceil(total / pageSize);

  // Get paginated results
  const rows = db
    .prepare(`
      SELECT * FROM books
      ${whereClause}
      ORDER BY COALESCE(title, file_path)
      LIMIT ? OFFSET ?
    `)
    .all(...params, pageSize, offset) as BookRow[];

  return {
    books: rows.map(rowToBook),
    total,
    page,
    pageSize,
    totalPages,
  };
}

export function getBookById(id: number): Book | null {
  const row = getDatabase()
    .prepare('SELECT * FROM books WHERE id = ?')
    .get(id) as BookRow | undefined;
  return row ? rowToBook(row) : null;
}

export function updateBook(
  id: number,
  updates: Partial<Pick<Book, 'title' | 'authors' | 'seriesName' | 'seriesNumber' | 'isbn' | 'publisher' | 'publishDate' | 'description' | 'coverUrl'>>
): { success: boolean; book?: Book; error?: string } {
  const existing = getBookById(id);
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

  if (fields.length === 0) {
    return { success: true, book: existing };
  }

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  try {
    getDatabase()
      .prepare(`UPDATE books SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values);

    const book = getBookById(id);
    return { success: true, book: book! };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export function deleteBook(id: number): { success: boolean; error?: string } {
  const existing = getBookById(id);
  if (!existing) {
    return { success: false, error: 'Book not found' };
  }

  try {
    getDatabase()
      .prepare('DELETE FROM books WHERE id = ?')
      .run(id);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}
