'use server';

import { revalidatePath } from 'next/cache';
import { query, queryOne, execute, addWantedBook, deleteWantedBook, isBookWanted } from '@/lib/db';

// The author data layer lives in the services package so the background queue
// handlers can share it (they cannot resolve the web app's `@/` alias). The
// wrappers below keep the existing `@/lib/actions/authors` import surface
// intact.
//
// They are written out rather than re-exported with `export { … } from`,
// because a `'use server'` module may only export async functions: Next cannot
// prove a re-exported binding is one, and rejects the whole module — which
// silently strips *every* export and breaks the production build.
import * as authorsService from '@shelvarr/services/authors/index';

export async function getAuthorsFromBooks(
  ...args: Parameters<typeof authorsService.getAuthorsFromBooks>
): ReturnType<typeof authorsService.getAuthorsFromBooks> {
  return authorsService.getAuthorsFromBooks(...args);
}

export async function getOrCreateAuthor(
  ...args: Parameters<typeof authorsService.getOrCreateAuthor>
): ReturnType<typeof authorsService.getOrCreateAuthor> {
  return authorsService.getOrCreateAuthor(...args);
}

export async function getAuthor(
  ...args: Parameters<typeof authorsService.getAuthor>
): ReturnType<typeof authorsService.getAuthor> {
  return authorsService.getAuthor(...args);
}

export async function getAuthorByName(
  ...args: Parameters<typeof authorsService.getAuthorByName>
): ReturnType<typeof authorsService.getAuthorByName> {
  return authorsService.getAuthorByName(...args);
}

export async function getAuthorWorks(
  ...args: Parameters<typeof authorsService.getAuthorWorks>
): ReturnType<typeof authorsService.getAuthorWorks> {
  return authorsService.getAuthorWorks(...args);
}

export async function getOwnedBooksByAuthor(
  ...args: Parameters<typeof authorsService.getOwnedBooksByAuthor>
): ReturnType<typeof authorsService.getOwnedBooksByAuthor> {
  return authorsService.getOwnedBooksByAuthor(...args);
}

export async function fetchAuthorMetadata(
  ...args: Parameters<typeof authorsService.fetchAuthorMetadata>
): ReturnType<typeof authorsService.fetchAuthorMetadata> {
  return authorsService.fetchAuthorMetadata(...args);
}

export async function refreshAuthorOwnership(
  ...args: Parameters<typeof authorsService.refreshAuthorOwnership>
): ReturnType<typeof authorsService.refreshAuthorOwnership> {
  return authorsService.refreshAuthorOwnership(...args);
}

interface AuthorRow {
  id: number;
  name: string;
}

interface AuthorWorkRow {
  id: number;
  author_id: number;
  title: string;
  isbn: string | null;
  wanted: number;
}

/**
 * Toggle wanted status for a work
 * Also adds/removes from wanted_books table
 */
export async function toggleWorkWanted(workId: number): Promise<{ success: boolean }> {
  const rows = query<AuthorWorkRow>(`SELECT * FROM author_works WHERE id = ?`, [workId]);
  if (rows.length === 0) {
    return { success: false };
  }

  const work = rows[0]!;
  const newWanted = work.wanted === 1 ? 0 : 1;

  // Update author_works table
  execute(`UPDATE author_works SET wanted = ? WHERE id = ?`, [newWanted, workId]);

  // Get author name for the wanted book
  const author = queryOne<AuthorRow>(`SELECT * FROM authors WHERE id = ?`, [work.author_id]);
  const authorName = author?.name || 'Unknown';

  if (newWanted === 1) {
    // Add to wanted_books table (skip if an equivalent row already exists,
    // otherwise the bibliography toggle creates duplicate wanted entries that
    // can't all be cleared from the wanted list).
    if (!isBookWanted(undefined, work.isbn || undefined, work.title)) {
      addWantedBook({
        title: work.title,
        author: authorName,
        isbn: work.isbn || undefined,
      });
    }
  } else {
    // Remove from wanted_books table (find by title and author)
    const wantedBook = queryOne<{ id: number }>(
      `SELECT id FROM wanted_books WHERE title = ? AND author = ?`,
      [work.title, authorName]
    );
    if (wantedBook) {
      deleteWantedBook(wantedBook.id);
    }
  }

  // Revalidate wanted page
  revalidatePath('/wanted');

  return { success: true };
}
