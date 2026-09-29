import {
  query,
  queryOne,
  execute,
  insertReturning,
  sqlTimeToIso,
  addComicRootFolder,
  getComicRootFolderForLibrary,
  countVolumesInRootFolder,
} from '@shelvarr/db';
import type { Library, LibraryType } from '@shelvarr/types';
import { existsSync, statSync } from 'fs';
import { mkdir } from 'fs/promises';

interface LibraryRow {
  id: number;
  name: string;
  path: string;
  type: string | null;
  created_at: string;
}

function rowToLibrary(row: LibraryRow): Library {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    type: row.type === 'comic' ? 'comic' : 'book',
    createdAt: sqlTimeToIso(row.created_at),
  };
}

/**
 * Libraries of one type, book by default — the callers that sweep libraries to
 * scan or organize books would choke on a comic one.
 */
export async function getAllLibraries(type: LibraryType | 'all' = 'book'): Promise<Library[]> {
  const rows =
    type === 'all'
      ? await query<LibraryRow>('SELECT * FROM libraries ORDER BY name')
      : await query<LibraryRow>(
          "SELECT * FROM libraries WHERE COALESCE(type, 'book') = ? ORDER BY name",
          [type]
        );
  return rows.map(rowToLibrary);
}

export async function getLibraryById(id: number): Promise<Library | null> {
  const row = await queryOne<LibraryRow>('SELECT * FROM libraries WHERE id = ?', [id]);
  return row ? rowToLibrary(row) : null;
}

export async function getLibraryByPath(path: string): Promise<Library | null> {
  const row = await queryOne<LibraryRow>('SELECT * FROM libraries WHERE path = ?', [path]);
  return row ? rowToLibrary(row) : null;
}

export interface CreateLibraryInput {
  name: string;
  path: string;
  type?: LibraryType;
}

export interface CreateLibraryResult {
  success: boolean;
  library?: Library;
  error?: string;
}

export async function createLibrary(input: CreateLibraryInput): Promise<CreateLibraryResult> {
  const { name, path, type = 'book' } = input;

  // Validate name
  if (!name || name.trim().length === 0) {
    return { success: false, error: 'Library name is required' };
  }

  // Validate path
  if (!path || path.trim().length === 0) {
    return { success: false, error: 'Library path is required' };
  }

  // A comic library is created empty and filled by adding volumes, so unlike a
  // book library there is nothing to point it at yet — make the folder.
  if (type === 'comic' && !existsSync(path)) {
    try {
      await mkdir(path, { recursive: true });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : `Could not create ${path}`,
      };
    }
  }

  // Check if path exists and is a directory
  if (!existsSync(path)) {
    return { success: false, error: `Path does not exist: ${path}` };
  }

  const stats = statSync(path);
  if (!stats.isDirectory()) {
    return { success: false, error: `Path is not a directory: ${path}` };
  }

  // Check for duplicate path
  const existing = await getLibraryByPath(path);
  if (existing) {
    return { success: false, error: `Library already exists for path: ${path}` };
  }

  try {
    if (type === 'comic') {
      // Creates the library row as well — the root folder is what makes it one.
      const root = addComicRootFolder(path, name);
      const library = await getLibraryById(root.libraryId);
      return library
        ? { success: true, library }
        : { success: false, error: 'Failed to create library' };
    }

    const row = await insertReturning<LibraryRow>(
      "INSERT INTO libraries (name, path, type) VALUES (?, ?, 'book') RETURNING *",
      [name.trim(), path]
    );

    if (!row) {
      return { success: false, error: 'Failed to create library' };
    }

    return { success: true, library: rowToLibrary(row) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export async function updateLibrary(
  id: number,
  updates: Partial<Pick<Library, 'name'>>
): Promise<CreateLibraryResult> {
  const existing = await getLibraryById(id);
  if (!existing) {
    return { success: false, error: 'Library not found' };
  }

  const name = updates.name?.trim() || existing.name;

  try {
    await execute(
      'UPDATE libraries SET name = ? WHERE id = ?',
      [name, id]
    );

    const library = await getLibraryById(id);
    return { success: true, library: library! };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export async function deleteLibrary(id: number): Promise<{ success: boolean; error?: string }> {
  const existing = await getLibraryById(id);
  if (!existing) {
    return { success: false, error: 'Library not found' };
  }

  // A comic library's volumes are not cascade-deleted — they'd just lose their
  // root folder and be orphaned — so refuse while any still live in it.
  if (existing.type === 'comic') {
    const inUse = await getLibraryItemCount(existing);
    if (inUse > 0) {
      return {
        success: false,
        error: `Library still holds ${inUse} volume${inUse === 1 ? '' : 's'}; move or delete them first`,
      };
    }
  }

  try {
    // Books and the comic root folder are cascade deleted due to FK constraints
    await execute('DELETE FROM libraries WHERE id = ?', [id]);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/** Books for a book library, volumes for a comic one. */
export async function getLibraryItemCount(library: Library): Promise<number> {
  if (library.type !== 'comic') return getLibraryBookCount(library.id);
  const root = getComicRootFolderForLibrary(library.id);
  return root ? countVolumesInRootFolder(root.id) : 0;
}

export async function getLibraryBookCount(id: number): Promise<number> {
  const row = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM books WHERE library_id = ?', [id]);
  return parseInt(row?.count || '0', 10);
}
