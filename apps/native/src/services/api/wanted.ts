import { getApiClient } from './client';

export interface HardcoverSearchResult {
  hardcoverId: string;
  title: string;
  author: string;
  isbn?: string;
  coverUrl?: string;
  description?: string;
  publishDate?: string;
  isWanted: boolean;
}

export interface SearchResponse {
  success: boolean;
  configured?: boolean;
  results?: HardcoverSearchResult[];
  error?: string;
}

export interface AddWantedInput {
  hardcoverId?: string;
  title: string;
  author?: string;
  isbn?: string;
  coverUrl?: string;
  description?: string;
  priority?: number;
  notes?: string;
}

export interface AddWantedResponse {
  success: boolean;
  id?: number;
  error?: string;
}

export type WantedStatus = 'wanted' | 'searching' | 'found' | 'acquired';

export interface WantedBook {
  id: number;
  hardcover_id: string | null;
  title: string;
  author: string | null;
  isbn: string | null;
  cover_url: string | null;
  description: string | null;
  added_at: string;
  priority: number;
  notes: string | null;
  status: WantedStatus;
}

export interface WantedListResponse {
  success: boolean;
  books?: WantedBook[];
  error?: string;
}

export async function searchHardcover(query: string): Promise<SearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) return { success: true, results: [] };
  try {
    const { data } = await getApiClient().get<SearchResponse>('/api/wanted/search', {
      params: { q: trimmed },
    });
    return data;
  } catch (err: any) {
    return {
      success: false,
      error: err?.response?.data?.error || err?.message || 'Search failed',
    };
  }
}

export async function addToWanted(input: AddWantedInput): Promise<AddWantedResponse> {
  try {
    const { data } = await getApiClient().post<AddWantedResponse>('/api/wanted', input);
    return data;
  } catch (err: any) {
    return {
      success: false,
      error: err?.response?.data?.error || err?.message || 'Failed to add to wanted list',
    };
  }
}

export async function getWantedBooks(status?: WantedStatus): Promise<WantedListResponse> {
  try {
    const { data } = await getApiClient().get<WantedListResponse>('/api/wanted', {
      params: status ? { status } : undefined,
    });
    return data;
  } catch (err: any) {
    return {
      success: false,
      error: err?.response?.data?.error || err?.message || 'Failed to load wanted list',
    };
  }
}

export async function removeFromWanted(
  id: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data } = await getApiClient().delete<{ success: boolean; error?: string }>(
      `/api/wanted/${id}`
    );
    return data;
  } catch (err: any) {
    return {
      success: false,
      error: err?.response?.data?.error || err?.message || 'Failed to remove from wanted list',
    };
  }
}

export async function updateWanted(
  id: number,
  changes: { status?: WantedStatus; priority?: number; notes?: string }
): Promise<{ success: boolean; book?: WantedBook; error?: string }> {
  try {
    const { data } = await getApiClient().patch<{
      success: boolean;
      book?: WantedBook;
      error?: string;
    }>(`/api/wanted/${id}`, changes);
    return data;
  } catch (err: any) {
    return {
      success: false,
      error: err?.response?.data?.error || err?.message || 'Failed to update wanted item',
    };
  }
}

export async function checkIsWanted(params: {
  hardcoverId?: string;
  isbn?: string;
  title?: string;
}): Promise<boolean> {
  try {
    const { data } = await getApiClient().post<{ isWanted: boolean }>(
      '/api/wanted/check',
      params
    );
    return Boolean(data.isWanted);
  } catch {
    return false;
  }
}
