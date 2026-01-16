/**
 * Task Handlers
 * Register handlers for different task types
 */

import { registerTaskHandler, type TaskHandler } from './index.js';
import { scanLibrary } from '../scanner/index.js';
import { getLibraryById } from '../library/index.js';
import { query, queryOne } from '../../db/index.js';

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

  return {
    libraryId,
    libraryName: library.name,
    added: result.added,
    updated: result.updated,
    removed: result.removed,
    total: result.total,
    errors: result.errors,
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
  let books: { id: number; title: string | null }[];

  if (data.bookIds && data.bookIds.length > 0) {
    // Specific books
    const placeholders = data.bookIds.map(() => '?').join(',');
    books = query<{ id: number; title: string | null }>(
      `SELECT id, title FROM books WHERE id IN (${placeholders})`,
      data.bookIds
    );
  } else if (data.libraryId) {
    // All books in library, optionally unmatched only
    const whereClause = data.unmatchedOnly
      ? 'WHERE library_id = ? AND metadata_source IS NULL'
      : 'WHERE library_id = ?';
    books = query<{ id: number; title: string | null }>(
      `SELECT id, title FROM books ${whereClause}`,
      [data.libraryId]
    );
  } else {
    throw new Error('Must specify libraryId or bookIds');
  }

  const total = books.length;
  let matched = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < books.length; i++) {
    if (signal.aborted) {
      throw new Error('Task cancelled');
    }

    const book = books[i];
    if (!book) continue;

    onProgress(i + 1, total);

    try {
      // For now, just mark as processed
      // TODO: Actually call metadata service when integrated
      matched++;
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Book ${book.id}: ${message}`);
    }
  }

  return {
    total,
    matched,
    failed,
    errors: errors.slice(0, 10), // Limit errors in result
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

  registerTaskHandler('download', async (_taskId, onProgress) => {
    onProgress(1, 1);
    return { message: 'Download handler not yet implemented' };
  });

  registerTaskHandler('author_sync', async (_taskId, onProgress) => {
    onProgress(1, 1);
    return { message: 'Author sync handler not yet implemented' };
  });
}

export default { registerAllHandlers };
