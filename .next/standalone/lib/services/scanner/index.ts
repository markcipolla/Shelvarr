import { readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { query, queryOne, execute } from '@/lib/db';
import { getLibraryById } from '@/lib/services/library';
import config from '@/lib/config';
import type { Book } from '@/types';

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
  const files = findBookFiles(library.path, config.supportedExtensions);
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

      if (existingPaths.has(filePath)) {
        // Update existing book
        await execute(
          'UPDATE books SET file_size = ?, file_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE file_path = ?',
          [fileSize, fileHash, filePath]
        );
        result.updated++;
      } else {
        // Add new book
        const parsed = parseFilename(filePath);
        await execute(
          'INSERT INTO books (library_id, file_path, file_size, file_hash, title, authors) VALUES (?, ?, ?, ?, ?, ?)',
          [libraryId, filePath, fileSize, fileHash, parsed.title, JSON.stringify(parsed.authors)]
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
  const pageSize = Math.min(100, Math.max(1, queryParams.pageSize || 20));
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
    `SELECT * FROM books ${whereClause}
     ORDER BY
       CASE WHEN metadata_source IS NULL THEN 0 ELSE 1 END,
       COALESCE(title, file_path) COLLATE NOCASE
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

export async function deleteBook(id: number): Promise<{ success: boolean; error?: string }> {
  const existing = await getBookById(id);
  if (!existing) {
    return { success: false, error: 'Book not found' };
  }

  try {
    await execute('DELETE FROM books WHERE id = ?', [id]);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}
