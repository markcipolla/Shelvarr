import { getDatabase } from '../../db/index.js';
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

export function getAllLibraries(): Library[] {
  const rows = getDatabase()
    .prepare('SELECT * FROM libraries ORDER BY name')
    .all() as LibraryRow[];
  return rows.map(rowToLibrary);
}

export function getLibraryById(id: number): Library | null {
  const row = getDatabase()
    .prepare('SELECT * FROM libraries WHERE id = ?')
    .get(id) as LibraryRow | undefined;
  return row ? rowToLibrary(row) : null;
}

export function getLibraryByPath(path: string): Library | null {
  const row = getDatabase()
    .prepare('SELECT * FROM libraries WHERE path = ?')
    .get(path) as LibraryRow | undefined;
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

export function createLibrary(input: CreateLibraryInput): CreateLibraryResult {
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
  const existing = getLibraryByPath(path);
  if (existing) {
    return { success: false, error: `Library already exists for path: ${path}` };
  }

  try {
    const result = getDatabase()
      .prepare('INSERT INTO libraries (name, path, komga_library_id) VALUES (?, ?, ?)')
      .run(name.trim(), path, komgaLibraryId || null);

    const library = getLibraryById(result.lastInsertRowid as number);
    return { success: true, library: library! };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export function updateLibrary(
  id: number,
  updates: Partial<Pick<Library, 'name' | 'komgaLibraryId'>>
): CreateLibraryResult {
  const existing = getLibraryById(id);
  if (!existing) {
    return { success: false, error: 'Library not found' };
  }

  const name = updates.name?.trim() || existing.name;
  const komgaLibraryId = updates.komgaLibraryId !== undefined
    ? updates.komgaLibraryId
    : existing.komgaLibraryId;

  try {
    getDatabase()
      .prepare('UPDATE libraries SET name = ?, komga_library_id = ? WHERE id = ?')
      .run(name, komgaLibraryId, id);

    const library = getLibraryById(id);
    return { success: true, library: library! };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export function deleteLibrary(id: number): { success: boolean; error?: string } {
  const existing = getLibraryById(id);
  if (!existing) {
    return { success: false, error: 'Library not found' };
  }

  try {
    // Books will be cascade deleted due to FK constraint
    getDatabase()
      .prepare('DELETE FROM libraries WHERE id = ?')
      .run(id);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export function getLibraryBookCount(id: number): number {
  const row = getDatabase()
    .prepare('SELECT COUNT(*) as count FROM books WHERE library_id = ?')
    .get(id) as { count: number };
  return row.count;
}
