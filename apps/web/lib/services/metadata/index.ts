import * as hardcover from './hardcover';
export type { BookMetadata, SearchOptions } from '@shelvarr/services/metadata/index';
export { scoreResult } from '@shelvarr/services/metadata/index';

export function isConfigured(): boolean {
  return hardcover.isConfigured();
}

export async function getAllSourcesStatus() {
  const configured = hardcover.isConfigured();
  return [{
    name: 'hardcover' as const,
    displayName: 'Hardcover',
    enabled: configured,
    configured,
    requiresApiKey: true,
    apiKeyUrl: 'https://hardcover.app/account/api',
  }];
}

export async function searchBooks(
  query: string,
  options: { maxResults?: number } = {}
): Promise<import('@shelvarr/services/metadata/index').BookMetadata[]> {
  if (!hardcover.isConfigured()) return [];
  const maxResults = options.maxResults || 10;
  return hardcover.searchBooks(query, maxResults);
}

export async function searchByIsbn(isbn: string): Promise<import('@shelvarr/services/metadata/index').BookMetadata | null> {
  if (!hardcover.isConfigured()) return null;
  return hardcover.searchByIsbn(isbn);
}

export async function getBookBySourceId(
  source: string,
  sourceId: string
): Promise<import('@shelvarr/services/metadata/index').BookMetadata | null> {
  if (source !== 'hardcover') return null;
  return hardcover.getBookById(sourceId);
}

export async function autoMatch(
  title: string,
  author?: string,
  isbn?: string
): Promise<import('@shelvarr/services/metadata/index').BookMetadata | null> {
  if (!hardcover.isConfigured()) return null;

  if (isbn) {
    const isbnResult = await hardcover.searchByIsbn(isbn);
    if (isbnResult) return isbnResult;
  }

  const query = [title, author].filter(Boolean).join(' ').trim();
  if (!query) return null;

  const results = await hardcover.searchBooks(query, 1);
  return results[0] || null;
}

export { hardcover };
