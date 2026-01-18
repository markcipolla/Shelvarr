'use server';

import { query } from '@/lib/db';
import type { Book } from '@/types';

interface SeriesInfo {
  seriesName: string;
  bookCount: number;
  authors: string | null;
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
    metadataSource: row.metadata_source,
    metadataId: row.metadata_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getSeries(search?: string): Promise<SeriesInfo[]> {
  // Get all books with series data (either primary or JSON)
  const rows = query<{ series_name: string | null; series: string | null; authors: string | null }>(`
    SELECT series_name, series, authors FROM books
    WHERE series_name IS NOT NULL OR series IS NOT NULL
  `);

  // Extract all unique series from both columns
  const seriesMap = new Map<string, { count: number; authors: string | null }>();

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
      } else {
        seriesMap.set(name, { count: 1, authors: row.authors });
      }
    }
  }

  // Convert to array and filter by search
  let result = Array.from(seriesMap.entries()).map(([name, data]) => ({
    seriesName: name,
    bookCount: data.count,
    authors: data.authors,
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
