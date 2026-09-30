'use server';

import { revalidatePath } from 'next/cache';
import {
  getAllLibraries,
  getLibraryById,
  createLibrary as createLib,
  deleteLibrary as deleteLib,
  getLibraryItemCount,
} from '@/lib/services/library';
import { scanLibrary as scanLib } from '@/lib/services/scanner';
import { createTask, startTask, completeTask, failTask, enqueueTask } from '@/lib/services/queue';
import type { LibraryType } from '@/types';

/** Book libraries only by default — the book pages filter and scan by these. */
export async function getLibraries(type: LibraryType | 'all' = 'book') {
  const libraries = await getAllLibraries(type);
  return Promise.all(
    libraries.map(async (lib) => ({
      ...lib,
      bookCount: await getLibraryItemCount(lib),
    }))
  );
}

export async function createLibrary(formData: FormData) {
  const name = formData.get('name') as string;
  const path = formData.get('path') as string;
  const type: LibraryType = formData.get('type') === 'comic' ? 'comic' : 'book';

  if (!name || !path) {
    return { error: 'Name and path are required' };
  }

  try {
    const result = await createLib({ name, path, type });
    if (!result.success) {
      return { error: result.error || 'Failed to create library' };
    }

    if (type === 'comic') {
      revalidatePath('/libraries');
      revalidatePath('/comics');
      return { success: true, library: result.library };
    }

    if (result.library) {
      const libraryId = result.library.id;

      // Run scan in background, then queue batch metadata task
      (async () => {
        const scanTask = await createTask('scan', { libraryId, libraryName: name });
        try {
          await startTask(scanTask.id);
          await scanLib(libraryId);
          await completeTask(scanTask.id, { booksScanned: true });

          // After scan, queue a single batch metadata task
          // This will process books in parallel batches of 20
          enqueueTask('metadata', {
            libraryId,
            unmatchedOnly: true,
          });
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
    const result = await deleteLib(id);
    if (!result.success) return { error: result.error || 'Failed to delete library' };
    revalidatePath('/libraries');
    revalidatePath('/comics');
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

  // Queue a single batch metadata task for the library
  // This will process books in parallel batches of 20
  const task = enqueueTask('metadata', {
    libraryId: id,
    unmatchedOnly,
  });

  revalidatePath('/libraries');
  revalidatePath('/books');
  revalidatePath('/tasks');
  return { success: true, taskId: task.id };
}

/**
 * Look up metadata again for books that still have none — in one library, or
 * across all of them when no library is given.
 */
export async function refreshUnmatchedMetadata(libraryId?: number) {
  if (libraryId !== undefined && !(await getLibraryById(libraryId))) {
    return { error: 'Library not found' };
  }

  const task = enqueueTask('metadata', { libraryId, unmatchedOnly: true });

  revalidatePath('/unmatched');
  revalidatePath('/tasks');
  return { success: true, taskId: task.id };
}

export async function organizeLibrary(id: number) {
  const library = await getLibraryById(id);
  if (!library) {
    return { error: 'Library not found' };
  }

  // Use enqueueTask to both create AND run the task
  const task = enqueueTask('organize', { libraryId: id, libraryName: library.name });

  revalidatePath('/libraries');
  revalidatePath('/books');
  return { success: true, taskId: task.id };
}

/** Rescan every volume folder in a comic library. */
export async function scanComicLibrary(id: number) {
  const library = await getLibraryById(id);
  if (!library || library.type !== 'comic') {
    return { error: 'Comic library not found' };
  }

  const task = enqueueTask('comic_scan_all', { libraryId: id, libraryName: library.name });

  revalidatePath('/libraries');
  revalidatePath('/comics');
  return { success: true, taskId: task.id };
}

/**
 * Re-fetch ComicVine metadata for a comic library. `staleOnly` keeps to the
 * volumes the scheduled sweep would pick up; the whole library otherwise,
 * which is a large slice of the hourly ComicVine budget.
 */
export async function refreshComicLibraryMetadata(id: number, staleOnly = true) {
  const library = await getLibraryById(id);
  if (!library || library.type !== 'comic') {
    return { error: 'Comic library not found' };
  }

  const task = enqueueTask('comic_update_all', {
    libraryId: id,
    maxAgeHours: staleOnly ? 24 : 0,
    // No cap when the user asked for the lot; the sweep's 25 is a budget
    // guard for a job nobody watched start.
    ...(staleOnly ? {} : { limit: 1_000_000 }),
  });

  revalidatePath('/libraries');
  revalidatePath('/comics');
  revalidatePath('/tasks');
  return { success: true, taskId: task.id };
}
