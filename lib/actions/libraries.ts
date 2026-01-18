'use server';

import { revalidatePath } from 'next/cache';
import {
  getAllLibraries,
  getLibraryById,
  createLibrary as createLib,
  deleteLibrary as deleteLib,
  getLibraryBookCount,
} from '@/lib/services/library';
import { scanLibrary as scanLib, getBooks, updateBook } from '@/lib/services/scanner';
import { createTask, startTask, completeTask, failTask } from '@/lib/services/queue';
import * as metadataService from '@/lib/services/metadata';

export async function getLibraries() {
  const libraries = await getAllLibraries();
  return Promise.all(
    libraries.map(async (lib) => ({
      ...lib,
      bookCount: await getLibraryBookCount(lib.id),
    }))
  );
}

/**
 * Apply metadata from a search result to a book
 */
function applyMetadataToBook(bookId: number, metadata: metadataService.BookMetadata) {
  // Extract primary series (first in the array) for backwards compatibility
  const primarySeries = metadata.series?.[0];

  return updateBook(bookId, {
    title: metadata.title,
    authors: JSON.stringify(metadata.authors.split(', ')),
    publisher: metadata.publisher,
    publishDate: metadata.publishDate,
    description: metadata.description,
    isbn: metadata.isbn,
    coverUrl: metadata.coverUrl,
    series: metadata.series ? JSON.stringify(metadata.series) : null,
    seriesName: primarySeries?.[0] ?? null,
    seriesNumber: primarySeries?.[1] ?? null,
    metadataSource: metadata.source,
    metadataId: metadata.sourceId,
  });
}

/**
 * Fetch and apply metadata for books in a library
 */
async function fetchMetadataForLibrary(
  libraryId: number,
  unmatchedOnly: boolean,
  taskId: number
): Promise<{ processed: number; matched: number }> {
  await startTask(taskId);

  const { books } = await getBooks({ libraryId, pageSize: 10000 });
  let processed = 0;
  let matched = 0;

  for (const book of books) {
    // Skip if already matched (when unmatchedOnly)
    if (unmatchedOnly && book.metadataSource) continue;
    // Skip books without a title
    if (!book.title) continue;

    try {
      const author = book.authors ? JSON.parse(book.authors)[0] : undefined;
      const metadata = await metadataService.autoMatch(book.title, author, book.isbn || undefined);

      if (metadata) {
        await applyMetadataToBook(book.id, metadata);
        matched++;
      }
    } catch {
      // Continue on individual failures
    }
    processed++;
  }

  await completeTask(taskId, { processed, matched });
  return { processed, matched };
}

export async function createLibrary(formData: FormData) {
  const name = formData.get('name') as string;
  const path = formData.get('path') as string;

  if (!name || !path) {
    return { error: 'Name and path are required' };
  }

  try {
    const result = await createLib({ name, path });
    if (!result.success) {
      return { error: result.error || 'Failed to create library' };
    }

    if (result.library) {
      const libraryId = result.library.id;

      // Run scan + metadata fetch in background
      (async () => {
        const scanTask = await createTask('scan', { libraryId, libraryName: name });
        try {
          await startTask(scanTask.id);
          await scanLib(libraryId);
          await completeTask(scanTask.id, { booksScanned: true });

          // After scan, fetch metadata for all books
          const metaTask = await createTask('metadata', { libraryId, libraryName: name, unmatchedOnly: true });
          await fetchMetadataForLibrary(libraryId, true, metaTask.id);
        } catch (error) {
          await failTask(scanTask.id, error instanceof Error ? error.message : 'Failed');
        }
      })();
    }

    revalidatePath('/libraries');
    revalidatePath('/');
    return { success: true, library: result.library };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to create library' };
  }
}

export async function deleteLibrary(id: number) {
  try {
    await deleteLib(id);
    revalidatePath('/libraries');
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to delete library' };
  }
}

export async function scanLibrary(id: number) {
  const library = await getLibraryById(id);
  if (!library) {
    return { error: 'Library not found' };
  }

  const task = await createTask('scan', { libraryId: id, libraryName: library.name });

  (async () => {
    try {
      await startTask(task.id);
      await scanLib(id);
      await completeTask(task.id, { booksScanned: true });
    } catch (error) {
      await failTask(task.id, error instanceof Error ? error.message : 'Scan failed');
    }
  })();

  revalidatePath('/libraries');
  revalidatePath('/books');
  return { success: true, taskId: task.id };
}

export async function fetchLibraryMetadata(id: number, unmatchedOnly = true) {
  const library = await getLibraryById(id);
  if (!library) {
    return { error: 'Library not found' };
  }

  const task = await createTask('metadata', { libraryId: id, libraryName: library.name, unmatchedOnly });

  (async () => {
    try {
      await fetchMetadataForLibrary(id, unmatchedOnly, task.id);
    } catch (error) {
      await failTask(task.id, error instanceof Error ? error.message : 'Metadata fetch failed');
    }
  })();

  revalidatePath('/libraries');
  revalidatePath('/books');
  return { success: true, taskId: task.id };
}
