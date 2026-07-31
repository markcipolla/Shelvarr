'use server';

import { revalidatePath } from 'next/cache';
import { query, queryOne, execute, addWantedBook, deleteWantedBook, isBookWanted } from '@/lib/db';

// The author data layer lives in the services package so the background queue
// handlers can share it (they cannot resolve the web app's `@/` alias). These
// re-exports keep the existing `@/lib/actions/authors` import surface intact.
export {
  getAuthorsFromBooks,
  getOrCreateAuthor,
  getAuthor,
  getAuthorByName,
  getAuthorWorks,
  getOwnedBooksByAuthor,
  fetchAuthorMetadata,
  refreshAuthorOwnership,
} from '@shelvarr/services/authors/index';

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
