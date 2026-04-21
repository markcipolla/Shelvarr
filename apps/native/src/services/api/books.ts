import { getApiClient } from './client';
import { Book, Page, PagedResponse } from '../../types/komga';
import { PAGE_SIZE } from '../../utils/constants';

export async function fetchBooksForSeries(
  seriesId: string,
  page: number = 0
): Promise<PagedResponse<Book>> {
  const { data } = await getApiClient().get<PagedResponse<Book>>(
    `/api/series/${seriesId}/books`,
    { params: { page, size: PAGE_SIZE, sort: 'metadata.numberSort,asc' } }
  );
  return data;
}

export async function fetchBook(bookId: string): Promise<Book> {
  const { data } = await getApiClient().get<Book>(`/api/books/${bookId}`);
  return data;
}

export async function fetchBookPages(bookId: string): Promise<Page[]> {
  const { data } = await getApiClient().get<Page[]>(`/api/books/${bookId}/pages`);
  return data;
}

export async function fetchOnDeck(page: number = 0, libraryId?: string): Promise<PagedResponse<Book>> {
  const params: Record<string, any> = { page, size: PAGE_SIZE };
  if (libraryId) params.library_id = libraryId;
  const { data } = await getApiClient().get<PagedResponse<Book>>(
    '/api/books/ondeck',
    { params }
  );
  return data;
}

export function getBookThumbnailUrl(bookId: string): string {
  const { shelvarrUrl } = require('../../stores/useSettingsStore').useSettingsStore.getState();
  return `${shelvarrUrl}/api/books/${bookId}/thumbnail`;
}

export function getBookPageUrl(bookId: string, pageNumber: number): string {
  const { shelvarrUrl } = require('../../stores/useSettingsStore').useSettingsStore.getState();
  return `${shelvarrUrl}/api/books/${bookId}/pages/${pageNumber}`;
}

export function getSeriesThumbnailUrl(seriesId: string): string {
  const { shelvarrUrl } = require('../../stores/useSettingsStore').useSettingsStore.getState();
  return `${shelvarrUrl}/api/series/${seriesId}/thumbnail`;
}

export async function updateReadProgress(
  bookId: string,
  page: number,
  completed: boolean = false
): Promise<void> {
  const body: any = {};
  if (completed) {
    body.completed = true;
  } else {
    body.page = page;
  }
  await getApiClient().patch(`/api/books/${bookId}/read-progress`, body);
}

export async function updateEpubProgression(
  bookId: string,
  progress: number,
  completed: boolean = false,
  href: string = ''
): Promise<void> {
  const body = {
    modified: new Date().toISOString(),
    device: {
      id: 'stacks-android',
      name: 'Stacks',
    },
    locator: {
      href,
      type: 'application/xhtml+xml',
      locations: {
        progression: completed ? 1.0 : progress,
        totalProgression: completed ? 1.0 : progress,
      },
    },
  };
  await getApiClient().put(`/api/books/${bookId}/progression`, body);
}

export interface EpubProgression {
  locator: {
    href: string;
    locations: {
      progression?: number;
      totalProgression?: number;
    };
  };
}

export async function getEpubProgression(bookId: string): Promise<EpubProgression | null> {
  try {
    const { data } = await getApiClient().get(`/api/books/${bookId}/progression`);
    return data;
  } catch {
    return null;
  }
}

export async function deleteReadProgress(bookId: string): Promise<void> {
  await getApiClient().delete(`/api/books/${bookId}/read-progress`);
}

export async function searchBooks(
  query: string,
  page: number = 0
): Promise<PagedResponse<Book>> {
  const { data } = await getApiClient().get<PagedResponse<Book>>(
    '/api/books',
    { params: { search: query, page, size: PAGE_SIZE, sort: 'metadata.titleSort,asc' } }
  );
  return data;
}

export async function fetchInProgressBooks(
  libraryId?: string
): Promise<PagedResponse<Book>> {
  const params: Record<string, any> = {
    read_status: 'IN_PROGRESS',
    size: 10,
    sort: 'readProgress.lastModified,desc',
  };
  if (libraryId) params.library_id = libraryId;
  const { data } = await getApiClient().get<PagedResponse<Book>>('/api/books', { params });
  return data;
}

export async function fetchRecentlyAdded(
  libraryId?: string
): Promise<PagedResponse<Book>> {
  const params: Record<string, any> = {
    size: 10,
    sort: 'createdDate,desc',
  };
  if (libraryId) params.library_id = libraryId;
  const { data } = await getApiClient().get<PagedResponse<Book>>('/api/books', { params });
  return data;
}
