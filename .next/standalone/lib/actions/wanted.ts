'use server';

import { revalidatePath } from 'next/cache';
import {
  getWantedBooks as getWantedBooksFromDb,
  getWantedBookById,
  addWantedBook as addWantedBookToDb,
  updateWantedBook as updateWantedBookInDb,
  deleteWantedBook as deleteWantedBookFromDb,
  isBookWanted as isBookWantedInDb,
  type WantedBook,
} from '@/lib/db';
import * as metadataService from '@/lib/services/metadata';

// Import WantedBook type directly from '@/lib/db' in consuming components

/**
 * Get all wanted books
 */
export async function getWantedBooks(status?: string): Promise<WantedBook[]> {
  return getWantedBooksFromDb(status);
}

/**
 * Get a single wanted book by ID
 */
export async function getWantedBook(id: number): Promise<WantedBook | null> {
  return getWantedBookById(id);
}

/**
 * Add a book to the wanted list
 */
export async function addToWanted(data: {
  hardcoverId?: string;
  title: string;
  author?: string;
  isbn?: string;
  coverUrl?: string;
  description?: string;
  priority?: number;
  notes?: string;
}): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    // Check if already wanted
    if (isBookWantedInDb(data.hardcoverId, data.isbn, data.title)) {
      return { success: false, error: 'Book is already on wanted list' };
    }

    const book = addWantedBookToDb({
      hardcover_id: data.hardcoverId,
      title: data.title,
      author: data.author,
      isbn: data.isbn,
      cover_url: data.coverUrl,
      description: data.description,
      priority: data.priority || 0,
      notes: data.notes,
    });

    if (book) {
      revalidatePath('/wanted');
      return { success: true, id: book.id };
    }

    return { success: false, error: 'Failed to add book' };
  } catch (error) {
    console.error('Error adding to wanted:', error);
    return { success: false, error: 'Failed to add book to wanted list' };
  }
}

/**
 * Remove a book from the wanted list
 */
export async function removeFromWanted(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    const result = deleteWantedBookFromDb(id);
    if (result) {
      revalidatePath('/wanted');
      return { success: true };
    }
    return { success: false, error: 'Book not found' };
  } catch (error) {
    console.error('Error removing from wanted:', error);
    return { success: false, error: 'Failed to remove book' };
  }
}

/**
 * Update wanted book status
 */
export async function updateWantedStatus(
  id: number,
  status: 'wanted' | 'searching' | 'found' | 'acquired'
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = updateWantedBookInDb(id, { status });
    if (result) {
      revalidatePath('/wanted');
      revalidatePath(`/wanted/${id}`);
      return { success: true };
    }
    return { success: false, error: 'Book not found' };
  } catch (error) {
    console.error('Error updating wanted status:', error);
    return { success: false, error: 'Failed to update status' };
  }
}

/**
 * Update wanted book priority
 */
export async function updateWantedPriority(
  id: number,
  priority: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = updateWantedBookInDb(id, { priority });
    if (result) {
      revalidatePath('/wanted');
      return { success: true };
    }
    return { success: false, error: 'Book not found' };
  } catch (error) {
    console.error('Error updating wanted priority:', error);
    return { success: false, error: 'Failed to update priority' };
  }
}

/**
 * Update wanted book notes
 */
export async function updateWantedNotes(
  id: number,
  notes: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = updateWantedBookInDb(id, { notes });
    if (result) {
      revalidatePath('/wanted');
      revalidatePath(`/wanted/${id}`);
      return { success: true };
    }
    return { success: false, error: 'Book not found' };
  } catch (error) {
    console.error('Error updating wanted notes:', error);
    return { success: false, error: 'Failed to update notes' };
  }
}

/**
 * Check if a book is on the wanted list
 */
export async function isBookWanted(
  hardcoverId?: string,
  isbn?: string,
  title?: string
): Promise<boolean> {
  return isBookWantedInDb(hardcoverId, isbn, title);
}

/**
 * Search Hardcover for books to add to wanted list
 */
export async function searchHardcoverBooks(query: string): Promise<{
  success: boolean;
  results?: Array<{
    id: string;
    title: string;
    author: string;
    isbn?: string;
    coverUrl?: string;
    description?: string;
    publishDate?: string;
  }>;
  error?: string;
}> {
  try {
    const results = await metadataService.searchBooks(query, { maxResults: 15 });

    return {
      success: true,
      results: results.map((r) => ({
        id: r.sourceId,
        title: r.title,
        author: r.authors,
        isbn: r.isbn,
        coverUrl: r.coverUrl,
        description: r.description,
        publishDate: r.publishDate,
      })),
    };
  } catch (error) {
    console.error('Error searching Hardcover:', error);
    return { success: false, error: 'Search failed' };
  }
}

/**
 * Get author's other books (for bibliography integration)
 * Uses Hardcover to find books by the same author
 */
export async function getAuthorBooks(authorName: string): Promise<{
  success: boolean;
  results?: Array<{
    id: string;
    title: string;
    author: string;
    isbn?: string;
    coverUrl?: string;
    description?: string;
    publishDate?: string;
    isWanted?: boolean;
  }>;
  error?: string;
}> {
  try {
    // Search for books by this author
    const results = await metadataService.searchBooks(`author:${authorName}`, { maxResults: 30 });

    // Check which ones are already wanted
    const resultsWithWantedStatus = await Promise.all(
      results.map(async (r) => ({
        id: r.sourceId,
        title: r.title,
        author: r.authors,
        isbn: r.isbn,
        coverUrl: r.coverUrl,
        description: r.description,
        publishDate: r.publishDate,
        isWanted: isBookWantedInDb(r.sourceId, r.isbn, r.title),
      }))
    );

    return {
      success: true,
      results: resultsWithWantedStatus,
    };
  } catch (error) {
    console.error('Error getting author books:', error);
    return { success: false, error: 'Failed to get author books' };
  }
}
