/**
 * Task Handlers
 * Register handlers for different task types
 */

import { registerTaskHandler, enqueueTask, RateLimitedError, type TaskHandler } from './index';
import { scanLibrary, updateBook, addBook } from '../scanner';
import { getLibraryById } from '../library';
import {
  query,
  queryOne,
  execute,
  markWantedBookAsAcquired,
  addComicDownloadHistory,
  addToComicBlocklist,
  claimStalledComicDownloads,
  deferComicDownload,
  getComicDownload,
  getComicVolumesNeedingRefresh,
  getComicVolumesWithMissingIssues,
  setComicDownloadState,
  startComicDownloadAttempt,
  switchComicDownloadLink,
  updateComicDownloadProgress,
} from '@shelvarr/db';
import type { ComicDownloadLink } from '@shelvarr/types';
import * as getcomics from '../comics/getcomics/index';
import * as comicLibrary from '../comics/library';
import { importComicDownload } from '../comics/import';
import { scanVolumeFiles } from '../comics/scan';
import { applyVolumeRename } from '../comics/rename';
import { findImportGroups, proposeLibraryImport } from '../comics/import-library';
import { adoptAllVolumes, adoptVolume, listAdoptionCandidates } from '../comics/adopt';
import { getServiceConfig } from '../config';
import * as metadataService from '../metadata';
import { downloadFile as downloadFromLibgen } from '../downloads/libgen';
import { komgaClient } from '../komga';
import { applyReorganization } from '../organizer';
import { getOrCreateAuthor, fetchAuthorMetadata, getAuthorByName } from '../authors';
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

  // If new books were added, automatically queue a metadata fetch task.
  // The metadata handler will chain into organize when auto-run is on.
  // If no new books were queued, still attempt to chain organize directly so
  // a clean re-scan still organizes pending files when auto-run is enabled.
  if (result.added > 0) {
    enqueueTask('metadata', {
      libraryId,
      unmatchedOnly: true,
    });
  } else {
    const autoRunRow = queryOne<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      ['organize_auto_run'],
    );
    let autoRun = true;
    if (autoRunRow?.value) {
      try {
        const parsed = JSON.parse(autoRunRow.value);
        if (typeof parsed === 'boolean') autoRun = parsed;
      } catch {
        autoRun = autoRunRow.value === 'true';
      }
    }
    if (autoRun) {
      enqueueTask('organize', { libraryId, libraryName: library.name });
    }
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

  // Chain into organize if auto-run is enabled and we have a libraryId
  if (data.libraryId) {
    const autoRunRow = queryOne<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      ['organize_auto_run'],
    );
    let autoRun = true;
    if (autoRunRow?.value) {
      try {
        const parsed = JSON.parse(autoRunRow.value);
        if (typeof parsed === 'boolean') autoRun = parsed;
      } catch {
        autoRun = autoRunRow.value === 'true';
      }
    }
    if (autoRun) {
      const library = await getLibraryById(data.libraryId);
      enqueueTask('organize', {
        libraryId: data.libraryId,
        libraryName: library?.name,
      });
    }
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
 * Organize library task handler.
 * Thin wrapper around applyReorganization from the organizer service.
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
    template?: string;
  };

  // Resolve libraryId — if only bookIds were provided, derive from the first book.
  let libraryId = data.libraryId;
  if (!libraryId && data.bookIds && data.bookIds.length > 0) {
    const firstId = data.bookIds[0]!;
    const row = queryOne<{ library_id: number }>(
      'SELECT library_id FROM books WHERE id = ?',
      [firstId],
    );
    if (!row) {
      throw new Error(`Book ${firstId} not found`);
    }
    libraryId = row.library_id;
  }

  if (!libraryId) {
    throw new Error('Library ID not specified');
  }

  // Resolve template — explicit task arg wins, otherwise stored setting, otherwise default.
  let template = data.template;
  if (!template) {
    const settingRow = queryOne<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      ['organize_template'],
    );
    if (settingRow?.value) {
      try {
        const parsed = JSON.parse(settingRow.value);
        if (typeof parsed === 'string' && parsed.length > 0) {
          template = parsed;
        }
      } catch {
        // Treat raw value as the template string (fallback for non-JSON entries).
        template = settingRow.value;
      }
    }
  }

  const reorgResult = await applyReorganization(libraryId, {
    bookIds: data.bookIds,
    template,
    onProgress,
    signal,
    enqueueKomgaSync: (bookId, libraryPath) => {
      if (komgaClient.isConfigured()) {
        enqueueTask('komga_sync', { bookId, libraryPath });
      }
    },
  });

  return {
    total: reorgResult.total,
    organized: reorgResult.moved,
    skipped: reorgResult.skipped,
    failed: reorgResult.details.filter(d => !d.success).length,
    skippedReasons: reorgResult.skippedReasons,
    removedMissing: reorgResult.removedMissing,
    requeuedAsWanted: reorgResult.requeuedAsWanted,
    errors: reorgResult.errors.slice(0, 200),
    errorCount: reorgResult.errorCount,
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
 * Search GetComics for a comic volume's missing issues and queue whatever it
 * finds. Each queued download becomes its own `comic_download` task.
 */
const comicSearchHandler: TaskHandler = async (taskId, onProgress, signal) => {
  const taskRow = queryOne<{ result: string | null }>(
    'SELECT result FROM tasks WHERE id = ?',
    [taskId]
  );
  if (!taskRow?.result) throw new Error('Task missing comic search configuration');

  const data = JSON.parse(taskRow.result) as { volumeId?: number; issueId?: number | null };
  if (!data.volumeId) throw new Error('Comic search task has no volumeId');

  onProgress(0, 2);

  const { downloads, failed } = await getcomics.autoSearchVolume(data.volumeId, {
    issueId: data.issueId ?? null,
    signal,
  });

  onProgress(1, 2);

  for (const download of downloads) {
    enqueueTask('comic_download', { comicDownloadId: download.id });
  }

  onProgress(2, 2);

  return {
    volumeId: data.volumeId,
    queued: downloads.length,
    downloadIds: downloads.map((download) => download.id),
    failed,
  };
};

/**
 * How many times a download is attempted before it is given up on.
 *
 * Only rate limits consume an attempt without a link changing: a dead link
 * moves on to the next alternate instead. Once the attempts are spent the
 * download fails properly, which is what lets the next auto-search sweep pick
 * a different release for the same issue.
 */
const MAX_DOWNLOAD_ATTEMPTS = 5;

/**
 * How long to wait out a host's download limit, by attempt number. A limit is
 * usually measured in minutes, so the first retries are spaced accordingly
 * rather than hammering the host back immediately.
 */
const RATE_LIMIT_BACKOFF_MS = [60_000, 120_000, 240_000, 480_000, 900_000];

function rateLimitBackoff(attempt: number): number {
  const index = Math.min(Math.max(attempt, 1), RATE_LIMIT_BACKOFF_MS.length) - 1;
  return RATE_LIMIT_BACKOFF_MS[index]!;
}

/**
 * Fetch one queued comic download and import it into the library.
 *
 * Progress is reported in bytes so the UI can show a real progress bar; the
 * `comic_downloads` row carries the same figures for anything reading the
 * queue directly.
 *
 * Two things can go wrong without the download being a write-off, and neither
 * is treated as one:
 *
 * - **The link dies between search and download.** The article's other links
 *   for the same issues were recorded when the download was queued, so the
 *   next one is tried; a broken link is blocklisted on the way past.
 * - **The host rate-limits us.** The download goes back in the queue with the
 *   partial file intact, and the task is retried after a backoff.
 */
const comicDownloadHandler: TaskHandler = async (taskId, onProgress, signal) => {
  const taskRow = queryOne<{ result: string | null }>(
    'SELECT result FROM tasks WHERE id = ?',
    [taskId]
  );
  if (!taskRow?.result) throw new Error('Task missing comic download configuration');

  const data = JSON.parse(taskRow.result) as { comicDownloadId?: number };
  if (!data.comicDownloadId) throw new Error('Comic download task has no comicDownloadId');

  const download = getComicDownload(data.comicDownloadId);
  if (!download) throw new Error(`Comic download ${data.comicDownloadId} not found`);

  const loaded = getcomics.loadVolume(download.volumeId);
  if (!loaded) throw new Error(`Comic volume ${download.volumeId} not found`);

  const volumeRow = queryOne<{ folder: string | null; publisher: string | null }>(
    'SELECT folder, publisher FROM comics WHERE id = ?',
    [download.volumeId]
  );

  const fail = (message: string): never => {
    setComicDownloadState(download.id, 'failed', { error: message });
    addComicDownloadHistory({
      volumeId: download.volumeId,
      issueId: download.issueId,
      webLink: download.webLink,
      webTitle: download.webTitle,
      webSubTitle: download.webSubTitle,
      host: download.host,
      success: false,
    });
    throw new Error(message);
  };

  /** Whether the queue UI cancelled this download out from under us. */
  const cancelled = (): boolean =>
    signal.aborted || getComicDownload(download.id)?.state === 'cancelled';

  /**
   * Remove this download's partial file, if any. Called before falling back to
   * another link: two links can resolve to the same filename, and resuming one
   * host's bytes from another's would append rather than overwrite.
   */
  const clearScratch = (): void => {
    const scratchDir = getServiceConfig().getcomics.downloadDir;
    if (!fs.existsSync(scratchDir)) return;
    for (const entry of fs.readdirSync(scratchDir)) {
      if (!entry.startsWith(`${download.id}-`)) continue;
      try {
        fs.unlinkSync(path.join(scratchDir, entry));
      } catch {
        // Best effort: a leftover partial is untidy, not fatal.
      }
    }
  };

  /** Resolve one link and stream it to the scratch directory. */
  const fetchLink = async (
    candidate: ComicDownloadLink
  ): Promise<{ path: string; bytes: number }> => {
    const resolved = await getcomics.resolveDownload(candidate.host, candidate.link, signal);

    const scratchDir = getServiceConfig().getcomics.downloadDir;
    const scratchPath = path.join(
      scratchDir,
      `${download.id}-${sanitizeFilename(resolved.filename)}`
    );

    // Throttle DB writes: the stream fires per chunk, which for a 50 MB file
    // is thousands of events. The same checkpoint is where we notice the
    // download being cancelled from the queue UI, which marks the row rather
    // than reaching into this task.
    const cancelController = new AbortController();
    const downloadSignal = AbortSignal.any([signal, cancelController.signal]);
    let lastPersist = 0;
    let cancelledByUser = false;

    const result = await getcomics.downloadToFile(resolved, scratchPath, {
      signal: downloadSignal,
      onProgress: (bytes, total) => {
        onProgress(bytes, total ?? 0);
        if (bytes - lastPersist < 1_000_000) return;

        lastPersist = bytes;
        updateComicDownloadProgress(download.id, bytes, total);

        if (getComicDownload(download.id)?.state === 'cancelled') {
          cancelledByUser = true;
          cancelController.abort();
        }
      },
    });

    if (cancelledByUser) throw new Error('Download cancelled');

    updateComicDownloadProgress(download.id, result.bytes, resolved.size);
    return result;
  };

  const attempt = startComicDownloadAttempt(download.id);

  let candidate: ComicDownloadLink = { host: download.host, link: download.downloadLink };
  const alternates = [...download.alternateLinks];
  let fetched: { path: string; bytes: number } | null = null;

  while (!fetched) {
    try {
      fetched = await fetchLink(candidate);
    } catch (error) {
      if (cancelled()) {
        setComicDownloadState(download.id, 'cancelled');
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);

      // The host is only refusing us for now: keep the partial file, put the
      // download back in the queue, and let the task be retried later.
      if (error instanceof getcomics.DownloadLimitReachedError) {
        if (attempt >= MAX_DOWNLOAD_ATTEMPTS) {
          return fail(`${message} — gave up after ${attempt} attempts`);
        }
        const retryAfterMs = rateLimitBackoff(attempt);
        deferComicDownload(
          download.id,
          `${message} — retrying in ${Math.round(retryAfterMs / 60_000)} min ` +
            `(attempt ${attempt} of ${MAX_DOWNLOAD_ATTEMPTS})`
        );
        throw new RateLimitedError(message, retryAfterMs);
      }

      if (error instanceof getcomics.LinkBrokenError) {
        addToComicBlocklist({
          downloadLink: candidate.link,
          reason: 'link-broken',
          volumeId: download.volumeId,
          issueId: download.issueId,
          webLink: download.webLink,
          webTitle: download.webTitle,
          webSubTitle: download.webSubTitle,
          host: candidate.host,
        });
      }

      const next = alternates.shift();
      if (!next) return fail(message);

      console.warn(
        `[comic-download] ${candidate.link} failed (${message}); trying ${next.link}`
      );
      clearScratch();
      switchComicDownloadLink(download.id, next, alternates);
      candidate = next;
    }
  }

  try {
    setComicDownloadState(download.id, 'importing');

    const imported = await importComicDownload(download, fetched.path, {
      title: loaded.volume.title,
      year: loaded.volume.year,
      volumeNumber: loaded.volume.volumeNumber,
      specialVersion: loaded.volume.specialVersion,
      publisher: volumeRow?.publisher ?? null,
      folder: volumeRow?.folder ?? null,
    });

    setComicDownloadState(download.id, 'completed', { filePath: imported.path });
    addComicDownloadHistory({
      volumeId: download.volumeId,
      issueId: download.issueId,
      webLink: download.webLink,
      webTitle: download.webTitle,
      webSubTitle: download.webSubTitle,
      fileTitle: imported.path.split('/').pop() ?? null,
      host: candidate.host,
      success: true,
    });

    return {
      comicDownloadId: download.id,
      volumeId: download.volumeId,
      path: imported.path,
      bytes: imported.bytes,
      renamed: imported.renamed,
      attempts: attempt,
    };
  } catch (error) {
    if (cancelled()) {
      setComicDownloadState(download.id, 'cancelled');
      throw error;
    }
    // The bytes are on disk; only the move into the library went wrong, so
    // another link would not help.
    return fail(error instanceof Error ? error.message : String(error));
  }
};

/** Read a task's stored configuration blob. */
function comicTaskData<T>(taskId: number, what: string): T {
  const taskRow = queryOne<{ result: string | null }>(
    'SELECT result FROM tasks WHERE id = ?',
    [taskId]
  );
  if (!taskRow?.result) throw new Error(`Task missing ${what}`);
  return JSON.parse(taskRow.result) as T;
}

/** Re-fetch one volume's metadata from ComicVine and rescan its folder. */
const comicRefreshHandler: TaskHandler = async (taskId, onProgress, signal) => {
  const data = comicTaskData<{ volumeId?: number }>(taskId, 'comic refresh configuration');
  if (!data.volumeId) throw new Error('Comic refresh task has no volumeId');

  onProgress(0, 1);
  const result = await comicLibrary.refreshVolume(data.volumeId, { signal });
  onProgress(1, 1);
  return { ...result };
};

/** Rescan one volume's folder without touching ComicVine. */
const comicScanHandler: TaskHandler = async (taskId, onProgress) => {
  const data = comicTaskData<{ volumeId?: number }>(taskId, 'comic scan configuration');
  if (!data.volumeId) throw new Error('Comic scan task has no volumeId');

  onProgress(0, 1);
  const result = await scanVolumeFiles(data.volumeId);
  onProgress(1, 1);
  return {
    volumeId: result.volumeId,
    matched: result.matched,
    unmatched: result.unmatched.length,
    removed: result.removed,
  };
};

/** Rename one volume's files to match the naming templates. */
const comicRenameHandler: TaskHandler = async (taskId, onProgress) => {
  const data = comicTaskData<{ volumeId?: number }>(taskId, 'comic rename configuration');
  if (!data.volumeId) throw new Error('Comic rename task has no volumeId');

  onProgress(0, 1);
  const result = await applyVolumeRename(data.volumeId);
  onProgress(1, 1);
  return { ...result };
};

/**
 * Refresh every volume whose ComicVine data has gone stale.
 *
 * Capped per run so a large library spreads its ComicVine budget over several
 * runs rather than exhausting the hourly limit in one go.
 */
const comicUpdateAllHandler: TaskHandler = async (taskId, onProgress, signal) => {
  const data = comicTaskData<{ maxAgeHours?: number; limit?: number }>(
    taskId,
    'comic update configuration'
  );
  const maxAgeHours = data.maxAgeHours ?? 24;
  const limit = data.limit ?? 25;

  const volumeIds = getComicVolumesNeedingRefresh(maxAgeHours, limit);
  onProgress(0, volumeIds.length);

  const refreshed: number[] = [];
  const failed: Array<{ volumeId: number; error: string }> = [];

  for (const [index, volumeId] of volumeIds.entries()) {
    if (signal.aborted) break;
    try {
      await comicLibrary.refreshVolume(volumeId, { signal });
      refreshed.push(volumeId);
    } catch (error) {
      failed.push({
        volumeId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    onProgress(index + 1, volumeIds.length);
  }

  return { considered: volumeIds.length, refreshed: refreshed.length, failed };
};

/**
 * Pick up downloads that were interrupted rather than finished.
 *
 * A download is driven by a task in one server process. If that process stops
 * — a restart, a crash, a container being replaced — the row is left sitting
 * in `queued`, `downloading` or `importing` with nobody working on it, and
 * nothing else notices: auto-search skips it, because a non-terminal download
 * counts as already in hand.
 *
 * Every live download stamps a heartbeat as it goes, so this sweep can tell
 * the orphans from the busy. Claiming is done in the same statement that finds
 * them, so several server processes can run this tick without doubling up.
 */
const comicResumeHandler: TaskHandler = async (taskId, onProgress) => {
  const data = comicTaskData<{ staleMinutes?: number; limit?: number }>(
    taskId,
    'comic resume configuration'
  );

  const stalled = claimStalledComicDownloads(data.staleMinutes ?? 30, data.limit ?? 25);
  onProgress(0, stalled.length);

  const resumed: number[] = [];
  for (const [index, download] of stalled.entries()) {
    enqueueTask('comic_download', { comicDownloadId: download.id });
    resumed.push(download.id);
    onProgress(index + 1, stalled.length);
  }

  if (resumed.length > 0) {
    console.warn(`[comic-resume] restarted ${resumed.length} interrupted download(s)`);
  }

  return { resumed: resumed.length, downloadIds: resumed };
};

/**
 * Auto-search every monitored volume that is still missing issues, queueing
 * whatever it finds. This is the scheduled sweep.
 */
const comicSearchAllHandler: TaskHandler = async (taskId, onProgress, signal) => {
  const data = comicTaskData<{ limit?: number }>(taskId, 'comic search configuration');
  const volumeIds = getComicVolumesWithMissingIssues(data.limit ?? 100);

  onProgress(0, volumeIds.length);

  let queued = 0;
  const failed: Array<{ volumeId: number; error: string }> = [];

  for (const [index, volumeId] of volumeIds.entries()) {
    if (signal.aborted) break;
    try {
      const { downloads } = await getcomics.autoSearchVolume(volumeId, { signal });
      for (const download of downloads) {
        enqueueTask('comic_download', { comicDownloadId: download.id });
        queued += 1;
      }
    } catch (error) {
      failed.push({
        volumeId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    onProgress(index + 1, volumeIds.length);
  }

  return { volumesSearched: volumeIds.length, queued, failed };
};

/**
 * Walk a folder tree and work out which ComicVine volume each folder is.
 *
 * Proposals are returned rather than applied — adopting the wrong series would
 * be tedious to undo, so a human confirms. One ComicVine search per folder
 * means this is slow by design.
 */
const comicLibraryImportHandler: TaskHandler = async (taskId, onProgress, signal) => {
  const data = comicTaskData<{ path?: string; maxGroups?: number }>(
    taskId,
    'library import configuration'
  );
  if (!data.path) throw new Error('Library import task has no path');

  const groups = await findImportGroups(data.path, {
    ...(data.maxGroups !== undefined ? { maxGroups: data.maxGroups } : {}),
  });
  onProgress(0, groups.length);

  const proposals = await proposeLibraryImport(groups, {
    signal,
    onProgress: (done, total) => onProgress(done, total),
  });

  // Candidates are kept — trimmed to what the review UI shows — so choosing a
  // different match costs no further ComicVine searches. Descriptions are
  // dropped: they are by far the largest field and the UI does not use them.
  return {
    path: data.path,
    proposals: proposals.map((proposal) => ({
      folder: proposal.folder,
      series: proposal.info.series,
      year: proposal.info.year,
      fileCount: proposal.files.length,
      suggestedComicvineId: proposal.suggested?.comicvineId ?? null,
      alreadyAdded: proposal.alreadyAdded,
      candidates: proposal.candidates.map((candidate) => ({
        comicvineId: candidate.comicvineId,
        title: candidate.title,
        year: candidate.year,
        volumeNumber: candidate.volumeNumber,
        publisher: candidate.publisher,
        issueCount: candidate.issueCount,
      })),
    })),
  };
};

/**
 * Take over volumes mirrored from a previous manager.
 *
 * Adoption reads only data Shelvarr already holds, so it needs no network —
 * but a large library still means one folder scan per volume, which is why it
 * runs here rather than inline in a request.
 */
const comicAdoptHandler: TaskHandler = async (taskId, onProgress, signal) => {
  const data = comicTaskData<{ volumeIds?: number[] }>(taskId, 'adoption configuration');

  // Either a specific selection, or everything that is ready.
  if (data.volumeIds && data.volumeIds.length > 0) {
    const adopted: string[] = [];
    const skipped: Array<{ volumeId: number; reason: string }> = [];

    onProgress(0, data.volumeIds.length);
    for (const [index, volumeId] of data.volumeIds.entries()) {
      if (signal.aborted) break;
      try {
        adopted.push((await adoptVolume(volumeId)).title);
      } catch (error) {
        skipped.push({
          volumeId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
      onProgress(index + 1, data.volumeIds.length);
    }

    return { adopted: adopted.length, titles: adopted, skipped };
  }

  const total = listAdoptionCandidates().length;
  onProgress(0, total);

  const result = await adoptAllVolumes({
    signal,
    onProgress: (done) => onProgress(done, total),
  });

  return {
    adopted: result.adopted.length,
    skipped: result.skipped,
    unmatchedFiles: result.adopted
      .filter((entry) => entry.unmatchedFiles > 0)
      .map((entry) => ({ title: entry.title, count: entry.unmatchedFiles })),
  };
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

  // Comic acquisition: search GetComics, then fetch and import what it found.
  registerTaskHandler('comic_search', comicSearchHandler);
  registerTaskHandler('comic_download', comicDownloadHandler);

  // Comic library: ComicVine metadata, disk scanning, renaming, adoption.
  registerTaskHandler('comic_refresh', comicRefreshHandler);
  registerTaskHandler('comic_scan', comicScanHandler);
  registerTaskHandler('comic_rename', comicRenameHandler);
  registerTaskHandler('comic_update_all', comicUpdateAllHandler);
  registerTaskHandler('comic_search_all', comicSearchAllHandler);
  registerTaskHandler('comic_resume', comicResumeHandler);
  registerTaskHandler('comic_library_import', comicLibraryImportHandler);
  registerTaskHandler('comic_adopt', comicAdoptHandler);

  registerTaskHandler('author_sync', async (_taskId, onProgress) => {
    onProgress(1, 1);
    return { message: 'Author sync handler not yet implemented' };
  });

  // Komga sync handler - syncs book metadata and cover to Komga
  registerTaskHandler('komga_sync', komgaSyncHandler);
}

export default { registerAllHandlers };
