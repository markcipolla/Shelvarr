'use server';

import { revalidatePath } from 'next/cache';
import {
  getAllLibraries,
  getLibraryById,
  createLibrary as createLib,
  deleteLibrary as deleteLib,
  getLibraryBookCount,
} from '@/lib/services/library';
import { scanLibrary as scanLib } from '@/lib/services/scanner';
import { createTask, startTask, completeTask, failTask, enqueueTask } from '@/lib/services/queue';

export async function getLibraries() {
  const libraries = await getAllLibraries();
  return Promise.all(
    libraries.map(async (lib) => ({
      ...lib,
      bookCount: await getLibraryBookCount(lib.id),
    }))
  );
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
