/**
 * Task Handlers
 * Register handlers for different task types
 */

import { registerTaskHandler, enqueueTask, type TaskHandler } from './index';
import { scanLibrary, updateBook, addBook } from '../scanner';
import { getLibraryById } from '../library';
import { query, queryOne, execute, markWantedBookAsAcquired } from '@shelvarr/db';
import * as metadataService from '../metadata';
import { downloadFile as downloadFromLibgen } from '../downloads/libgen';
import { komgaClient } from '../komga';
import { getOrCreateAuthor, fetchAuthorMetadata, getAuthorByName } from '@/lib/actions/authors';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Move a file, falling back to copy+delete for cross-filesystem moves
 */
function moveFile(source: string, target: string): void {
  try {
    // Try rename first (fast, same filesystem)
    fs.renameSync(source, target);
  } catch (err) {
    // If rename fails (cross-filesystem), copy then delete
    if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
      fs.copyFileSync(source, target);
      fs.unlinkSync(source);
    } else {
      throw err;
    }
  }
}

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

  // Process books in batches of 20
  const BATCH_SIZE = 20;
  const batches: typeof books[] = [];

  for (let i = 0; i < books.length; i += BATCH_SIZE) {
    batches.push(books.slice(i, i + BATCH_SIZE));
  }

  let processedCount = 0;

  for (const batch of batches) {
    if (signal.aborted) {
      throw new Error('Task cancelled');
    }

    // Process all books in the batch in parallel
    const batchResults = await Promise.allSettled(
      batch.map(async (book) => {
        if (!book.title) {
          return { status: 'skipped' as const, bookId: book.id };
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

        if (!metadata) {
          return {
            status: 'failed' as const,
            bookId: book.id,
            error: `No metadata found for ${book.title}`
          };
        }

        // Convert authors from comma-separated string to JSON array
        let authorsJson: string | null = null;
        if (metadata.authors && metadata.authors !== 'Unknown') {
          const authorsList = metadata.authors.split(',').map(a => a.trim()).filter(Boolean);
          authorsJson = JSON.stringify(authorsList);
        }

        // Update book with metadata
        await updateBook(book.id, {
          title: metadata.title,
          authors: authorsJson || undefined,
          publisher: metadata.publisher,
          publishDate: metadata.publishDate,
          description: metadata.description,
          isbn: metadata.isbn,
          coverUrl: metadata.coverUrl,
        });

        // Handle series if present
        if (metadata.series && metadata.series.length > 0) {
          const primarySeries = metadata.series[0];
          if (primarySeries) {
            execute(
              'UPDATE books SET series = ?, series_name = ?, series_number = ? WHERE id = ?',
              [JSON.stringify(metadata.series), primarySeries[0], primarySeries[1], book.id]
            );
          }
        }

        // Update metadata source tracking
        execute(
          'UPDATE books SET metadata_source = ?, metadata_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [metadata.source, metadata.sourceId, book.id]
        );

        // Check if this book was on the wanted list and mark it as acquired
        const hardcoverId = metadata.source === 'hardcover' ? metadata.sourceId : undefined;
        const wantedBook = markWantedBookAsAcquired(
          hardcoverId,
          metadata.isbn,
          metadata.title
        );

        if (wantedBook) {
          console.log(`📚 Wanted book acquired: "${wantedBook.title}" (ID: ${wantedBook.id})`);
        }

        // Process authors - create author records if they don't exist
        if (metadata.authors && metadata.authors !== 'Unknown') {
          for (const name of metadata.authors.split(',').map(a => a.trim()).filter(Boolean)) {
            try {
              const existing = await getAuthorByName(name);
              if (!existing?.lastSynced) {
                const author = await getOrCreateAuthor(name);
                // Fetch author metadata in background (don't wait)
                fetchAuthorMetadata(author.id).catch(() => {});
              }
            } catch (error) {
              // Don't fail the whole task if author creation fails
              console.warn(`Failed to process author ${name}:`, error);
            }
          }
        }

        return { status: 'matched' as const, bookId: book.id, title: metadata.title };
      })
    );

    // Process batch results
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        const value = result.value;
        if (value.status === 'matched') {
          matched++;
        } else if (value.status === 'failed') {
          failed++;
          errors.push(`Book ${value.bookId}: ${value.error}`);
        } else if (value.status === 'skipped') {
          skipped++;
        }
      } else {
        // Promise rejected
        failed++;
        const error = result.reason;
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Batch processing error: ${message}`);
      }
    }

    processedCount += batch.length;
    onProgress(processedCount, total);
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
    .replace(/<[^>]+>/g, '')       // Strip HTML tags
    .replace(/&[a-z]+;/gi, '')     // Strip HTML entities
    .replace(/[<>:"/\\|?*]/g, '')  // Remove invalid filesystem chars
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

  onProgress(0, 6); // 6 steps: get library, download, save, add to db, fetch metadata, organize

  // Step 1: Get the library and wanted book info (for better metadata)
  const library = await getLibraryById(data.libraryId);

  // If this is from a wanted book, get the clean title/author from there
  let wantedBook: { title: string; author: string | null; hardcover_id: string | null } | null = null;
  if (data.wantedBookId) {
    wantedBook = queryOne<{ title: string; author: string | null; hardcover_id: string | null }>(
      'SELECT title, author, hardcover_id FROM wanted_books WHERE id = ?',
      [data.wantedBookId]
    );
  }

  // Use wanted book data if available (cleaner than LibGen data)
  const bookTitle = wantedBook?.title || data.title;
  const bookAuthor = wantedBook?.author || data.author;
  if (!library) {
    throw new Error(`Library ${data.libraryId} not found`);
  }

  if (signal.aborted) throw new Error('Task cancelled');
  onProgress(1, 6);

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
  onProgress(2, 6);

  // Step 3: Generate filename and save (using clean data from wanted book if available)
  const ext = data.extension || path.extname(fileData.filename).replace('.', '') || 'epub';
  const authorPart = bookAuthor && bookAuthor !== 'Unknown' ? `${sanitizeFilename(bookAuthor)} - ` : '';
  const titlePart = sanitizeFilename(bookTitle || 'Unknown');
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
  onProgress(3, 6);

  // Step 4: Add book to database (using clean data from wanted book if available)
  const bookId = await addBook({
    libraryId: data.libraryId,
    filePath: targetPath,
    title: bookTitle,
    authors: bookAuthor ? JSON.stringify([bookAuthor]) : null,
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

  if (signal.aborted) throw new Error('Task cancelled');
  onProgress(4, 6);

  // Step 5: Fetch metadata and update book
  let finalPath = targetPath;
  let finalTitle = bookTitle;
  let finalAuthor = bookAuthor;
  let metadataFound = false;

  try {
    // If we have a hardcover_id from the wanted book, fetch directly instead of searching
    let metadata = null;
    if (wantedBook?.hardcover_id) {
      metadata = await metadataService.getBookBySourceId('hardcover', wantedBook.hardcover_id);
    }
    // Fall back to search if no hardcover_id or direct fetch failed
    if (!metadata) {
      metadata = await metadataService.autoMatch(bookTitle, bookAuthor || undefined);
    }

    if (metadata) {
      metadataFound = true;
      finalTitle = metadata.title;

      // Parse authors from metadata
      if (metadata.authors) {
        try {
          const authorsArr = JSON.parse(metadata.authors);
          if (Array.isArray(authorsArr) && authorsArr.length > 0) {
            finalAuthor = authorsArr[0];
          }
        } catch {
          finalAuthor = metadata.authors;
        }
      }

      // Update book with metadata
      await updateBook(bookId, {
        title: metadata.title,
        authors: metadata.authors,
        publisher: metadata.publisher,
        publishDate: metadata.publishDate,
        description: metadata.description,
        isbn: metadata.isbn,
        coverUrl: metadata.coverUrl,
        metadataSource: metadata.source,
        metadataId: metadata.sourceId,
      });

      // Handle series if present
      if (metadata.series && metadata.series.length > 0) {
        const primarySeries = metadata.series[0];
        if (primarySeries) {
          execute(
            'UPDATE books SET series = ?, series_name = ?, series_number = ? WHERE id = ?',
            [JSON.stringify(metadata.series), primarySeries[0], primarySeries[1], bookId]
          );
        }
      }
    }
  } catch (err) {
    console.warn('Metadata fetch failed, continuing without metadata:', err);
  }

  if (signal.aborted) throw new Error('Task cancelled');
  onProgress(5, 6);

  // Step 6: Rename/organize file based on metadata
  try {
    const cleanAuthor = sanitizeFilename(finalAuthor || 'Unknown');
    const cleanTitle = sanitizeFilename(finalTitle || 'Unknown');

    // Create author folder for organization
    const authorDir = path.join(library.path, cleanAuthor);
    if (!fs.existsSync(authorDir)) {
      fs.mkdirSync(authorDir, { recursive: true });
    }

    // Build filename: "Title - Series Book N" or just "Title" if no series
    // Get series info from the book record we just updated
    const bookRecord = queryOne<{ series_name: string | null; series_number: number | null }>(
      'SELECT series_name, series_number FROM books WHERE id = ?',
      [bookId]
    );

    let organizedFilename = cleanTitle;
    if (bookRecord?.series_name) {
      const cleanSeries = sanitizeFilename(bookRecord.series_name);
      if (bookRecord.series_number) {
        organizedFilename = `${cleanTitle} - ${cleanSeries} Book ${bookRecord.series_number}`;
      } else {
        organizedFilename = `${cleanTitle} - ${cleanSeries}`;
      }
    }

    let organizedPath = path.join(authorDir, `${organizedFilename}.${ext}`);

    // Handle duplicates
    if (fs.existsSync(organizedPath) && organizedPath !== targetPath) {
      let counter = 1;
      while (fs.existsSync(organizedPath)) {
        organizedPath = path.join(authorDir, `${organizedFilename} (${counter}).${ext}`);
        counter++;
      }
    }

    // Move file if path changed
    if (organizedPath !== targetPath) {
      fs.renameSync(targetPath, organizedPath);
      finalPath = organizedPath;

      // Update book record with new path
      execute(
        'UPDATE books SET file_path = ? WHERE id = ?',
        [organizedPath, bookId]
      );
    }
  } catch (err) {
    console.warn('File organization failed, keeping original location:', err);
  }

  onProgress(6, 6);

  // Queue Komga sync if configured
  if (komgaClient.isConfigured()) {
    enqueueTask('komga_sync', {
      bookId,
      libraryPath: library.path,
    });
  }

  return {
    success: true,
    bookId,
    filePath: finalPath,
    filename: path.basename(finalPath),
    fileSize: fileData.buffer.length,
    source: data.source,
    wantedBookId: data.wantedBookId,
    metadataFound,
    organized: finalPath !== targetPath,
  };
};

/**
 * Organize library task handler
 * Moves and renames books into Author/Title.ext structure
 */
const organizeHandler: TaskHandler = async (taskId, onProgress, signal) => {
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
  };

  // Get library info
  let library = null;
  if (data.libraryId) {
    library = await getLibraryById(data.libraryId);
    if (!library) {
      throw new Error(`Library ${data.libraryId} not found`);
    }
  }

  // Get books to organize
  let books: Array<{
    id: number;
    library_id: number;
    file_path: string;
    title: string | null;
    authors: string | null;
    extension: string | null;
    series_name: string | null;
    series_number: number | null;
  }>;

  if (data.bookIds && data.bookIds.length > 0) {
    const placeholders = data.bookIds.map(() => '?').join(',');
    books = query(
      `SELECT id, library_id, file_path, title, authors, extension, series_name, series_number FROM books WHERE id IN (${placeholders})`,
      data.bookIds
    );
  } else if (data.libraryId) {
    books = query(
      'SELECT id, library_id, file_path, title, authors, extension, series_name, series_number FROM books WHERE library_id = ?',
      [data.libraryId]
    );
  } else {
    books = query('SELECT id, library_id, file_path, title, authors, extension, series_name, series_number FROM books', []);
  }

  const total = books.length;
  let organized = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  // Cache library paths
  const libraryPaths = new Map<number, string>();

  for (let i = 0; i < books.length; i++) {
    if (signal.aborted) {
      throw new Error('Task cancelled');
    }

    const book = books[i]!;
    onProgress(i + 1, total);

    try {
      // Get library path
      let libPath = libraryPaths.get(book.library_id);
      if (!libPath) {
        const lib = await getLibraryById(book.library_id);
        if (!lib) {
          skipped++;
          continue;
        }
        libPath = lib.path;
        libraryPaths.set(book.library_id, libPath);
      }

      // Skip if no title
      if (!book.title) {
        skipped++;
        continue;
      }

      // Parse author
      let authorName = 'Unknown';
      if (book.authors) {
        try {
          const arr = JSON.parse(book.authors);
          if (Array.isArray(arr) && arr.length > 0 && arr[0]) {
            authorName = arr[0];
          }
        } catch {
          authorName = book.authors;
        }
      }

      // Determine extension
      const ext = book.extension || path.extname(book.file_path).replace('.', '') || 'epub';

      // Build target path: Library/Author/Title - Series Book Position.ext
      const cleanAuthor = sanitizeFilename(authorName);
      const cleanTitle = sanitizeFilename(book.title);

      // Build filename: "Title - Series Book N" or just "Title" if no series
      let filename = cleanTitle;
      if (book.series_name) {
        const cleanSeries = sanitizeFilename(book.series_name);
        if (book.series_number) {
          filename = `${cleanTitle} - ${cleanSeries} Book ${book.series_number}`;
        } else {
          filename = `${cleanTitle} - ${cleanSeries}`;
        }
      }

      const authorDir = path.join(libPath, cleanAuthor);
      let targetPath = path.join(authorDir, `${filename}.${ext}`);

      // If already in the correct location, still sync to Komga but skip file move
      if (book.file_path === targetPath) {
        // Queue Komga sync for books with metadata even if no file move needed
        if (komgaClient.isConfigured() && book.title) {
          enqueueTask('komga_sync', {
            bookId: book.id,
            libraryPath: libPath,
          });
        }
        skipped++;
        continue;
      }

      // Check if source file exists
      if (!fs.existsSync(book.file_path)) {
        skipped++;
        errors.push(`Book ${book.id}: Source file not found`);
        continue;
      }

      // Create author directory
      if (!fs.existsSync(authorDir)) {
        fs.mkdirSync(authorDir, { recursive: true });
      }

      // Handle duplicates
      if (fs.existsSync(targetPath)) {
        let counter = 1;
        while (fs.existsSync(targetPath)) {
          targetPath = path.join(authorDir, `${filename} (${counter}).${ext}`);
          counter++;
        }
      }

      // Move file (handles cross-filesystem moves)
      moveFile(book.file_path, targetPath);

      // Update database
      execute('UPDATE books SET file_path = ? WHERE id = ?', [targetPath, book.id]);

      // Queue Komga sync if Komga is configured
      if (komgaClient.isConfigured()) {
        enqueueTask('komga_sync', {
          bookId: book.id,
          libraryPath: libPath,
        });
      }

      // Clean up old directory - remove metadata files and empty dirs
      try {
        const oldDir = path.dirname(book.file_path);
        if (oldDir !== libPath && fs.existsSync(oldDir)) {
          // Remove Calibre/metadata files that are left behind
          const metadataPatterns = ['.opf', 'cover.jpg', 'cover.png', 'metadata.opf'];
          const remaining = fs.readdirSync(oldDir);

          for (const file of remaining) {
            const lowerFile = file.toLowerCase();
            const isMetadata = metadataPatterns.some(p => lowerFile.endsWith(p) || lowerFile === p);
            if (isMetadata) {
              try {
                fs.unlinkSync(path.join(oldDir, file));
              } catch {
                // Ignore individual file deletion errors
              }
            }
          }

          // Check again if directory is now empty
          const stillRemaining = fs.readdirSync(oldDir);
          if (stillRemaining.length === 0) {
            fs.rmdirSync(oldDir);

            // Also try to remove parent if it's now empty (e.g., author folder)
            const parentDir = path.dirname(oldDir);
            if (parentDir !== libPath && fs.existsSync(parentDir)) {
              const parentRemaining = fs.readdirSync(parentDir);
              if (parentRemaining.length === 0) {
                fs.rmdirSync(parentDir);
              }
            }
          }
        }
      } catch {
        // Ignore cleanup errors
      }

      organized++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`Book ${book.id}: ${message}`);
    }
  }

  return {
    total,
    organized,
    skipped,
    failed,
    errors: errors.slice(0, 20),
  };
};

/**
 * Single book metadata handler - fetches metadata for one book
 */
const bookMetadataHandler: TaskHandler = async (taskId, onProgress) => {
  const taskRow = queryOne<{ result: string | null }>(
    'SELECT result FROM tasks WHERE id = ?',
    [taskId]
  );

  if (!taskRow?.result) {
    throw new Error('Task missing configuration');
  }

  const data = JSON.parse(taskRow.result) as {
    bookId: number;
    bookTitle: string;
  };

  onProgress(0, 1);

  // Get book details
  const book = queryOne<{
    id: number;
    title: string | null;
    authors: string | null;
    isbn: string | null;
    metadata_source: string | null;
  }>(
    'SELECT id, title, authors, isbn, metadata_source FROM books WHERE id = ?',
    [data.bookId]
  );

  if (!book) {
    throw new Error(`Book ${data.bookId} not found`);
  }

  if (!book.title) {
    return { status: 'skipped', reason: 'No title' };
  }

  // Parse author
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

  if (!metadata) {
    onProgress(1, 1);
    return { status: 'not_found', bookId: book.id, title: book.title };
  }

  // Convert authors from comma-separated string to JSON array
  let authorsJson: string | null = null;
  if (metadata.authors && metadata.authors !== 'Unknown') {
    const authorsList = metadata.authors.split(',').map(a => a.trim()).filter(Boolean);
    authorsJson = JSON.stringify(authorsList);
  }

  // Update book with metadata
  await updateBook(book.id, {
    title: metadata.title,
    authors: authorsJson || undefined,
    publisher: metadata.publisher,
    publishDate: metadata.publishDate,
    description: metadata.description,
    isbn: metadata.isbn,
    coverUrl: metadata.coverUrl,
  });

  // Handle series if present
  if (metadata.series && metadata.series.length > 0) {
    const primarySeries = metadata.series[0];
    if (primarySeries) {
      execute(
        'UPDATE books SET series = ?, series_name = ?, series_number = ? WHERE id = ?',
        [JSON.stringify(metadata.series), primarySeries[0], primarySeries[1], book.id]
      );
    }
  }

  // Update metadata source tracking
  execute(
    'UPDATE books SET metadata_source = ?, metadata_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [metadata.source, metadata.sourceId, book.id]
  );

  // Process authors - create author records if they don't exist
  if (metadata.authors && metadata.authors !== 'Unknown') {
    for (const name of metadata.authors.split(',').map(a => a.trim()).filter(Boolean)) {
      try {
        const existing = await getAuthorByName(name);
        if (!existing?.lastSynced) {
          const author = await getOrCreateAuthor(name);
          // Fetch author metadata in background (don't wait)
          fetchAuthorMetadata(author.id).catch(() => {});
        }
      } catch (error) {
        // Don't fail the whole task if author creation fails
        console.warn(`Failed to process author ${name}:`, error);
      }
    }
  }

  onProgress(1, 1);
  return { status: 'matched', bookId: book.id, title: metadata.title, source: metadata.source };
};

/**
 * Komga sync task handler
 * Syncs a book's metadata and cover to Komga after organizing
 */
const komgaSyncHandler: TaskHandler = async (taskId, onProgress) => {
  const taskRow = queryOne<{ result: string | null }>(
    'SELECT result FROM tasks WHERE id = ?',
    [taskId]
  );

  if (!taskRow?.result) {
    throw new Error('Task missing configuration');
  }

  const data = JSON.parse(taskRow.result) as {
    bookId: number;
    libraryPath?: string;
  };

  onProgress(0, 3);

  // Check if Komga is configured
  if (!komgaClient.isConfigured()) {
    return { status: 'skipped', reason: 'Komga not configured' };
  }

  // Step 1: Get book details from database
  const book = queryOne<{
    id: number;
    file_path: string;
    title: string | null;
    authors: string | null;
    description: string | null;
    isbn: string | null;
    publish_date: string | null;
    cover_url: string | null;
    series_number: number | null;
  }>(
    'SELECT id, file_path, title, authors, description, isbn, publish_date, cover_url, series_number FROM books WHERE id = ?',
    [data.bookId]
  );

  if (!book) {
    throw new Error(`Book ${data.bookId} not found`);
  }

  if (!book.file_path) {
    return { status: 'skipped', reason: 'Book has no file path' };
  }

  onProgress(1, 3);

  // Step 2: Parse authors from JSON
  let authors: string[] = [];
  if (book.authors) {
    try {
      const parsed = JSON.parse(book.authors);
      if (Array.isArray(parsed)) {
        authors = parsed.filter(a => a && typeof a === 'string');
      }
    } catch {
      authors = [book.authors];
    }
  }

  // Step 3: Sync to Komga
  const filename = path.basename(book.file_path);
  const result = await komgaClient.syncBookToKomga(
    filename,
    {
      title: book.title || undefined,
      description: book.description || undefined,
      authors: authors.length > 0 ? authors : undefined,
      isbn: book.isbn || undefined,
      publishDate: book.publish_date || undefined,
      coverUrl: book.cover_url || undefined,
      seriesNumber: book.series_number || undefined,
    },
    data.libraryPath
  );

  onProgress(3, 3);

  if (result.success) {
    // Persist the Komga book ID back to the database
    if (result.komgaBookId) {
      execute(
        'UPDATE books SET komga_book_id = ? WHERE id = ?',
        [result.komgaBookId, book.id]
      );
    }

    return {
      status: 'synced',
      bookId: book.id,
      komgaBookId: result.komgaBookId,
      filename,
    };
  } else {
    // Don't throw - just report the error in result
    return {
      status: 'failed',
      bookId: book.id,
      error: result.error,
      filename,
    };
  }
};

/**
 * Register all task handlers
 */
export function registerAllHandlers(): void {
  registerTaskHandler('scan', scanHandler);
  registerTaskHandler('metadata', metadataHandler);
  registerTaskHandler('book_metadata', bookMetadataHandler);

  // Organize library handler
  registerTaskHandler('organize', organizeHandler);

  registerTaskHandler('download', downloadHandler);

  registerTaskHandler('author_sync', async (_taskId, onProgress) => {
    onProgress(1, 1);
    return { message: 'Author sync handler not yet implemented' };
  });

  // Komga sync handler - syncs book metadata and cover to Komga
  registerTaskHandler('komga_sync', komgaSyncHandler);
}

export default { registerAllHandlers };
