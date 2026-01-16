/**
 * File Organization Service
 * Handles file renaming, duplicate detection, and series grouping
 */

import { createHash } from 'crypto';
import { readFileSync, renameSync, mkdirSync, existsSync } from 'fs';
import { dirname, basename, extname, join } from 'path';
import { query, queryOne } from '../../db/index.js';
import type { Book } from '../../types/index.js';

// Default naming template (Komga-friendly: series first, zero-padded number)
// Year and ISBN are included but will be cleaned up if empty
const DEFAULT_TEMPLATE = '{series}/Book {number} - {title} - {author} ({year}) [{isbn}]';

/**
 * Template variables that can be used in naming patterns
 *
 * Available variables:
 * - {author} - First author name
 * - {title} - Book title
 * - {series} - Series name (empty if standalone)
 * - {number} or {series_number} - Zero-padded series number (e.g., "01", "02")
 * - {year} - Publication year
 * - {isbn} - ISBN
 */
interface TemplateVars {
  author: string;
  title: string;
  series: string;
  number: string;  // Zero-padded series number
  series_number: string;  // Alias for number
  year: string;
  isbn: string;
  ext: string;
}

/**
 * Result of a reorganization preview
 */
export interface ReorgPreviewItem {
  bookId: number;
  currentPath: string;
  newPath: string;
  willMove: boolean;
  error?: string;
}

/**
 * Result of applying reorganization
 */
export interface ReorgResult {
  success: boolean;
  moved: number;
  errors: string[];
  details: Array<{ bookId: number; oldPath: string; newPath: string; success: boolean; error?: string }>;
}

/**
 * Duplicate candidate
 */
export interface DuplicateGroup {
  hash: string;
  books: Book[];
  similarity: number;
}

/**
 * Series group
 */
export interface SeriesGroup {
  name: string;
  books: Book[];
  totalInSeries?: number;
}

/**
 * Sanitize a string for use in file paths
 * Removes or replaces invalid characters
 */
export function sanitizePathComponent(str: string): string {
  if (!str) return 'Unknown';

  return str
    // Replace characters invalid in file paths
    .replace(/[<>:"/\\|?*]/g, '')
    // Replace multiple spaces with single space
    .replace(/\s+/g, ' ')
    // Remove leading/trailing spaces and dots
    .trim()
    .replace(/^\.+|\.+$/g, '')
    // Limit length
    .slice(0, 200)
    || 'Unknown';
}

/**
 * Parse authors from JSON string or plain string
 */
function parseAuthors(authorsJson: string | null): string {
  if (!authorsJson) return 'Unknown Author';

  try {
    const authors = JSON.parse(authorsJson);
    if (Array.isArray(authors) && authors.length > 0) {
      return authors[0] as string;
    }
    return 'Unknown Author';
  } catch {
    return authorsJson || 'Unknown Author';
  }
}

/**
 * Extract year from publish date
 */
function extractYear(publishDate: string | null): string {
  if (!publishDate) return '';

  // Try to extract 4-digit year
  const match = publishDate.match(/(\d{4})/);
  return match?.[1] ?? '';
}

/**
 * Build template variables from a book
 */
function buildTemplateVars(book: Book): TemplateVars {
  const ext = extname(book.filePath);
  // Zero-pad series number to 3 digits (handles series up to 999 books)
  const paddedNumber = book.seriesNumber ? String(book.seriesNumber).padStart(3, '0') : '';

  return {
    author: sanitizePathComponent(parseAuthors(book.authors)),
    title: sanitizePathComponent(book.title || basename(book.filePath, ext)),
    series: sanitizePathComponent(book.seriesName || ''),
    number: paddedNumber,
    series_number: paddedNumber,  // Alias
    year: extractYear(book.publishDate),
    isbn: book.isbn || '',
    ext: ext,
  };
}

/**
 * Apply a naming template to generate a new path
 */
export function applyTemplate(template: string, vars: TemplateVars): string {
  let result = template;

  // Replace all template variables
  result = result.replace(/\{author\}/g, vars.author);
  result = result.replace(/\{title\}/g, vars.title);
  result = result.replace(/\{series\}/g, vars.series);
  result = result.replace(/\{number\}/g, vars.number);
  result = result.replace(/\{series_number\}/g, vars.series_number);
  result = result.replace(/\{year\}/g, vars.year);
  result = result.replace(/\{isbn\}/g, vars.isbn);

  // Remove empty path components (e.g., if series is empty, "{series}/" becomes nothing)
  result = result
    .split('/')
    .filter(part => part.trim() !== '')
    .join('/');

  // Handle empty parentheses/brackets from empty variables
  result = result
    .replace(/\s*\(\s*\)/g, '')
    .replace(/\s*\[\s*\]/g, '')
    .replace(/\s*#\s*$/g, '')
    .replace(/\s+-\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Add extension
  result += vars.ext;

  return result;
}

/**
 * Generate a new path for a book based on template
 */
export function generateNewPath(book: Book, libraryPath: string, template: string = DEFAULT_TEMPLATE): string {
  const vars = buildTemplateVars(book);
  const relativePath = applyTemplate(template, vars);
  return join(libraryPath, relativePath);
}

/**
 * Preview reorganization for a library
 */
export async function previewReorganization(
  libraryId: number,
  template: string = DEFAULT_TEMPLATE
): Promise<ReorgPreviewItem[]> {
  // Get library path
  const library = await queryOne<{ path: string }>('SELECT path FROM libraries WHERE id = ?', [libraryId]);
  if (!library) {
    throw new Error('Library not found');
  }

  // Get all books in library
  const books = await query<Book>('SELECT * FROM books WHERE library_id = ?', [libraryId]);

  const preview: ReorgPreviewItem[] = [];

  for (const book of books) {
    try {
      const newPath = generateNewPath(book, library.path, template);
      const willMove = newPath !== book.filePath;

      preview.push({
        bookId: book.id,
        currentPath: book.filePath,
        newPath,
        willMove,
      });
    } catch (error) {
      preview.push({
        bookId: book.id,
        currentPath: book.filePath,
        newPath: book.filePath,
        willMove: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return preview;
}

/**
 * Apply reorganization to a library
 */
export async function applyReorganization(
  libraryId: number,
  template: string = DEFAULT_TEMPLATE,
  dryRun: boolean = false
): Promise<ReorgResult> {
  const preview = await previewReorganization(libraryId, template);

  const result: ReorgResult = {
    success: true,
    moved: 0,
    errors: [],
    details: [],
  };

  for (const item of preview) {
    if (!item.willMove) {
      continue;
    }

    if (item.error) {
      result.errors.push(`Book ${item.bookId}: ${item.error}`);
      result.details.push({
        bookId: item.bookId,
        oldPath: item.currentPath,
        newPath: item.newPath,
        success: false,
        error: item.error,
      });
      continue;
    }

    try {
      if (!dryRun) {
        // Create target directory if it doesn't exist
        const targetDir = dirname(item.newPath);
        if (!existsSync(targetDir)) {
          mkdirSync(targetDir, { recursive: true });
        }

        // Check if target already exists
        if (existsSync(item.newPath) && item.newPath !== item.currentPath) {
          throw new Error(`Target file already exists: ${item.newPath}`);
        }

        // Move the file
        renameSync(item.currentPath, item.newPath);

        // Update database
        await query(
          'UPDATE books SET file_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [item.newPath, item.bookId]
        );
      }

      result.moved++;
      result.details.push({
        bookId: item.bookId,
        oldPath: item.currentPath,
        newPath: item.newPath,
        success: true,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Book ${item.bookId}: ${errorMsg}`);
      result.details.push({
        bookId: item.bookId,
        oldPath: item.currentPath,
        newPath: item.newPath,
        success: false,
        error: errorMsg,
      });
      result.success = false;
    }
  }

  return result;
}

/**
 * Calculate MD5 hash of a file
 */
export function calculateFileHash(filePath: string): string {
  try {
    const content = readFileSync(filePath);
    return createHash('md5').update(content).digest('hex');
  } catch {
    return '';
  }
}

/**
 * Update file hash for a book
 */
export async function updateBookHash(bookId: number): Promise<string | null> {
  const book = await queryOne<Book>('SELECT file_path FROM books WHERE id = ?', [bookId]);
  if (!book) return null;

  const hash = calculateFileHash(book.filePath);
  if (hash) {
    await query('UPDATE books SET file_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [hash, bookId]);
  }

  return hash;
}

/**
 * Find duplicate books by file hash
 */
export async function findDuplicatesByHash(libraryId?: number): Promise<DuplicateGroup[]> {
  // First, ensure all books have hashes
  let booksToHash: Book[];
  if (libraryId) {
    booksToHash = await query<Book>(
      'SELECT id, file_path FROM books WHERE library_id = ? AND (file_hash IS NULL OR file_hash = \'\')',
      [libraryId]
    );
  } else {
    booksToHash = await query<Book>(
      'SELECT id, file_path FROM books WHERE file_hash IS NULL OR file_hash = \'\''
    );
  }

  // Calculate missing hashes
  for (const book of booksToHash) {
    await updateBookHash(book.id);
  }

  // Find duplicates
  let duplicateHashes: Array<{ file_hash: string; count: string }>;
  if (libraryId) {
    duplicateHashes = await query<{ file_hash: string; count: string }>(
      `SELECT file_hash, COUNT(*) as count
       FROM books
       WHERE library_id = ? AND file_hash IS NOT NULL AND file_hash != ''
       GROUP BY file_hash
       HAVING COUNT(*) > 1`,
      [libraryId]
    );
  } else {
    duplicateHashes = await query<{ file_hash: string; count: string }>(
      `SELECT file_hash, COUNT(*) as count
       FROM books
       WHERE file_hash IS NOT NULL AND file_hash != ''
       GROUP BY file_hash
       HAVING COUNT(*) > 1`
    );
  }

  const groups: DuplicateGroup[] = [];

  for (const { file_hash } of duplicateHashes) {
    const books = await query<Book>(
      'SELECT * FROM books WHERE file_hash = ?',
      [file_hash]
    );

    groups.push({
      hash: file_hash,
      books,
      similarity: 1.0, // Exact match
    });
  }

  return groups;
}

/**
 * Calculate similarity between two books based on metadata
 */
export function calculateMetadataSimilarity(book1: Book, book2: Book): number {
  let score = 0;
  let totalWeight = 0;

  // Title similarity (weight: 3)
  if (book1.title && book2.title) {
    const titleSim = stringSimilarity(book1.title.toLowerCase(), book2.title.toLowerCase());
    score += titleSim * 3;
    totalWeight += 3;
  }

  // Author similarity (weight: 2)
  const author1 = parseAuthors(book1.authors).toLowerCase();
  const author2 = parseAuthors(book2.authors).toLowerCase();
  if (author1 !== 'unknown author' && author2 !== 'unknown author') {
    const authorSim = stringSimilarity(author1, author2);
    score += authorSim * 2;
    totalWeight += 2;
  }

  // ISBN match (weight: 5 - exact match only)
  if (book1.isbn && book2.isbn && book1.isbn === book2.isbn) {
    score += 5;
    totalWeight += 5;
  } else if (book1.isbn || book2.isbn) {
    totalWeight += 5;
  }

  // File size similarity (weight: 1)
  if (book1.fileSize && book2.fileSize) {
    const sizeDiff = Math.abs(book1.fileSize - book2.fileSize);
    const maxSize = Math.max(book1.fileSize, book2.fileSize);
    const sizeSim = 1 - (sizeDiff / maxSize);
    score += sizeSim * 1;
    totalWeight += 1;
  }

  return totalWeight > 0 ? score / totalWeight : 0;
}

/**
 * Simple string similarity (Dice coefficient)
 */
function stringSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (str1.length < 2 || str2.length < 2) return 0;

  const bigrams1 = new Set<string>();
  for (let i = 0; i < str1.length - 1; i++) {
    bigrams1.add(str1.slice(i, i + 2));
  }

  let matches = 0;
  for (let i = 0; i < str2.length - 1; i++) {
    if (bigrams1.has(str2.slice(i, i + 2))) {
      matches++;
    }
  }

  return (2 * matches) / (str1.length - 1 + str2.length - 1);
}

/**
 * Find potential duplicates by metadata similarity
 */
export async function findDuplicatesBySimilarity(
  libraryId?: number,
  threshold: number = 0.8
): Promise<DuplicateGroup[]> {
  let books: Book[];
  if (libraryId) {
    books = await query<Book>('SELECT * FROM books WHERE library_id = ?', [libraryId]);
  } else {
    books = await query<Book>('SELECT * FROM books');
  }

  const groups: DuplicateGroup[] = [];
  const processed = new Set<number>();

  for (let i = 0; i < books.length; i++) {
    const book1 = books[i];
    if (!book1 || processed.has(book1.id)) continue;

    const similar: Book[] = [book1];
    let maxSimilarity = 0;

    for (let j = i + 1; j < books.length; j++) {
      const book2 = books[j];
      if (!book2 || processed.has(book2.id)) continue;

      const similarity = calculateMetadataSimilarity(book1, book2);
      if (similarity >= threshold) {
        similar.push(book2);
        processed.add(book2.id);
        maxSimilarity = Math.max(maxSimilarity, similarity);
      }
    }

    if (similar.length > 1) {
      processed.add(book1.id);
      groups.push({
        hash: '',
        books: similar,
        similarity: maxSimilarity,
      });
    }
  }

  return groups;
}

/**
 * Detect series from books based on series_name field
 */
export async function detectSeries(libraryId?: number): Promise<SeriesGroup[]> {
  let seriesQuery: string;
  let params: unknown[];

  if (libraryId) {
    seriesQuery = `
      SELECT series_name, COUNT(*) as book_count
      FROM books
      WHERE library_id = ? AND series_name IS NOT NULL AND series_name != ''
      GROUP BY series_name
      ORDER BY series_name
    `;
    params = [libraryId];
  } else {
    seriesQuery = `
      SELECT series_name, COUNT(*) as book_count
      FROM books
      WHERE series_name IS NOT NULL AND series_name != ''
      GROUP BY series_name
      ORDER BY series_name
    `;
    params = [];
  }

  const seriesNames = await query<{ series_name: string; book_count: string }>(seriesQuery, params);

  const groups: SeriesGroup[] = [];

  for (const { series_name } of seriesNames) {
    let books: Book[];
    if (libraryId) {
      books = await query<Book>(
        'SELECT * FROM books WHERE library_id = ? AND series_name = ? ORDER BY series_number',
        [libraryId, series_name]
      );
    } else {
      books = await query<Book>(
        'SELECT * FROM books WHERE series_name = ? ORDER BY series_number',
        [series_name]
      );
    }

    groups.push({
      name: series_name,
      books,
    });
  }

  return groups;
}

/**
 * Get all duplicates (both hash and similarity based)
 */
export async function getAllDuplicates(
  libraryId?: number,
  similarityThreshold: number = 0.8
): Promise<{ hashDuplicates: DuplicateGroup[]; similarityDuplicates: DuplicateGroup[] }> {
  const [hashDuplicates, similarityDuplicates] = await Promise.all([
    findDuplicatesByHash(libraryId),
    findDuplicatesBySimilarity(libraryId, similarityThreshold),
  ]);

  return { hashDuplicates, similarityDuplicates };
}

export default {
  sanitizePathComponent,
  applyTemplate,
  generateNewPath,
  previewReorganization,
  applyReorganization,
  calculateFileHash,
  updateBookHash,
  findDuplicatesByHash,
  findDuplicatesBySimilarity,
  calculateMetadataSimilarity,
  detectSeries,
  getAllDuplicates,
};
