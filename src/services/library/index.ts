import { query, queryOne, execute, insertReturning } from '../../db/index.js';
import type { Library } from '../../types/index.js';
import { existsSync, statSync } from 'fs';

interface LibraryRow {
  id: number;
  name: string;
  path: string;
  komga_library_id: string | null;
  created_at: string;
}

function rowToLibrary(row: LibraryRow): Library {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    komgaLibraryId: row.komga_library_id,
    createdAt: row.created_at,
  };
}

export async function getAllLibraries(): Promise<Library[]> {
  const rows = await query<LibraryRow>('SELECT * FROM libraries ORDER BY name');
  return rows.map(rowToLibrary);
}

export async function getLibraryById(id: number): Promise<Library | null> {
  const row = await queryOne<LibraryRow>('SELECT * FROM libraries WHERE id = $1', [id]);
  return row ? rowToLibrary(row) : null;
}

export async function getLibraryByPath(path: string): Promise<Library | null> {
  const row = await queryOne<LibraryRow>('SELECT * FROM libraries WHERE path = $1', [path]);
  return row ? rowToLibrary(row) : null;
}

export interface CreateLibraryInput {
  name: string;
  path: string;
  komgaLibraryId?: string;
}

export interface CreateLibraryResult {
  success: boolean;
  library?: Library;
  error?: string;
}

export async function createLibrary(input: CreateLibraryInput): Promise<CreateLibraryResult> {
  const { name, path, komgaLibraryId } = input;

  // Validate name
  if (!name || name.trim().length === 0) {
    return { success: false, error: 'Library name is required' };
  }

  // Validate path
  if (!path || path.trim().length === 0) {
    return { success: false, error: 'Library path is required' };
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
    const row = await insertReturning<LibraryRow>(
      'INSERT INTO libraries (name, path, komga_library_id) VALUES ($1, $2, $3) RETURNING *',
      [name.trim(), path, komgaLibraryId || null]
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
  updates: Partial<Pick<Library, 'name' | 'komgaLibraryId'>>
): Promise<CreateLibraryResult> {
  const existing = await getLibraryById(id);
  if (!existing) {
    return { success: false, error: 'Library not found' };
  }

  const name = updates.name?.trim() || existing.name;
  const komgaLibraryId = updates.komgaLibraryId !== undefined
    ? updates.komgaLibraryId
    : existing.komgaLibraryId;

  try {
    await execute(
      'UPDATE libraries SET name = $1, komga_library_id = $2 WHERE id = $3',
      [name, komgaLibraryId, id]
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

  try {
    // Books will be cascade deleted due to FK constraint
    await execute('DELETE FROM libraries WHERE id = $1', [id]);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export async function getLibraryBookCount(id: number): Promise<number> {
  const row = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM books WHERE library_id = $1', [id]);
  return parseInt(row?.count || '0', 10);
}
