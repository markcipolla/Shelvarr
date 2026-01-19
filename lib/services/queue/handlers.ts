/**
 * Task Handlers
 * Register handlers for different task types
 */

import { registerTaskHandler, enqueueTask, type TaskHandler } from './index';
import { scanLibrary, updateBook, addBook } from '../scanner/index.js';
import { getLibraryById } from '../library/index.js';
import { query, queryOne, execute } from '@/lib/db';
import * as metadataService from '../metadata/index.js';
import { downloadFile as downloadFromLibgen } from '../downloads/libgen';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Scan library task handler
 */
const scanHandler: TaskHandler = async (taskId, onProgress, signal) => {
  // Get task data to find libraryId
  const taskRow = queryOne<{ result: string | null }>(
    'SELECT result FROM tasks WHERE id = ?',
    [taskId]
  );

  if (!taskRow?.result) {
    throw new Error('Task missing library ID');
  }

  const data = JSON.parse(taskRow.result) as { libraryId?: number };
  const libraryId = data.libraryId;

  if (!libraryId) {
    throw new Error('Library ID not specified');
  }

  const library = await getLibraryById(libraryId);
  if (!library) {
    throw new Error(`Library ${libraryId} not found`);
  }

  // Run scan with progress reporting
  const result = await scanLibrary(libraryId, (progress) => {
    if (signal.aborted) {
      throw new Error('Task cancelled');
    }
    onProgress(progress.current, progress.total);
  });

  // If new books were added, automatically queue a metadata fetch task
  if (result.added > 0) {
    enqueueTask('metadata', {
      libraryId,
      unmatchedOnly: true,
    });
  }

  return {
    libraryId,
    libraryName: library.name,
    added: result.added,
    updated: result.updated,
    removed: result.removed,
    total: result.total,
    errors: result.errors,
    metadataTaskQueued: result.added > 0,
  };
};

/**
 * Metadata fetch task handler (batch)
 */
const metadataHandler: TaskHandler = async (taskId, onProgress, signal) => {
  const taskRow = queryOne<{ result: string | null }>(
    'SELECT result FROM tasks WHERE id = ?',
    [taskId]
  );

  if (!taskRow?.result) {
    throw new Error('Task missing configuration');
  }

  const data = JSON.parse(taskRow.result) as {
    libraryId?: number;
    bookIds?: number[];
    unmatchedOnly?: boolean;
  };

  // Get books to process
  let books: { id: number; title: string | null; authors: string | null; isbn: string | null }[];

  if (data.bookIds && data.bookIds.length > 0) {
    // Specific books
    const placeholders = data.bookIds.map(() => '?').join(',');
    books = query<{ id: number; title: string | null; authors: string | null; isbn: string | null }>(
      `SELECT id, title, authors, isbn FROM books WHERE id IN (${placeholders})`,
      data.bookIds
    );
  } else if (data.libraryId) {
    // All books in library, optionally unmatched only
    const whereClause = data.unmatchedOnly
      ? 'WHERE library_id = ? AND metadata_source IS NULL'
      : 'WHERE library_id = ?';
    books = query<{ id: number; title: string | null; authors: string | null; isbn: string | null }>(
      `SELECT id, title, authors, isbn FROM books ${whereClause}`,
      [data.libraryId]
    );
  } else {
    // All books across all libraries
    const whereClause = data.unmatchedOnly
      ? 'WHERE metadata_source IS NULL'
      : '';
    books = query<{ id: number; title: string | null; authors: string | null; isbn: string | null }>(
      `SELECT id, title, authors, isbn FROM books ${whereClause}`,
      []
    );
  }

  const total = books.length;
  let matched = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < books.length; i++) {
    if (signal.aborted) {
      throw new Error('Task cancelled');
    }

    const book = books[i];
    if (!book) continue;

    onProgress(i + 1, total);

    try {
      if (!book.title) {
        skipped++;
        continue;
      }

      // Parse authors from JSON if present
      let authorName: string | undefined;
      if (book.authors) {
        try {
          const authorsArr = JSON.parse(book.authors);
          if (Array.isArray(authorsArr) && authorsArr.length > 0) {
            authorName = authorsArr[0];
          }
        } catch {
          authorName = book.authors;
        }
      }

      // Call metadata service to auto-match
      const metadata = await metadataService.autoMatch(
        book.title,
        authorName,
        book.isbn || undefined
      );

      if (metadata) {
        // Update book with metadata
        await updateBook(book.id, {
          title: metadata.title,
          authors: metadata.authors,
          publisher: metadata.publisher,
          publishDate: metadata.publishDate,
          description: metadata.description,
          isbn: metadata.isbn,
          coverUrl: metadata.coverUrl,
        });

        // Update metadata source tracking
        execute(
          'UPDATE books SET metadata_source = ?, metadata_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [metadata.source, metadata.sourceId, book.id]
        );

        matched++;
      } else {
        failed++;
        errors.push(`Book ${book.id} (${book.title}): No metadata found`);
      }
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Book ${book.id}: ${message}`);
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return {
    total,
    matched,
    failed,
    skipped,
    errors: errors.slice(0, 10), // Limit errors in result
  };
};

/**
 * Sanitize filename for filesystem
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid chars
    .replace(/\s+/g, ' ')          // Normalize whitespace
    .trim()
    .substring(0, 200);            // Limit length
}

/**
 * Download task handler
 * Downloads a file from a source and saves it to a library
 */
const downloadHandler: TaskHandler = async (taskId, onProgress, signal) => {
  const taskRow = queryOne<{ result: string | null }>(
    'SELECT result FROM tasks WHERE id = ?',
    [taskId]
  );

  if (!taskRow?.result) {
    throw new Error('Task missing download configuration');
  }

  const data = JSON.parse(taskRow.result) as {
    source: 'libgen' | 'annas' | 'zlibrary';
    md5: string;
    title: string;
    author: string;
    extension: string;
    libraryId: number;
    wantedBookId?: number;
  };

  if (!data.source || !data.md5 || !data.libraryId) {
    throw new Error('Invalid download task configuration');
  }

  onProgress(0, 4); // 4 steps: fetch URL, download, save, add to db

  // Step 1: Get the library
  const library = await getLibraryById(data.libraryId);
  if (!library) {
    throw new Error(`Library ${data.libraryId} not found`);
  }

  if (signal.aborted) throw new Error('Task cancelled');
  onProgress(1, 4);

  // Step 2: Download the file
  let fileData: { buffer: Buffer; filename: string; contentType: string } | null = null;

  if (data.source === 'libgen') {
    fileData = await downloadFromLibgen(data.md5);
  } else {
    // TODO: Add support for other sources
    throw new Error(`Download from ${data.source} not yet supported`);
  }

  if (!fileData) {
    throw new Error('Failed to download file');
  }

  if (signal.aborted) throw new Error('Task cancelled');
  onProgress(2, 4);

  // Step 3: Generate filename and save
  const ext = data.extension || path.extname(fileData.filename).replace('.', '') || 'epub';
  const authorPart = data.author && data.author !== 'Unknown' ? `${sanitizeFilename(data.author)} - ` : '';
  const titlePart = sanitizeFilename(data.title || 'Unknown');
  const newFilename = `${authorPart}${titlePart}.${ext}`;

  const targetPath = path.join(library.path, newFilename);

  // Check if file already exists
  if (fs.existsSync(targetPath)) {
    // Add a number suffix
    let counter = 1;
    let altPath = targetPath;
    while (fs.existsSync(altPath)) {
      altPath = path.join(library.path, `${authorPart}${titlePart} (${counter}).${ext}`);
      counter++;
    }
  }

  // Ensure library directory exists
  if (!fs.existsSync(library.path)) {
    fs.mkdirSync(library.path, { recursive: true });
  }

  // Write file
  fs.writeFileSync(targetPath, fileData.buffer);

  if (signal.aborted) {
    // Clean up if cancelled
    try { fs.unlinkSync(targetPath); } catch { /* ignore */ }
    throw new Error('Task cancelled');
  }
  onProgress(3, 4);

  // Step 4: Add book to database
  const bookId = await addBook({
    libraryId: data.libraryId,
    filePath: targetPath,
    title: data.title,
    authors: data.author ? JSON.stringify([data.author]) : null,
    extension: ext,
    fileSize: fileData.buffer.length,
  });

  // Update wanted book status if this was from wanted list
  if (data.wantedBookId) {
    execute(
      "UPDATE wanted_books SET status = 'acquired' WHERE id = ?",
      [data.wantedBookId]
    );
  }

  onProgress(4, 4);

  return {
    success: true,
    bookId,
    filePath: targetPath,
    filename: newFilename,
    fileSize: fileData.buffer.length,
    source: data.source,
    wantedBookId: data.wantedBookId,
  };
};

/**
 * Register all task handlers
 */
export function registerAllHandlers(): void {
  registerTaskHandler('scan', scanHandler);
  registerTaskHandler('metadata', metadataHandler);

  // Placeholder handlers for future features
  registerTaskHandler('organize', async (_taskId, onProgress) => {
    onProgress(1, 1);
    return { message: 'Organize handler not yet implemented' };
  });

  registerTaskHandler('download', downloadHandler);

  registerTaskHandler('author_sync', async (_taskId, onProgress) => {
    onProgress(1, 1);
    return { message: 'Author sync handler not yet implemented' };
  });
}

export default { registerAllHandlers };
