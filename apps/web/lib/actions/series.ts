'use server';

import { query } from '@/lib/db';
import type { Book } from '@/types';
import * as hardcover from '@/lib/services/metadata/hardcover';

interface SeriesInfo {
  seriesName: string;
  bookCount: number;
  authors: string | null;
  coverUrl?: string | null;
}

interface BookRow {
  id: number;
  library_id: number;
  file_path: string;
  file_hash: string;
  file_size: number | null;
  title: string | null;
  authors: string | null;
  series: string | null;
  series_name: string | null;
  series_number: number | null;
  isbn: string | null;
  publisher: string | null;
  publish_date: string | null;
  description: string | null;
  cover_url: string | null;
  extension: string | null;
  komga_book_id: string | null;
  metadata_source: string | null;
  metadata_id: string | null;
  created_at: string;
  updated_at: string;
}

function mapBookRow(row: BookRow): Book {
  return {
    id: row.id,
    libraryId: row.library_id,
    filePath: row.file_path,
    fileHash: row.file_hash,
    fileSize: row.file_size,
    title: row.title,
    authors: row.authors,
    series: row.series,
    seriesName: row.series_name,
    seriesNumber: row.series_number,
    isbn: row.isbn,
    publisher: row.publisher,
    publishDate: row.publish_date,
    description: row.description,
    coverUrl: row.cover_url,
    extension: row.extension,
    komgaBookId: row.komga_book_id,
    metadataSource: row.metadata_source,
    metadataId: row.metadata_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getSeries(search?: string): Promise<SeriesInfo[]> {
  // Get all books with series data (either primary or JSON)
  const rows = query<{ series_name: string | null; series: string | null; authors: string | null; cover_url: string | null }>(`
    SELECT series_name, series, authors, cover_url FROM books
    WHERE series_name IS NOT NULL OR series IS NOT NULL
  `);

  // Extract all unique series from both columns
  const seriesMap = new Map<string, { count: number; authors: string | null; coverUrl: string | null }>();

  for (const row of rows) {
    const seriesToAdd: string[] = [];

    // Add primary series
    if (row.series_name) {
      seriesToAdd.push(row.series_name);
    }

    // Add all series from JSON
    if (row.series) {
      try {
        const allSeries = JSON.parse(row.series) as Array<[string, number | null]>;
        for (const [name] of allSeries) {
          if (name && !seriesToAdd.includes(name)) {
            seriesToAdd.push(name);
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Update counts
    for (const name of seriesToAdd) {
      const existing = seriesMap.get(name);
      if (existing) {
        existing.count++;
        if (!existing.coverUrl && row.cover_url) {
          existing.coverUrl = row.cover_url;
        }
      } else {
        seriesMap.set(name, { count: 1, authors: row.authors, coverUrl: row.cover_url });
      }
    }
  }

  // Convert to array and filter by search
  let result = Array.from(seriesMap.entries()).map(([name, data]) => ({
    seriesName: name,
    bookCount: data.count,
    authors: data.authors,
    coverUrl: data.coverUrl,
  }));

  if (search) {
    const searchLower = search.toLowerCase();
    result = result.filter(s => s.seriesName.toLowerCase().includes(searchLower));
  }

  // Sort by name
  return result.sort((a, b) => a.seriesName.localeCompare(b.seriesName));
}

/**
 * Get books in a specific series, ordered by series number
 * Checks both primary series (series_name) and the full series JSON array
 */
export async function getBooksBySeries(seriesName: string): Promise<Book[]> {
  // Search both series_name (primary) and series JSON column
  // The JSON format is: [["Series Name", position], ...]
  const rows = query<BookRow>(`
    SELECT * FROM books
    WHERE series_name = ?
       OR (series IS NOT NULL AND series LIKE ?)
  `, [seriesName, `%"${seriesName}"%`]);

  // For books matched via JSON, extract the correct position
  const books = rows.map(row => {
    const book = mapBookRow(row);

    // If this book's primary series matches, use its position
    if (row.series_name === seriesName) {
      return book;
    }

    // Otherwise, find position from the series JSON
    if (row.series) {
      try {
        const allSeries = JSON.parse(row.series) as Array<[string, number | null]>;
        const match = allSeries.find(([name]) => name === seriesName);
        if (match) {
          return {
            ...book,
            seriesName: match[0],
            seriesNumber: match[1],
          };
        }
      } catch {
        // Ignore parse errors
      }
    }

    return book;
  });

  // Sort by series position (nulls last), then by title
  return books.sort((a, b) => {
    const posA = a.seriesNumber;
    const posB = b.seriesNumber;

    // Both have positions - sort numerically
    if (posA !== null && posB !== null) {
      return posA - posB;
    }
    // Only a has position - a comes first
    if (posA !== null) return -1;
    // Only b has position - b comes first
    if (posB !== null) return 1;
    // Neither has position - sort by title
    return (a.title || '').localeCompare(b.title || '');
  });
}

/**
 * Get series info by name
 * Counts books from both primary series and JSON series column
 */
export async function getSeriesInfo(seriesName: string): Promise<SeriesInfo | null> {
  // Count books that have this series (either as primary or in JSON)
  const countRow = query<{ book_count: number }>(`
    SELECT COUNT(*) as book_count
    FROM books
    WHERE series_name = ?
       OR (series IS NOT NULL AND series LIKE ?)
  `, [seriesName, `%"${seriesName}"%`]);

  if (!countRow[0] || countRow[0].book_count === 0) return null;

  // Get a sample author from books in this series
  const authorRow = query<{ authors: string | null }>(`
    SELECT authors FROM books
    WHERE series_name = ?
       OR (series IS NOT NULL AND series LIKE ?)
    LIMIT 1
  `, [seriesName, `%"${seriesName}"%`]);

  return {
    seriesName,
    bookCount: countRow[0].book_count,
    authors: authorRow[0]?.authors ?? null,
  };
}

/**
 * Combined series info with books from library and Hardcover
 * Note: Only include serializable data for client components
 */
export interface CombinedSeriesBook {
  // Book exists in library
  inLibrary: boolean;
  // Only include what's needed for the UI (not full Book object)
  libraryBookId?: number;
  libraryBookCoverUrl?: string | null;
  // Hardcover info (always present for complete series view)
  hardcoverId?: string;
  title: string;
  authors: string;
  position: number | null;
  coverUrl?: string;
  publishDate?: string;
  description?: string;
}

export interface CombinedSeriesInfo {
  seriesName: string;
  hardcoverSeriesId?: string;
  totalBooks: number;
  ownedBooks: number;
  books: CombinedSeriesBook[];
  authors: string;
}

/**
 * Get complete series info: local books + missing books from Hardcover
 * This shows the full series with placeholders for books not in library
 */
export async function getCompleteSeriesInfo(seriesName: string): Promise<CombinedSeriesInfo | null> {
  // Get local books first
  const localBooks = await getBooksBySeries(seriesName);

  // Try to get full series from Hardcover
  let hardcoverSeries: hardcover.SeriesInfo | null = null;
  if (hardcover.isConfigured()) {
    try {
      hardcoverSeries = await hardcover.searchSeries(seriesName);
    } catch (error) {
      console.warn('Failed to fetch series from Hardcover:', error);
    }
  }

  // If we have Hardcover data, merge it with local books
  if (hardcoverSeries) {
    // Create a map of local books by title (normalized for comparison)
    const localByTitle = new Map<string, Book>();
    const localByHardcoverId = new Map<string, Book>();

    for (const book of localBooks) {
      if (book.title) {
        localByTitle.set(book.title.toLowerCase().trim(), book);
      }
      if (book.metadataId && book.metadataSource === 'hardcover') {
        localByHardcoverId.set(book.metadataId, book);
      }
    }

    // Build combined list
    const combinedBooks: CombinedSeriesBook[] = hardcoverSeries.books.map(hcBook => {
      // Check if we have this book locally (by Hardcover ID or title match)
      const localByIdMatch = localByHardcoverId.get(hcBook.id);
      const localByTitleMatch = localByTitle.get(hcBook.title.toLowerCase().trim());
      const localBook = localByIdMatch || localByTitleMatch;

      return {
        inLibrary: !!localBook,
        libraryBookId: localBook?.id,
        libraryBookCoverUrl: localBook?.coverUrl,
        hardcoverId: hcBook.id,
        title: hcBook.title,
        authors: hcBook.authors,
        position: hcBook.position,
        coverUrl: localBook?.coverUrl || hcBook.coverUrl,
        publishDate: hcBook.publishDate,
        description: hcBook.description,
      };
    });

    // Sort by position (nulls last)
    combinedBooks.sort((a, b) => {
      if (a.position !== null && b.position !== null) return a.position - b.position;
      if (a.position !== null) return -1;
      if (b.position !== null) return 1;
      return a.title.localeCompare(b.title);
    });

    // Get primary author
    const authors = hardcoverSeries.books[0]?.authors || 'Unknown';

    return {
      seriesName: hardcoverSeries.name,
      hardcoverSeriesId: hardcoverSeries.id,
      totalBooks: hardcoverSeries.books.length,
      ownedBooks: combinedBooks.filter(b => b.inLibrary).length,
      books: combinedBooks,
      authors,
    };
  }

  // No Hardcover data - just return local books
  if (localBooks.length === 0) {
    return null;
  }

  // Get author from first book
  let authors = 'Unknown';
  const firstBook = localBooks[0];
  if (firstBook?.authors) {
    try {
      const parsed = JSON.parse(firstBook.authors);
      if (Array.isArray(parsed) && parsed.length > 0) {
        authors = parsed.join(', ');
      }
    } catch {
      authors = firstBook.authors;
    }
  }

  return {
    seriesName,
    totalBooks: localBooks.length,
    ownedBooks: localBooks.length,
    books: localBooks.map(book => ({
      inLibrary: true,
      libraryBookId: book.id,
      libraryBookCoverUrl: book.coverUrl,
      title: book.title || 'Unknown',
      authors,
      position: book.seriesNumber,
      coverUrl: book.coverUrl || undefined,
      publishDate: book.publishDate || undefined,
      description: book.description || undefined,
    })),
    authors,
  };
}
