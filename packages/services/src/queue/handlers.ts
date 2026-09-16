/**
 * Task Handlers
 * Register handlers for different task types
 */

import { registerTaskHandler, enqueueTask, RateLimitedError, type TaskHandler } from './index';
import { scanLibrary, updateBook, addBook, getBookById } from '../scanner';
import { getAllLibraries, getLibraryById } from '../library';
import { pruneExpired } from '../auth/sessions';
import {
  query,
  queryOne,
  execute,
  markWantedBookAsAcquired,
  getWantedBooks,
  updateWantedBook,
  addComicDownloadHistory,
  addToComicBlocklist,
  claimStalledComicDownloads,
  getComicDownload,
  getComicVolumesNeedingRefresh,
  getComicVolumesWithMissingIssues,
  startComicDownloadAttempt,
  addBookDownload,
  getBookDownload,
  addBookDownloadHistory,
  claimStalledBookDownloads,
  addToBookBlocklist,
  bookBlocklistContains,
  switchBookDownloadLink,
} from '@shelvarr/db';
import {
  deferDownload,
  setDownloadProgress,
  setDownloadState,
  switchDownloadLink,
} from '../comics/download-events';
import {
  // Aliased to the names of the plain DB functions they replace, so every
  // existing call site below (state changes, throttled progress updates from
  // E2-2) picks up the live-event publish for free without being rewritten.
  setDownloadState as setBookDownloadState,
  setDownloadProgress as updateBookDownloadProgress,
} from '../downloads/download-events';
import type { ComicDownloadLink, Library } from '@shelvarr/types';
import * as getcomics from '../comics/getcomics/index';
import * as comicLibrary from '../comics/library';
import { ensureImportable, importComicDownload } from '../comics/import';
import { sweepComicScratch } from '../comics/scratch';
import { scanVolumeFiles } from '../comics/scan';
import { applyVolumeRename } from '../comics/rename';
import {
  findImportGroups,
  mergeScanResults,
  planLibraryImportScan,
  proposeLibraryImport,
  type StoredImportProposal,
} from '../comics/import-library';
import { getServiceConfig } from '../config';
import * as metadataService from '../metadata';
import {
  resolveLibgenDownloads,
  downloadToFile,
  LinkBrokenError,
  DownloadLimitReachedError,
} from '../downloads/libgen';
import { resolveAnnasDownload } from '../downloads/annas';
import { resolveZlibraryDownload } from '../downloads/zlibrary';
import type { ResolvedDownload } from '../utils/streaming-download';
import { searchAllSources } from '../downloads/index';
import { getSourceStatuses, refreshSourceStatuses } from '../downloads/source-status';
import { applyReorganization, moveFile, generateNewPath, resolveTargetCollision } from '../organizer';
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
 * Result of matching a freshly-added book against Hardcover.
 *
 * Shared between `downloadHandler` and `bookImportHandler` (E4-3): both add a
 * book row for a file that just landed on disk, then want the exact same
 * "prefer a direct hardcover-id lookup, else search by title/author, and
 * never let a lookup failure fail the whole job" behaviour.
 */
interface MetadataMatchResult {
  metadataFound: boolean;
  finalTitle: string;
  finalAuthor: string | null;
}

/**
 * Fetch metadata for `bookId` and apply it, exactly as `downloadHandler`'s
 * old inline Step 5 did. A failed or empty lookup is not an error — the book
 * stays in the library unmatched, the same way a scan's `metadataHandler`
 * leaves an unmatched book alone rather than failing the scan.
 */
async function matchBookMetadata(
  bookId: number,
  title: string,
  author: string | null,
  hardcoverId?: string | null
): Promise<MetadataMatchResult> {
  let finalTitle = title;
  let finalAuthor = author;
  let metadataFound = false;

  try {
    // If we have a hardcover_id from the wanted book, fetch directly instead of searching
    let metadata = null;
    if (hardcoverId) {
      metadata = await metadataService.getBookBySourceId('hardcover', hardcoverId);
    }
    // Fall back to search if no hardcover_id or direct fetch failed
    if (!metadata) {
      metadata = await metadataService.autoMatch(title, author || undefined);
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

  return { metadataFound, finalTitle, finalAuthor };
}

/** Result of filing a freshly-added book with the organizer. */
interface OrganizeNewBookResult {
  finalPath: string;
  organized: boolean;
}

/**
 * File a freshly-added book using the same naming template every other book
 * in the library is organized with (E2-6). Shared between `downloadHandler`
 * and `bookImportHandler` (E4-3) — both hand the organizer a book that has
 * never been filed anywhere yet, so this always runs; it does not check
 * `organize_auto_run`, which only gates bulk-reorganizing a library someone
 * may have filed by hand.
 *
 * A failure here is not fatal: the book stays where it landed rather than the
 * whole import/download being thrown away over a filing problem.
 */
async function organizeNewBook(
  bookId: number,
  library: Pick<Library, 'path'>,
  currentPath: string
): Promise<OrganizeNewBookResult> {
  let finalPath = currentPath;
  let organized = false;

  try {
    const freshBook = await getBookById(bookId);
    if (freshBook) {
      // generateNewPath only defaults to DEFAULT_ORGANIZE_TEMPLATE — it
      // doesn't read settings itself, that's on the caller (organizeHandler
      // does the same lookup, just merged with an explicit task-level
      // override that doesn't apply here since neither caller carries one).
      let organizeTemplate: string | undefined;
      const templateRow = queryOne<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        ['organize_template'],
      );
      if (templateRow?.value) {
        try {
          const parsed = JSON.parse(templateRow.value);
          if (typeof parsed === 'string' && parsed.length > 0) {
            organizeTemplate = parsed;
          }
        } catch {
          organizeTemplate = templateRow.value;
        }
      }

      const wantedPath = generateNewPath(freshBook, library.path, organizeTemplate);
      if (wantedPath !== currentPath) {
        const organizedPath = resolveTargetCollision(wantedPath, currentPath);
        const organizedDir = path.dirname(organizedPath);
        if (!fs.existsSync(organizedDir)) {
          fs.mkdirSync(organizedDir, { recursive: true });
        }

        moveFile(currentPath, organizedPath);
        finalPath = organizedPath;
        organized = true;

        execute(
          'UPDATE books SET file_path = ? WHERE id = ?',
          [organizedPath, bookId]
        );
      }
    }
  } catch (err) {
    console.warn('File organization failed, keeping original location:', err);
  }

  return { finalPath, organized };
}

/** Human-readable name for a download source, for error messages and blocklist entries. */
function sourceLabel(source: 'libgen' | 'annas' | 'zlibrary'): string {
  switch (source) {
    case 'libgen': return 'LibGen';
    case 'annas': return "Anna's Archive";
    case 'zlibrary': return 'Z-Library';
  }
}

/**
 * Resolve a source's download candidates, stream the first working one to
 * disk, and fall through the rest on a broken link or host rate limit —
 * blocklisting a dead link (and, once every candidate is exhausted, the
 * book itself) exactly as the original LibGen-only version of this code did.
 *
 * Every book source resolves to the same shape — a list of
 * `ResolvedDownload` candidates, best first — so only *how* that list gets
 * produced differs between them (LibGen's own mirrors, Anna's Archive's
 * member API or scraped candidates, Z-Library's single detail-page link),
 * which is exactly what `resolveCandidates` abstracts. Filename generation,
 * dedup-suffix handling, the scratch-then-move path, the progress-persist
 * throttle and the mirror-fallback loop itself are unchanged from the
 * libgen-only implementation this replaced.
 */
async function downloadBookWithFallback(params: {
  source: 'libgen' | 'annas' | 'zlibrary';
  resolveCandidates: () => Promise<ResolvedDownload[]>;
  bookDownloadId: number;
  bookTitle: string;
  bookAuthor: string | null;
  libraryPath: string;
  extension: string | undefined;
  wantedBookId?: number;
  libraryId: number;
  /** The source-scoped identifier (`${source}:${md5}`) blocklisted once every candidate fails. */
  downloadUrl: string;
  signal: AbortSignal;
}): Promise<{ filename: string; contentType: string; size: number; targetPath: string }> {
  const {
    source,
    resolveCandidates,
    bookDownloadId,
    bookTitle,
    bookAuthor,
    libraryPath,
    extension,
    wantedBookId,
    libraryId,
    downloadUrl,
    signal,
  } = params;

  const resolvedCandidates = (await resolveCandidates()).filter(
    (candidate) => !bookBlocklistContains(candidate.url)
  );
  if (resolvedCandidates.length === 0) {
    throw new Error('Failed to download file');
  }

  let candidate = resolvedCandidates[0]!;
  const alternates = resolvedCandidates.slice(1);
  if (alternates.length > 0) {
    switchBookDownloadLink(bookDownloadId, alternates);
  }

  const ext = extension || path.extname(candidate.filename).replace('.', '') || 'epub';
  const authorPart = bookAuthor && bookAuthor !== 'Unknown' ? `${sanitizeFilename(bookAuthor)} - ` : '';
  const titlePart = sanitizeFilename(bookTitle || 'Unknown');
  const newFilename = `${authorPart}${titlePart}.${ext}`;

  // Ensure library directory exists
  if (!fs.existsSync(libraryPath)) {
    fs.mkdirSync(libraryPath, { recursive: true });
  }

  // Check if file already exists — pick a numbered suffix instead of overwriting it
  let targetPath = path.join(libraryPath, newFilename);
  if (fs.existsSync(targetPath)) {
    let counter = 1;
    let altPath = targetPath;
    while (fs.existsSync(altPath)) {
      altPath = path.join(libraryPath, `${authorPart}${titlePart} (${counter}).${ext}`);
      counter++;
    }
    targetPath = altPath;
  }

  // Stream to a scratch file alongside the destination — never straight
  // to `targetPath` — so a failed or cancelled download can't leave a
  // half-written file sitting in the library.
  const partialPath = `${targetPath}.partial`;

  // Throttle book_downloads writes to roughly once per megabyte, matching
  // the byte-delta throttle comicDownloadHandler already uses for the
  // same reason: a stream fires onProgress per chunk, which for a multi-MB
  // file is thousands of events, and each one would otherwise be a SQLite
  // write.
  const PROGRESS_PERSIST_BYTES = 1_000_000;
  let lastPersisted = 0;

  // Try the chosen mirror, falling through to the next resolved candidate on
  // a broken link or a host rate-limit — both come back as bytes never
  // arrived, so there is nothing to resume, just a fresh mirror to try. Any
  // other error (disk full, task cancelled, a bug) fails the download
  // outright: another mirror would not help.
  for (;;) {
    try {
      await downloadToFile(candidate, partialPath, {
        signal,
        onProgress: (bytes, total) => {
          if (bytes - lastPersisted < PROGRESS_PERSIST_BYTES) return;
          lastPersisted = bytes;
          updateBookDownloadProgress(bookDownloadId, bytes, total);
        },
      });
      break;
    } catch (err) {
      try { fs.unlinkSync(partialPath); } catch { /* ignore */ }

      if (signal.aborted) throw new Error('Task cancelled');

      const fallbackWorthy =
        err instanceof LinkBrokenError || err instanceof DownloadLimitReachedError;
      if (!fallbackWorthy) throw err;

      const message = err instanceof Error ? err.message : String(err);

      if (err instanceof LinkBrokenError) {
        addToBookBlocklist({
          downloadUrl: candidate.url,
          reason: 'link-broken',
          wantedBookId: wantedBookId ?? null,
          libraryId,
          title: bookTitle,
          author: bookAuthor,
          source,
        });
      }

      const next = alternates.shift();
      if (!next) {
        // Every mirror this resolve found is now dead or rate-limited.
        // Blocklist the book itself (by its source-scoped identifier, not
        // any one mirror) so auto-search doesn't queue the same md5 again
        // — mirrors createDownloadsFromPost blocklisting the article's
        // webLink once every one of its links has failed.
        addToBookBlocklist({
          downloadUrl,
          reason: 'no-working-links',
          wantedBookId: wantedBookId ?? null,
          libraryId,
          title: bookTitle,
          author: bookAuthor,
          source,
        });
        throw new Error(`All ${sourceLabel(source)} mirrors failed: ${message}`);
      }

      console.warn(
        `[book-download] ${candidate.url} failed (${message}); trying ${next.url}`
      );
      switchBookDownloadLink(bookDownloadId, alternates);
      candidate = next;
      lastPersisted = 0;
    }
  }

  if (signal.aborted) {
    try { fs.unlinkSync(partialPath); } catch { /* ignore */ }
    throw new Error('Task cancelled');
  }

  // Only now, with the stream finished cleanly, does the file become
  // part of the library.
  moveFile(partialPath, targetPath);

  const fileSize = fs.statSync(targetPath).size;
  updateBookDownloadProgress(bookDownloadId, fileSize, fileSize);

  return {
    filename: candidate.filename,
    contentType: candidate.contentType ?? 'application/octet-stream',
    size: fileSize,
    targetPath,
  };
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
    /**
     * Set by `bookResumeHandler` when this task is resuming a download that
     * already has a `book_downloads` row (and, on disk, a `.partial` file to
     * pick back up) rather than starting a new one. Every other caller
     * (`queueDownload`, `/api/downloads/queue`) leaves this unset and gets
     * the original create-a-new-row behaviour below.
     */
    bookDownloadId?: number;
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

  // Give this download a row of its own before anything is fetched, so it
  // has an identity beyond this task (E2-1). There is no single stable URL
  // to record yet — libgen resolves the actual file mirrors deep inside
  // resolveLibgenDownloads below, and other sources aren't wired up at all —
  // so this is a source-scoped identifier rather than a fetchable link.
  const downloadUrl = `${data.source}:${data.md5}`;

  // A resume task (book_resume) passes the id of an existing row so this
  // invocation drives the same row — and the same `.partial` file on disk —
  // rather than splitting the download's state, history and blocklist
  // context across a second one. Every other caller leaves bookDownloadId
  // unset and gets a fresh row, as before.
  let bookDownload: ReturnType<typeof addBookDownload>;
  if (data.bookDownloadId !== undefined) {
    const existing = getBookDownload(data.bookDownloadId);
    if (!existing) {
      throw new Error(`Book download ${data.bookDownloadId} not found`);
    }
    bookDownload = existing;
  } else {
    bookDownload = addBookDownload({
      wantedBookId: data.wantedBookId ?? null,
      libraryId: data.libraryId,
      source: data.source,
      title: bookTitle,
      author: bookAuthor,
      extension: data.extension || 'epub',
      downloadUrl,
      md5: data.md5,
    });
  }
  setBookDownloadState(bookDownload.id, 'downloading');

  const recordFailure = (error: string): void => {
    setBookDownloadState(bookDownload.id, error === 'Task cancelled' ? 'cancelled' : 'failed', { error });
    addBookDownloadHistory({
      wantedBookId: data.wantedBookId ?? null,
      libraryId: data.libraryId,
      source: data.source,
      title: bookTitle,
      author: bookAuthor,
      downloadUrl,
      success: false,
    });

    // bookSearchAllHandler (E4-2) moves a wanted book to 'searching' before
    // queuing this task, so a later sweep doesn't queue the same book again
    // while a download is already in flight. If that download then fails —
    // or is cancelled — nothing else ever puts it back to 'wanted', which
    // would otherwise leave it stuck at 'searching' forever, invisible to
    // every future sweep. The status check guards against clobbering
    // 'acquired' (an unrelated metadata match that landed first) or any
    // other status a person set by hand; a manual one-off download (started
    // straight from the download modal, which never sets 'searching') is
    // also left alone by this same check, since its status is still
    // 'wanted' and the UPDATE simply matches no rows.
    if (data.wantedBookId) {
      execute(
        "UPDATE wanted_books SET status = 'wanted' WHERE id = ? AND status = 'searching'",
        [data.wantedBookId]
      );
    }
  };

  try {
    // Step 2: Resolve a mirror and stream the file. The final path is worked
    // out before any bytes move (this used to be Step 3, done after a full
    // in-memory buffer was already in hand) so the stream can go straight to
    // a `.partial` sibling of where the book will actually live, and moving
    // it into place on success is a same-directory rename rather than a
    // cross-directory one.
    // Resolve every candidate that actually serves the file, not just the
    // first (E2-3), so a mid-stream failure below can fall through the rest
    // without re-resolving from scratch. A candidate already known dead is
    // skipped up front, the same way findWorkingLink skips a blocklisted
    // comic link before ever trying it. Only *how* candidates are resolved
    // differs between sources — LibGen's own mirrors, Anna's Archive's
    // member API or scraped links, Z-Library's single detail-page link —
    // which is exactly what downloadBookWithFallback's resolveCandidates
    // parameter abstracts.
    let resolveCandidates: () => Promise<ResolvedDownload[]>;
    switch (data.source) {
      case 'libgen':
        resolveCandidates = () => resolveLibgenDownloads(data.md5);
        break;
      case 'annas':
        resolveCandidates = () => resolveAnnasDownload(data.md5);
        break;
      case 'zlibrary':
        resolveCandidates = () => resolveZlibraryDownload(data.md5);
        break;
      default:
        throw new Error(`Download from ${data.source} not yet supported`);
    }

    const downloaded = await downloadBookWithFallback({
      source: data.source,
      resolveCandidates,
      bookDownloadId: bookDownload.id,
      bookTitle,
      bookAuthor,
      libraryPath: library.path,
      extension: data.extension,
      wantedBookId: data.wantedBookId,
      libraryId: data.libraryId,
      downloadUrl,
      signal,
    });

    const targetPath = downloaded.targetPath;
    const fileData: { filename: string; contentType: string; size: number } = downloaded;

    if (signal.aborted) {
      try { fs.unlinkSync(targetPath); } catch { /* ignore */ }
      throw new Error('Task cancelled');
    }
    // Steps 2 (download) and 3 (save) are now one streaming pass, so there is
    // no separate "downloaded, about to save" checkpoint to report.
    onProgress(3, 6);

    // Step 4: Add book to database (using clean data from wanted book if available)
    const ext = path.extname(targetPath).replace('.', '') || data.extension || 'epub';
    const bookId = await addBook({
      libraryId: data.libraryId,
      filePath: targetPath,
      title: bookTitle,
      authors: bookAuthor ? JSON.stringify([bookAuthor]) : null,
      extension: ext,
      fileSize: fileData.size,
    });

    setBookDownloadState(bookDownload.id, 'importing', { filePath: targetPath, bookId });

    // Update wanted book status if this was from wanted list
    if (data.wantedBookId) {
      execute(
        "UPDATE wanted_books SET status = 'acquired' WHERE id = ?",
        [data.wantedBookId]
      );
    }

    if (signal.aborted) throw new Error('Task cancelled');
    onProgress(4, 6);

    // Step 5: Fetch metadata and update book (E4-3 pulled this into
    // `matchBookMetadata`, shared with `bookImportHandler`; behaviour here is
    // unchanged).
    const metadataMatch = await matchBookMetadata(
      bookId,
      bookTitle,
      bookAuthor,
      wantedBook?.hardcover_id
    );
    const finalTitle = metadataMatch.finalTitle;
    const finalAuthor = metadataMatch.finalAuthor;
    const metadataFound = metadataMatch.metadataFound;

    if (signal.aborted) throw new Error('Task cancelled');
    onProgress(5, 6);

    // Step 6: File the book using the same naming template every other book
    // in the library is organized with (E2-6). This used to reimplement
    // "Author/Title - Series Book N" inline — its own sanitization, its own
    // numbered-suffix collision loop, a plain fs.renameSync — and ignored
    // whatever the user actually configured in Settings -> Organize.
    // generateNewPath/moveFile/resolveTargetCollision are the same functions
    // the organize-preview page and the `organize` task use, so a downloaded
    // book lands exactly where reorganizing the library would put it.
    //
    // This intentionally does NOT check `organize_auto_run`. That setting
    // gates bulk re-organizing of a library someone may have filed by hand;
    // it has no bearing here because a just-downloaded file has never been
    // filed anywhere yet — there is no existing layout of the user's to
    // leave alone. Skipping this step when auto-run is off would just mean
    // every download lands under its raw download filename in the library
    // root, which reads as a bug rather than a respected preference.
    //
    // E4-3 pulled this into `organizeNewBook`, shared with
    // `bookImportHandler`; behaviour here is unchanged.
    const organizeResult = await organizeNewBook(bookId, library, targetPath);
    const finalPath = organizeResult.finalPath;

    onProgress(6, 6);

    setBookDownloadState(bookDownload.id, 'completed', { filePath: finalPath, bookId });
    addBookDownloadHistory({
      wantedBookId: data.wantedBookId ?? null,
      libraryId: data.libraryId,
      source: data.source,
      title: finalTitle,
      author: finalAuthor,
      downloadUrl,
      success: true,
    });

    return {
      success: true,
      bookId,
      filePath: finalPath,
      filename: path.basename(finalPath),
      fileSize: fileData.size,
      source: data.source,
      wantedBookId: data.wantedBookId,
      metadataFound,
      organized: finalPath !== targetPath,
    };
  } catch (err) {
    recordFailure(err instanceof Error ? err.message : String(err));
    throw err;
  }
};

/**
 * Import a book file a person already downloaded themselves (E4-3).
 *
 * Two of the three book sources (Anna's Archive, Z-Library) still can't be
 * fetched by Shelvarr directly, and even once they can, someone will
 * occasionally grab a file by hand and want to hand it over without dropping
 * it in a library folder and waiting for the nightly scan. The upload route
 * (`POST /api/wanted/[id]/import`) saves the file to a scratch location
 * synchronously and queues this task with the path to it.
 *
 * This is a sibling to `downloadHandler`, not a mode of it: the download
 * handler's first three steps (resolve a mirror, stream it, land it next to
 * where it will finally live) are libgen-specific plumbing that a
 * already-on-disk file has no use for, and threading a "skip the fetch"
 * branch through that recently-landed, already-intricate mirror-fallback
 * logic would risk it for no real benefit. What *is* shared — add the book
 * row, match metadata, file it with the organizer — lives in
 * `matchBookMetadata` / `organizeNewBook` above, which this calls the same
 * way `downloadHandler` does.
 */
const bookImportHandler: TaskHandler = async (taskId, onProgress, signal) => {
  const taskRow = queryOne<{ result: string | null }>(
    'SELECT result FROM tasks WHERE id = ?',
    [taskId]
  );

  if (!taskRow?.result) {
    throw new Error('Task missing import configuration');
  }

  const data = JSON.parse(taskRow.result) as {
    libraryId: number;
    /** Where the upload route saved the file — a scratch path, not yet in the library. */
    filePath: string;
    originalFilename: string;
    extension: string;
    title: string;
    author: string | null;
    wantedBookId?: number;
  };

  if (!data.libraryId || !data.filePath) {
    throw new Error('Invalid import task configuration');
  }

  onProgress(0, 4); // 4 steps: place file, add to db, fetch metadata, organize

  const library = await getLibraryById(data.libraryId);
  if (!library) {
    throw new Error(`Library ${data.libraryId} not found`);
  }

  // Same as downloadHandler: prefer the clean title/author (and hardcover id)
  // off the wanted book over whatever the uploader typed.
  let wantedBook: { title: string; author: string | null; hardcover_id: string | null } | null = null;
  if (data.wantedBookId) {
    wantedBook = queryOne<{ title: string; author: string | null; hardcover_id: string | null }>(
      'SELECT title, author, hardcover_id FROM wanted_books WHERE id = ?',
      [data.wantedBookId]
    );
  }
  const bookTitle = wantedBook?.title || data.title;
  const bookAuthor = wantedBook?.author || data.author;

  if (signal.aborted) throw new Error('Task cancelled');
  onProgress(1, 4);

  // Move the upload out of scratch and into the library under a plain
  // filename — the organizer step below is what actually files it properly.
  if (!fs.existsSync(library.path)) {
    fs.mkdirSync(library.path, { recursive: true });
  }

  const ext = data.extension || path.extname(data.originalFilename).replace('.', '') || 'epub';
  const authorPart = bookAuthor && bookAuthor !== 'Unknown' ? `${sanitizeFilename(bookAuthor)} - ` : '';
  const titlePart = sanitizeFilename(bookTitle || 'Unknown');
  const targetPath = resolveTargetCollision(path.join(library.path, `${authorPart}${titlePart}.${ext}`));

  moveFile(data.filePath, targetPath);
  const fileSize = fs.statSync(targetPath).size;

  if (signal.aborted) throw new Error('Task cancelled');
  onProgress(2, 4);

  // Step: add book to database
  const bookId = await addBook({
    libraryId: data.libraryId,
    filePath: targetPath,
    title: bookTitle,
    authors: bookAuthor ? JSON.stringify([bookAuthor]) : null,
    extension: ext,
    fileSize,
  });

  if (signal.aborted) throw new Error('Task cancelled');

  // Step: fetch metadata and update book
  const metadataMatch = await matchBookMetadata(
    bookId,
    bookTitle,
    bookAuthor,
    wantedBook?.hardcover_id
  );

  onProgress(3, 4);

  // Step: file the book with the organizer, same as a completed download.
  const organizeResult = await organizeNewBook(bookId, library, targetPath);

  onProgress(4, 4);

  // Mark the wanted book acquired on success — unconditionally, the same way
  // downloadHandler does: the book is in the library either way, matched or
  // not, so "wanted" no longer describes it.
  if (data.wantedBookId) {
    execute(
      "UPDATE wanted_books SET status = 'acquired' WHERE id = ?",
      [data.wantedBookId]
    );
  }

  return {
    success: true,
    bookId,
    filePath: organizeResult.finalPath,
    filename: path.basename(organizeResult.finalPath),
    fileSize,
    wantedBookId: data.wantedBookId,
    metadataFound: metadataMatch.metadataFound,
    organized: organizeResult.organized,
  };
};

/**
 * Pick up book downloads that were interrupted rather than finished.
 *
 * A book download is driven by a `download` task in one server process. If
 * that process stops — a restart, a crash, a container being replaced — the
 * row is left sitting in `downloading` or `importing` with nobody working on
 * it.
 *
 * `claimStalledBookDownloads` does the actual claiming (same
 * atomic-UPDATE-with-RETURNING shape as `claimStalledComicDownloads`, so two
 * server processes sweeping at once can't double up). For each row claimed,
 * this re-enqueues a `download` task carrying that row's own id
 * (`bookDownloadId`), which is what makes `downloadHandler` drive the same
 * row — and resume the same `.partial` file on disk — instead of starting a
 * new download from scratch.
 */
const bookResumeHandler: TaskHandler = async (taskId, onProgress) => {
  const taskRow = queryOne<{ result: string | null }>(
    'SELECT result FROM tasks WHERE id = ?',
    [taskId]
  );
  if (!taskRow?.result) throw new Error('Task missing book resume configuration');

  const data = JSON.parse(taskRow.result) as { staleMinutes?: number; limit?: number };

  const stalled = claimStalledBookDownloads(data.staleMinutes ?? 30, data.limit ?? 25);
  onProgress(0, stalled.length);

  const resumed: number[] = [];
  for (const [index, download] of stalled.entries()) {
    enqueueTask('download', {
      bookDownloadId: download.id,
      source: download.source,
      md5: download.md5,
      title: download.title,
      author: download.author,
      extension: download.extension,
      libraryId: download.libraryId,
      wantedBookId: download.wantedBookId ?? undefined,
    });
    resumed.push(download.id);
    onProgress(index + 1, stalled.length);
  }

  if (resumed.length > 0) {
    console.warn(`[book-resume] restarted ${resumed.length} interrupted download(s)`);
  }

  return {
    resumed: resumed.length,
    downloadIds: resumed,
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
 * Scan every book library.
 *
 * The per-library `scan` handler already knows how to chain into metadata and
 * organize, so this sweep queues one of those per library rather than
 * repeating that logic.
 */
const bookScanAllHandler: TaskHandler = async (_taskId, onProgress) => {
  const libraries = await getAllLibraries();
  onProgress(0, libraries.length);

  const queued: Array<{ libraryId: number; libraryName: string; taskId: number }> = [];

  for (const [index, library] of libraries.entries()) {
    const task = enqueueTask('scan', { libraryId: library.id, libraryName: library.name });
    queued.push({ libraryId: library.id, libraryName: library.name, taskId: task.id });
    onProgress(index + 1, libraries.length);
  }

  return { libraries: libraries.length, queued };
};

/**
 * Rename and move files in every book library to match the stored template.
 *
 * Like the scan sweep, this queues the per-library handler so a run shows up
 * on the Tasks page as one entry per library.
 */
const bookOrganizeAllHandler: TaskHandler = async (_taskId, onProgress) => {
  const libraries = await getAllLibraries();
  onProgress(0, libraries.length);

  const queued: Array<{ libraryId: number; libraryName: string; taskId: number }> = [];

  for (const [index, library] of libraries.entries()) {
    const task = enqueueTask('organize', { libraryId: library.id, libraryName: library.name });
    queued.push({ libraryId: library.id, libraryName: library.name, taskId: task.id });
    onProgress(index + 1, libraries.length);
  }

  return { libraries: libraries.length, queued };
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

  const volumeRow = queryOne<{
    folder: string | null;
    publisher: string | null;
    root_folder_id: number | null;
  }>(
    'SELECT folder, publisher, root_folder_id FROM comics WHERE id = ?',
    [download.volumeId]
  );

  const fail = (message: string): never => {
    setDownloadState(download.id, 'failed', { error: message });
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
        setDownloadProgress(download.id, bytes, total);

        if (getComicDownload(download.id)?.state === 'cancelled') {
          cancelledByUser = true;
          cancelController.abort();
        }
      },
    });

    if (cancelledByUser) throw new Error('Download cancelled');

    setDownloadProgress(download.id, result.bytes, resolved.size);
    return result;
  };

  const namingVolume = {
    title: loaded.volume.title,
    year: loaded.volume.year,
    volumeNumber: loaded.volume.volumeNumber,
    specialVersion: loaded.volume.specialVersion,
    publisher: volumeRow?.publisher ?? null,
    folder: volumeRow?.folder ?? null,
    rootFolderId: volumeRow?.root_folder_id ?? null,
  };

  // Check the library folder is writable before spending bandwidth on a file
  // we would only fail to file away. A wrongly-owned bind mount is the usual
  // culprit, and it fails every download identically.
  try {
    await ensureImportable(namingVolume);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  const attempt = startComicDownloadAttempt(download.id);

  let candidate: ComicDownloadLink = { host: download.host, link: download.downloadLink };
  const alternates = [...download.alternateLinks];
  let fetched: { path: string; bytes: number } | null = null;

  while (!fetched) {
    try {
      fetched = await fetchLink(candidate);
    } catch (error) {
      if (cancelled()) {
        setDownloadState(download.id, 'cancelled');
        clearScratch();
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
        deferDownload(
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
      switchDownloadLink(download.id, next, alternates);
      candidate = next;
    }
  }

  try {
    setDownloadState(download.id, 'importing');

    const imported = await importComicDownload(download, fetched.path, namingVolume);

    setDownloadState(download.id, 'completed', { filePath: imported.path });
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
      setDownloadState(download.id, 'cancelled');
      clearScratch();
      throw error;
    }
    // The bytes are on disk; only the move into the library went wrong, so
    // another link would not help. They are left there on purpose: a retry
    // resumes from them instead of fetching the issue again, and the scratch
    // sweep clears them if the retry never comes.
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
 *
 * Doubles as the housekeeping tick: scratch files no download can still use
 * are deleted here, which is the only thing that ever removes them.
 */
const comicResumeHandler: TaskHandler = async (taskId, onProgress) => {
  const data = comicTaskData<{
    staleMinutes?: number;
    limit?: number;
    keepFailedHours?: number;
  }>(taskId, 'comic resume configuration');

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

  // After requeueing, so a download just put back to `queued` keeps its bytes.
  // Housekeeping must not fail the tick that resumed real work, so an
  // unreadable scratch directory is reported rather than thrown.
  let swept = { removed: [] as string[], bytes: 0 };
  let sweepError: string | null = null;
  try {
    swept = sweepComicScratch(
      data.keepFailedHours === undefined ? {} : { keepFailedHours: data.keepFailedHours }
    );
  } catch (error) {
    sweepError = error instanceof Error ? error.message : String(error);
    console.warn(`[comic-resume] could not sweep the scratch directory: ${sweepError}`);
  }

  return {
    resumed: resumed.length,
    downloadIds: resumed,
    scratchRemoved: swept.removed.length,
    scratchBytesFreed: swept.bytes,
    ...(sweepError ? { sweepError } : {}),
  };
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
 * The library a book auto-search downloads into.
 *
 * A wanted book isn't tied to any library — unlike a comic volume, which is
 * already filed under a root folder by the time auto-search runs — so this
 * picks the first library configured to hold books (`libraries.type =
 * 'book'`, ordered by id). If several exist, always landing on the same one
 * is a documented limitation rather than a real choice: a "default download
 * library" setting would be the proper fix, but that's a separate card.
 */
function getDefaultBookLibrary(): { id: number; name: string } | null {
  return queryOne<{ id: number; name: string }>(
    "SELECT id, name FROM libraries WHERE type = 'book' ORDER BY id ASC LIMIT 1"
  );
}

/**
 * Auto-search every still-wanted book, queueing a download for whatever the
 * search turns up. This is the book equivalent of comicSearchAllHandler —
 * the scheduled sweep for E4-2 — except a book on the wanted list sits there
 * unsearched today, with nothing but a person opening the download modal by
 * hand to ever move it along.
 *
 * A book moves to 'searching' as soon as a result is found and its download
 * is queued, so a later sweep doesn't queue the same book a second time
 * while that download is still in flight. A book with no results is left at
 * 'wanted' — there's nothing to queue, and the next sweep should try again.
 * `downloadHandler`'s failure path (see `recordFailure` above) is what moves
 * a book back from 'searching' to 'wanted' if its queued download doesn't
 * pan out.
 */
const bookSearchAllHandler: TaskHandler = async (taskId, onProgress, signal) => {
  const data = comicTaskData<{ limit?: number }>(taskId, 'book search configuration');

  const library = getDefaultBookLibrary();
  if (!library) {
    return {
      searched: 0,
      queued: 0,
      failed: [],
      reason: 'No book library configured — add one before auto-search can download anything.',
    };
  }

  const wantedBooks = getWantedBooks('wanted').slice(0, data.limit ?? 100);
  onProgress(0, wantedBooks.length);

  let queued = 0;
  const failed: Array<{ wantedBookId: number; error: string }> = [];

  for (const [index, book] of wantedBooks.entries()) {
    if (signal.aborted) break;
    try {
      // Same query shape the manual download modal builds from a wanted
      // book (title + author, see DownloadSourcesModal.tsx), so auto-search
      // finds what a person searching by hand would find.
      const searchQuery = `${book.title} ${book.author || ''}`.trim();
      const { results } = await searchAllSources(searchQuery, { isbn: book.isbn || undefined });

      if (results.length > 0) {
        // The sort in searchAllSources already puts the best-status,
        // best-format-preference, best-title-match result first — no
        // second ranking pass here.
        const best = results[0]!;
        updateWantedBook(book.id, { status: 'searching' });
        enqueueTask('download', {
          source: best.source,
          md5: best.md5,
          title: best.title,
          author: best.author,
          extension: best.extension,
          libraryId: library.id,
          wantedBookId: book.id,
        });
        queued += 1;
      }
    } catch (error) {
      failed.push({
        wantedBookId: book.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    onProgress(index + 1, wantedBooks.length);
  }

  return { searched: wantedBooks.length, queued, failed, libraryId: library.id };
};

/**
 * The proposals the last completed scan of `path` left behind.
 *
 * A scan's task row holds its input configuration until the handler returns,
 * at which point the return value replaces it — so only a completed run has
 * proposals to offer, and a run of some other folder has nothing to say about
 * this one.
 */
function previousScanProposals(taskId: number, path: string): StoredImportProposal[] {
  const row = queryOne<{ result: string | null }>(
    `SELECT result FROM tasks
      WHERE type = 'comic_library_import' AND status = 'completed'
        AND id != ? AND result IS NOT NULL
      ORDER BY id DESC LIMIT 1`,
    [taskId]
  );
  if (!row?.result) return [];

  try {
    const parsed = JSON.parse(row.result) as {
      path?: string;
      proposals?: StoredImportProposal[];
    };
    if (parsed.path !== path || !Array.isArray(parsed.proposals)) return [];
    return parsed.proposals;
  } catch {
    return [];
  }
}

/**
 * Walk a folder tree and work out which ComicVine volume each folder is.
 *
 * Proposals are returned rather than applied — adopting the wrong series would
 * be tedious to undo, so a human confirms. One ComicVine search per folder
 * means this is slow by design.
 *
 * Re-running this resumes rather than restarts: folders the last scan of the
 * same path already got an answer for keep it, and only the ones it never
 * reached are searched. That is what makes a library bigger than ComicVine's
 * hourly quota finishable — each re-run spends the new hour's quota on new
 * folders instead of re-asking about the same first two hundred.
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

  const plan = planLibraryImportScan(groups, previousScanProposals(taskId, data.path));

  // Carried folders are already done, so progress starts where the last run
  // left off rather than replaying from zero.
  onProgress(plan.carried.length, groups.length);

  const searched = await proposeLibraryImport(plan.toSearch, {
    signal,
    onProgress: (done) => onProgress(plan.carried.length + done, groups.length),
  });

  // Candidates are kept — trimmed to what the review UI shows — so choosing a
  // different match costs no further ComicVine searches, and so the next run
  // can tell which folders it is allowed to skip.
  const proposals = mergeScanResults(groups, plan, searched);

  return {
    path: data.path,
    // A folder with no candidates because ComicVine stopped answering is not
    // the same as one ComicVine has never heard of, so the reason travels with
    // the proposal rather than being flattened into an empty candidate list.
    unsearched: proposals.filter((proposal) => proposal.failure !== null).length,
    proposals,
  };
};

/** Housekeeping for expired sessions and unused sign-in codes. */
const authPruneHandler: TaskHandler = async (_taskId, onProgress) => {
  const removed = pruneExpired();
  onProgress(1, 1);
  return {
    message: `Removed ${removed.sessions} expired sessions and ${removed.loginCodes} expired sign-in codes`,
    ...removed,
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
  registerTaskHandler('book_import', bookImportHandler);

  // Library-wide book sweeps, run on a timer from Settings -> Books.
  registerTaskHandler('book_scan_all', bookScanAllHandler);
  registerTaskHandler('book_organize_all', bookOrganizeAllHandler);
  registerTaskHandler('book_resume', bookResumeHandler);
  registerTaskHandler('book_search_all', bookSearchAllHandler);

  // Comic acquisition: search GetComics, then fetch and import what it found.
  registerTaskHandler('comic_search', comicSearchHandler);
  registerTaskHandler('comic_download', comicDownloadHandler);

  // Comic library: ComicVine metadata, disk scanning, renaming.
  registerTaskHandler('comic_refresh', comicRefreshHandler);
  registerTaskHandler('comic_scan', comicScanHandler);
  registerTaskHandler('comic_rename', comicRenameHandler);
  registerTaskHandler('comic_update_all', comicUpdateAllHandler);
  registerTaskHandler('comic_search_all', comicSearchAllHandler);
  registerTaskHandler('comic_resume', comicResumeHandler);
  registerTaskHandler('comic_library_import', comicLibraryImportHandler);

  registerTaskHandler('author_sync', async (_taskId, onProgress) => {
    onProgress(1, 1);
    return { message: 'Author sync handler not yet implemented' };
  });

  // Probe download sources on a timer so mirror selection at download time
  // has a fresh cache instead of whatever was last checked when a page
  // happened to be opened.
  registerTaskHandler('source_health', async (_taskId, onProgress) => {
    await refreshSourceStatuses();
    const statuses = await getSourceStatuses();
    onProgress(statuses.length, statuses.length);
    return { sourcesProbed: statuses.length };
  });

  // Housekeeping: drop timed-out sessions and sign-in codes. Sessions are
  // also swept as they are met, but nothing else ever revisits a link that
  // was emailed and never opened.
  registerTaskHandler('auth_prune', authPruneHandler);
}

export default { registerAllHandlers };
