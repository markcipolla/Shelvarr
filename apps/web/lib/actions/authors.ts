'use server';

import { revalidatePath } from 'next/cache';
import { query, execute, addWantedBook, deleteWantedBook, queryOne } from '@/lib/db';
import type { Author, AuthorWork } from '@/types';

/**
 * Normalize a name for comparison
 * - Lowercase
 * - Remove punctuation
 * - Collapse whitespace
 * - Trim
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if two author names match (handles variations like "J.K. Rowling" vs "J K Rowling")
 */
function authorNamesMatch(name1: string, name2: string): boolean {
  const norm1 = normalizeName(name1);
  const norm2 = normalizeName(name2);

  // Exact match after normalization
  if (norm1 === norm2) return true;

  // One contains the other (for cases like "Stephen King" vs "Stephen Edwin King")
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true;

  return false;
}

/**
 * Normalize a title for comparison
 * - Lowercase
 * - Remove punctuation
 * - Remove common subtitles after colons
 * - Trim whitespace
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    // Remove content after colon (subtitles)
    .replace(/:.*$/, '')
    // Remove punctuation
    .replace(/[^\w\s]/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if two titles match using fuzzy matching
 */
function titlesMatch(title1: string, title2: string): boolean {
  const norm1 = normalizeTitle(title1);
  const norm2 = normalizeTitle(title2);

  // Exact match after normalization
  if (norm1 === norm2) return true;

  // One contains the other (for cases like "The Book" vs "The Book: A Novel")
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true;

  // Check word overlap (at least 80% of words match)
  const words1 = new Set(norm1.split(' ').filter(w => w.length > 2));
  const words2 = new Set(norm2.split(' ').filter(w => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return false;

  const intersection = [...words1].filter(w => words2.has(w));
  const minSize = Math.min(words1.size, words2.size);

  return intersection.length / minSize >= 0.8;
}

interface OwnedBook {
  id: number;
  title: string;
  isbn: string | null;
}

/**
 * Find best matching owned book for a bibliography work
 */
function findMatchingBook(
  workTitle: string,
  ownedBooks: OwnedBook[]
): OwnedBook | null {
  // Try exact match first (case-insensitive)
  let match = ownedBooks.find(b => b.title.toLowerCase() === workTitle.toLowerCase());
  if (match) return match;

  // Try normalized match
  match = ownedBooks.find(b => normalizeTitle(b.title) === normalizeTitle(workTitle));
  if (match) return match;

  // Try fuzzy match
  match = ownedBooks.find(b => titlesMatch(b.title, workTitle));
  if (match) return match;

  return null;
}

interface AuthorRow {
  id: number;
  name: string;
  openlibrary_id: string | null;
  google_books_id: string | null;
  total_works: number | null;
  last_synced: string | null;
  created_at: string;
}

interface AuthorWorkRow {
  id: number;
  author_id: number;
  title: string;
  isbn: string | null;
  publish_year: number | null;
  language: string | null;
  metadata_source: string | null;
  metadata_id: string | null;
  owned: number;
  book_id: number | null;
  wanted: number;
  created_at: string;
}


function mapAuthorRow(row: AuthorRow): Author {
  return {
    id: row.id,
    name: row.name,
    openlibraryId: row.openlibrary_id,
    googleBooksId: row.google_books_id,
    totalWorks: row.total_works,
    lastSynced: row.last_synced,
    createdAt: row.created_at,
  };
}

function mapAuthorWorkRow(row: AuthorWorkRow): AuthorWork {
  return {
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    isbn: row.isbn,
    publishYear: row.publish_year,
    language: row.language,
    metadataSource: row.metadata_source,
    metadataId: row.metadata_id,
    owned: row.owned === 1,
    bookId: row.book_id,
    wanted: row.wanted === 1,
    createdAt: row.created_at,
  };
}

/**
 * Get all unique authors from books in libraries
 * Only includes authors from books that have metadata fetched
 */
export async function getAuthorsFromBooks(search?: string): Promise<Array<{
  name: string;
  bookCount: number;
  authorId: number | null;
  hasMetadata: boolean;
}>> {
  // Get unique authors from books that have metadata fetched
  const books = query<{ authors: string }>(`
    SELECT DISTINCT authors FROM books
    WHERE authors IS NOT NULL AND authors != '[]'
    AND metadata_source IS NOT NULL
  `, []);

  // Parse and count authors
  const authorCounts = new Map<string, number>();
  for (const book of books) {
    try {
      const authors: string[] = JSON.parse(book.authors);
      for (const author of authors) {
        const name = author.trim();
        if (name && (!search || name.toLowerCase().includes(search.toLowerCase()))) {
          authorCounts.set(name, (authorCounts.get(name) || 0) + 1);
        }
      }
    } catch {
      // Skip invalid JSON
    }
  }

  // Get existing author records
  const existingAuthors = query<AuthorRow>(`SELECT * FROM authors`, []);
  const authorMap = new Map(existingAuthors.map(a => [a.name.toLowerCase(), a]));

  // Build result
  const result = Array.from(authorCounts.entries()).map(([name, bookCount]) => {
    const existing = authorMap.get(name.toLowerCase());
    return {
      name,
      bookCount,
      authorId: existing?.id || null,
      hasMetadata: existing?.last_synced !== null,
    };
  });

  // Sort alphabetically by author name
  result.sort((a, b) => a.name.localeCompare(b.name));

  return result;
}

/**
 * Get or create an author record
 */
export async function getOrCreateAuthor(name: string): Promise<Author> {
  const existing = query<AuthorRow>(
    `SELECT * FROM authors WHERE LOWER(name) = LOWER(?)`,
    [name]
  );

  if (existing.length > 0) {
    return mapAuthorRow(existing[0]!);
  }

  const result = execute(
    `INSERT INTO authors (name) VALUES (?)`,
    [name]
  );

  return {
    id: result.lastInsertRowid as number,
    name,
    openlibraryId: null,
    googleBooksId: null,
    totalWorks: null,
    lastSynced: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Get author by ID
 */
export async function getAuthor(id: number): Promise<Author | null> {
  const rows = query<AuthorRow>(`SELECT * FROM authors WHERE id = ?`, [id]);
  return rows.length > 0 ? mapAuthorRow(rows[0]!) : null;
}

/**
 * Get author by name
 */
export async function getAuthorByName(name: string): Promise<Author | null> {
  const rows = query<AuthorRow>(
    `SELECT * FROM authors WHERE LOWER(name) = LOWER(?)`,
    [name]
  );
  return rows.length > 0 ? mapAuthorRow(rows[0]!) : null;
}

/**
 * Get author's works (bibliography)
 */
export async function getAuthorWorks(authorId: number): Promise<AuthorWork[]> {
  const rows = query<AuthorWorkRow>(
    `SELECT * FROM author_works WHERE author_id = ? ORDER BY publish_year ASC NULLS LAST, title`,
    [authorId]
  );
  return rows.map(mapAuthorWorkRow);
}

/**
 * Get books owned by this author from libraries
 */
export async function getOwnedBooksByAuthor(authorName: string): Promise<Array<{
  id: number;
  title: string;
  isbn: string | null;
}>> {
  const books = query<{ id: number; title: string; isbn: string | null; authors: string }>(`
    SELECT id, title, isbn, authors FROM books
    WHERE authors IS NOT NULL
  `, []);

  const owned: Array<{ id: number; title: string; isbn: string | null }> = [];

  for (const book of books) {
    try {
      const authors: string[] = JSON.parse(book.authors);
      // Use fuzzy author name matching to handle variations
      if (authors.some(a => authorNamesMatch(a, authorName))) {
        owned.push({
          id: book.id,
          title: book.title || 'Unknown',
          isbn: book.isbn,
        });
      }
    } catch {
      // Skip invalid JSON
    }
  }

  return owned;
}

/**
 * Fetch author metadata from OpenLibrary
 */
export async function fetchAuthorMetadata(authorId: number): Promise<{ success: boolean; error?: string; worksFound?: number }> {
  const author = await getAuthor(authorId);
  if (!author) {
    return { success: false, error: 'Author not found' };
  }

  try {
    // Search for author on OpenLibrary
    const searchUrl = `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(author.name)}&limit=1`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (!searchData.docs || searchData.docs.length === 0) {
      return { success: false, error: 'Author not found on OpenLibrary' };
    }

    const olAuthor = searchData.docs[0];
    const olAuthorKey = olAuthor.key; // e.g., "OL123A"

    // Update author with OpenLibrary ID
    execute(
      `UPDATE authors SET openlibrary_id = ?, total_works = ? WHERE id = ?`,
      [olAuthorKey, olAuthor.work_count || 0, authorId]
    );

    // Use search API to get works with publication years
    // The works endpoint doesn't include dates, but search does
    const worksSearchUrl = `https://openlibrary.org/search.json?author=${encodeURIComponent(author.name)}&limit=500&fields=title,key,first_publish_year,language`;
    const worksSearchRes = await fetch(worksSearchUrl);
    const worksData = await worksSearchRes.json();

    if (!worksData.docs || worksData.docs.length === 0) {
      execute(`UPDATE authors SET last_synced = ? WHERE id = ?`, [new Date().toISOString(), authorId]);
      return { success: true, worksFound: 0 };
    }

    // Get owned books for matching
    const ownedBooks = await getOwnedBooksByAuthor(author.name);

    // Clear existing works for this author
    execute(`DELETE FROM author_works WHERE author_id = ?`, [authorId]);

    // Language code to name mapping
    const languageNames: Record<string, string> = {
      eng: 'English', en: 'English', fre: 'French', fr: 'French',
      ger: 'German', de: 'German', spa: 'Spanish', es: 'Spanish',
      ita: 'Italian', it: 'Italian', por: 'Portuguese', pt: 'Portuguese',
      rus: 'Russian', ru: 'Russian', jpn: 'Japanese', ja: 'Japanese',
      chi: 'Chinese', zh: 'Chinese', ara: 'Arabic', ar: 'Arabic',
      hin: 'Hindi', hi: 'Hindi', kor: 'Korean', ko: 'Korean',
      dut: 'Dutch', nl: 'Dutch', pol: 'Polish', pl: 'Polish',
      swe: 'Swedish', sv: 'Swedish', dan: 'Danish', da: 'Danish',
      nor: 'Norwegian', no: 'Norwegian', fin: 'Finnish', fi: 'Finnish',
      gre: 'Greek', el: 'Greek', heb: 'Hebrew', he: 'Hebrew',
      tur: 'Turkish', tr: 'Turkish', cze: 'Czech', cs: 'Czech',
      hun: 'Hungarian', hu: 'Hungarian', rum: 'Romanian', ro: 'Romanian',
    };

    // Insert works
    let worksInserted = 0;
    const seenTitles = new Set<string>();

    for (const work of worksData.docs) {
      const title = work.title || 'Unknown';
      const normalizedTitle = title.toLowerCase().trim();

      // Skip duplicates (search can return multiple editions)
      if (seenTitles.has(normalizedTitle)) continue;
      seenTitles.add(normalizedTitle);

      const workKey = work.key?.replace('/works/', '') || null;
      const publishYear = work.first_publish_year || null;

      // Get language - search API returns array of language codes
      let language: string | null = null;
      if (work.language && Array.isArray(work.language) && work.language.length > 0) {
        const langCode = work.language[0];
        language = languageNames[langCode] || langCode?.toUpperCase() || null;
      }

      // Find matching owned book using fuzzy matching
      const matchedBook = findMatchingBook(title, ownedBooks);
      const isOwned = !!matchedBook;

      execute(`
        INSERT INTO author_works (author_id, title, publish_year, language, metadata_source, metadata_id, owned, book_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [authorId, title, publishYear, language, 'openlibrary', workKey, isOwned ? 1 : 0, matchedBook?.id || null]);

      worksInserted++;
    }

    // Update last synced
    execute(`UPDATE authors SET last_synced = ?, total_works = ? WHERE id = ?`, [
      new Date().toISOString(),
      worksInserted,
      authorId,
    ]);

    return { success: true, worksFound: worksInserted };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch metadata' };
  }
}

/**
 * Refresh ownership status for author works
 */
export async function refreshAuthorOwnership(authorId: number): Promise<void> {
  const author = await getAuthor(authorId);
  if (!author) return;

  const ownedBooks = await getOwnedBooksByAuthor(author.name);
  const works = await getAuthorWorks(authorId);

  for (const work of works) {
    // Use fuzzy matching to find matching owned book
    const matchedBook = findMatchingBook(work.title, ownedBooks);
    const isOwned = !!matchedBook;

    if (work.owned !== isOwned || work.bookId !== (matchedBook?.id || null)) {
      execute(`UPDATE author_works SET owned = ?, book_id = ? WHERE id = ?`, [
        isOwned ? 1 : 0,
        matchedBook?.id || null,
        work.id,
      ]);
    }
  }
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
    // Add to wanted_books table
    addWantedBook({
      title: work.title,
      author: authorName,
      isbn: work.isbn || undefined,
    });
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
