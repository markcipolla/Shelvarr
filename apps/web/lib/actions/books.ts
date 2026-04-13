'use server';

import { revalidatePath } from 'next/cache';
import {
  getBooks as getBooksFromDb,
  getBookById,
  updateBook as updateBookInDb,
  deleteBook as deleteBookFromDb,
} from '@/lib/services/scanner';
import * as metadataService from '@/lib/services/metadata';
import { getOrCreateAuthor, fetchAuthorMetadata, getAuthorByName } from '@/lib/actions/authors';
import { enqueueTask } from '@/lib/services/queue';

export interface GetBooksParams {
  page?: number;
  pageSize?: number;
  libraryId?: number;
  search?: string;
  unmatchedOnly?: boolean;
  matchedOnly?: boolean;
}

export async function getBooks(params: GetBooksParams = {}) {
  return getBooksFromDb({
    page: params.page || 1,
    pageSize: params.pageSize || 20,
    libraryId: params.libraryId,
    search: params.search,
    unmatchedOnly: params.unmatchedOnly,
    matchedOnly: params.matchedOnly,
  });
}

export async function getBook(id: number) {
  return getBookById(id);
}

export async function updateBook(id: number, data: {
  title?: string;
  authors?: string;
  series?: string | null;
  seriesName?: string | null;
  seriesNumber?: number | null;
  isbn?: string | null;
  publisher?: string | null;
  publishDate?: string | null;
  description?: string | null;
  coverUrl?: string | null;
}) {
  const result = await updateBookInDb(id, data);
  if (result.success) {
    revalidatePath('/books');
    revalidatePath(`/books/${id}`);
  }
  return result;
}

export async function deleteBook(id: number) {
  const result = await deleteBookFromDb(id);
  if (result.success) {
    revalidatePath('/books');
  }
  return result;
}

/**
 * Apply metadata to a book and process authors
 */
async function applyMetadataToBook(bookId: number, metadata: metadataService.BookMetadata) {
  // Extract primary series (first in the array) for backwards compatibility
  const primarySeries = metadata.series?.[0];

  const result = await updateBookInDb(bookId, {
    title: metadata.title,
    authors: JSON.stringify(metadata.authors.split(', ')),
    publisher: metadata.publisher,
    publishDate: metadata.publishDate,
    description: metadata.description,
    isbn: metadata.isbn,
    coverUrl: metadata.coverUrl,
    series: metadata.series ? JSON.stringify(metadata.series) : null,
    seriesName: primarySeries?.[0] ?? null,
    seriesNumber: primarySeries?.[1] ?? null,
    metadataSource: metadata.source,
    metadataId: metadata.sourceId,
  });

  if (result.success) {
    revalidatePath('/books');
    revalidatePath(`/books/${bookId}`);

    // Process authors in background
    processAuthors(metadata.authors).catch(() => {});

    // Organize file (rename/move based on new metadata)
    enqueueTask('organize', {
      bookId,
      bookTitle: metadata.title,
    });
  }

  return result;
}

/**
 * Create author records and fetch bibliography for new authors
 */
async function processAuthors(authorsString: string): Promise<void> {
  for (const name of authorsString.split(', ').filter(a => a.trim())) {
    const existing = await getAuthorByName(name);
    if (!existing?.lastSynced) {
      const author = await getOrCreateAuthor(name);
      fetchAuthorMetadata(author.id).catch(() => {});
    }
  }
}

/**
 * Score results for relevance to search query
 */
function scoreResult(result: metadataService.BookMetadata, query: string): number {
  let score = 0;
  const q = query.toLowerCase();
  const t = result.title.toLowerCase();

  // Title match scoring
  if (t === q) score += 50;
  else if (t.startsWith(q) || q.startsWith(t)) score += 40;
  else if (t.includes(q) || q.includes(t)) score += 30;
  else {
    const qWords = q.split(/\s+/).filter(w => w.length > 2);
    const tWords = t.split(/\s+/).filter(w => w.length > 2);
    const matches = qWords.filter(qw => tWords.some(tw => tw.includes(qw) || qw.includes(tw)));
    if (qWords.length) score += Math.min(25, (matches.length / qWords.length) * 25);
  }

  // Completeness scoring
  if (result.coverUrl) score += 10;
  if (result.description?.length && result.description.length > 50) score += 10;
  if (result.series?.length) score += 8;
  if (result.authors && result.authors !== 'Unknown') score += 5;
  if (result.publisher) score += 2;
  if (result.publishDate) score += 2;
  if (result.isbn) score += 2;

  return score;
}

/**
 * Search for metadata - returns results sorted by relevance
 */
export async function searchMetadata(query: string): Promise<{
  results?: Awaited<ReturnType<typeof metadataService.searchBooks>>;
  error?: string
}> {
  try {
    const results = await metadataService.searchBooks(query, { maxResults: 15 });

    // Sort by relevance
    const sorted = results
      .map(r => ({ result: r, score: scoreResult(r, query) }))
      .sort((a, b) => b.score - a.score)
      .map(sr => sr.result);

    return { results: sorted };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search failed';

    // Handle rate limiting gracefully
    if (message.includes('429')) {
      return { error: 'Rate limited by Hardcover API. Please wait a moment and try again.' };
    }

    return { error: message };
  }
}

/**
 * Apply metadata from a selected search result to a book
 */
export async function applyMetadata(bookId: number, source: string, sourceId: string) {
  // Fetch full details (should already be complete, but ensures freshness)
  const metadata = await metadataService.getBookBySourceId(source, sourceId);
  if (!metadata) {
    return { success: false, error: 'Metadata not found' };
  }
  return applyMetadataToBook(bookId, metadata);
}

