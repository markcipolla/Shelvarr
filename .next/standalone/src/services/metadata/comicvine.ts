/**
 * ComicVine API Service
 * https://comicvine.gamespot.com/api/
 *
 * Comic book database with excellent series (volume) tracking.
 * Requires API key (free, get from account page).
 * Rate limit: 200 requests per hour.
 */

import config from '../../config/index.js';

const API_BASE = 'https://comicvine.gamespot.com/api';

export interface ComicVineVolume {
  id: number;
  name: string;
  start_year?: string;
  publisher?: {
    id: number;
    name: string;
  };
  image?: {
    original_url?: string;
    medium_url?: string;
    small_url?: string;
  };
  count_of_issues?: number;
  description?: string;
  deck?: string;
}

export interface ComicVineIssue {
  id: number;
  name?: string;
  issue_number?: string;
  volume?: {
    id: number;
    name: string;
  };
  cover_date?: string;
  store_date?: string;
  image?: {
    original_url?: string;
    medium_url?: string;
    small_url?: string;
  };
  description?: string;
  deck?: string;
  person_credits?: Array<{
    id: number;
    name: string;
    role: string;
  }>;
}

export interface ComicVineSearchResponse<T> {
  error: string;
  limit: number;
  offset: number;
  number_of_page_results: number;
  number_of_total_results: number;
  status_code: number;
  results: T[];
}

export interface BookMetadata {
  title: string;
  authors: string;
  publisher?: string;
  publishDate?: string;
  description?: string;
  isbn?: string;
  coverUrl?: string;
  pageCount?: number;
  categories?: string[];
  language?: string;
  seriesName?: string;
  seriesNumber?: number;
  source: 'comicvine';
  sourceId: string;
}

// Rate limiting (200/hour = 1 every 18 seconds, but allows bursts)
let lastRequestTime = 0;
const minInterval = 1000 / (config.rateLimits.comicvine / 60);

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < minInterval) {
    await new Promise(resolve => setTimeout(resolve, minInterval - timeSinceLastRequest));
  }

  lastRequestTime = Date.now();
  return fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Shelvarr/1.0 (https://github.com/markcipolla/Shelvarr)',
    },
  });
}

/**
 * Get API key from config or database settings
 */
function getApiKey(): string | null {
  return config.comicvineApiKey;
}

/**
 * Build API URL with key and format
 */
function buildUrl(endpoint: string, params: Record<string, string> = {}): string {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('ComicVine API key not configured');
  }

  const searchParams = new URLSearchParams({
    api_key: apiKey,
    format: 'json',
    ...params,
  });

  return `${API_BASE}${endpoint}?${searchParams}`;
}

/**
 * Search for volumes (comic series)
 */
export async function searchVolumes(query: string, maxResults = 10): Promise<ComicVineVolume[]> {
  if (!isConfigured()) {
    return [];
  }

  const url = buildUrl('/search/', {
    query,
    resources: 'volume',
    limit: String(maxResults),
    field_list: 'id,name,start_year,publisher,image,count_of_issues,description,deck',
  });

  try {
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      throw new Error(`ComicVine API error: ${response.status}`);
    }

    const data = await response.json() as ComicVineSearchResponse<ComicVineVolume>;

    if (data.status_code !== 1) {
      throw new Error(`ComicVine API error: ${data.error}`);
    }

    return data.results;
  } catch (error) {
    console.error('ComicVine volume search error:', error);
    throw error;
  }
}

/**
 * Search for issues
 */
export async function searchIssues(query: string, maxResults = 10): Promise<ComicVineIssue[]> {
  if (!isConfigured()) {
    return [];
  }

  const url = buildUrl('/search/', {
    query,
    resources: 'issue',
    limit: String(maxResults),
    field_list: 'id,name,issue_number,volume,cover_date,store_date,image,description,deck,person_credits',
  });

  try {
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      throw new Error(`ComicVine API error: ${response.status}`);
    }

    const data = await response.json() as ComicVineSearchResponse<ComicVineIssue>;

    if (data.status_code !== 1) {
      throw new Error(`ComicVine API error: ${data.error}`);
    }

    return data.results;
  } catch (error) {
    console.error('ComicVine issue search error:', error);
    throw error;
  }
}

/**
 * Get volume details by ID
 */
export async function getVolumeById(id: string): Promise<ComicVineVolume | null> {
  if (!isConfigured()) {
    return null;
  }

  const url = buildUrl(`/volume/4050-${id}/`, {
    field_list: 'id,name,start_year,publisher,image,count_of_issues,description,deck',
  });

  try {
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`ComicVine API error: ${response.status}`);
    }

    const data = await response.json() as { status_code: number; error: string; results: ComicVineVolume };

    if (data.status_code !== 1) {
      return null;
    }

    return data.results;
  } catch (error) {
    console.error('ComicVine get volume error:', error);
    return null;
  }
}

/**
 * Get issue details by ID
 */
export async function getIssueById(id: string): Promise<ComicVineIssue | null> {
  if (!isConfigured()) {
    return null;
  }

  const url = buildUrl(`/issue/4000-${id}/`, {
    field_list: 'id,name,issue_number,volume,cover_date,store_date,image,description,deck,person_credits',
  });

  try {
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`ComicVine API error: ${response.status}`);
    }

    const data = await response.json() as { status_code: number; error: string; results: ComicVineIssue };

    if (data.status_code !== 1) {
      return null;
    }

    return data.results;
  } catch (error) {
    console.error('ComicVine get issue error:', error);
    return null;
  }
}

/**
 * Search for books (searches both volumes and issues)
 */
export async function searchBooks(query: string, maxResults = 10): Promise<BookMetadata[]> {
  if (!isConfigured()) {
    return [];
  }

  try {
    // Search for issues (individual comics)
    const issues = await searchIssues(query, maxResults);
    return issues.map(issueToMetadata);
  } catch (error) {
    console.error('ComicVine search error:', error);
    return [];
  }
}

/**
 * Search by ISBN - ComicVine doesn't support ISBN lookup
 */
export async function searchByIsbn(_isbn: string): Promise<BookMetadata | null> {
  // ComicVine doesn't use ISBNs
  return null;
}

/**
 * Search by title and author
 */
export async function searchByTitleAuthor(title: string, _author?: string): Promise<BookMetadata[]> {
  return searchBooks(title);
}

/**
 * Get book by ID (issue ID)
 */
export async function getBookById(id: string): Promise<BookMetadata | null> {
  const issue = await getIssueById(id);
  if (!issue) {
    return null;
  }
  return issueToMetadata(issue);
}

/**
 * Convert ComicVine issue to our metadata format
 */
function issueToMetadata(issue: ComicVineIssue): BookMetadata {
  // Extract authors (writers primarily)
  let authors = 'Unknown';
  if (issue.person_credits && issue.person_credits.length > 0) {
    const writers = issue.person_credits.filter(
      p => p.role.toLowerCase().includes('writer')
    );
    if (writers.length > 0) {
      authors = writers.map(w => w.name).join(', ');
    } else if (issue.person_credits[0]) {
      // Fall back to first credited person
      authors = issue.person_credits[0].name;
    }
  }

  // Build title
  let title = issue.volume?.name || 'Unknown';
  if (issue.name) {
    title = `${title}: ${issue.name}`;
  } else if (issue.issue_number) {
    title = `${title} #${issue.issue_number}`;
  }

  // Parse series number from issue_number
  let seriesNumber: number | undefined;
  if (issue.issue_number) {
    const num = parseFloat(issue.issue_number);
    if (!isNaN(num)) {
      seriesNumber = num;
    }
  }

  // Strip HTML from description
  let description = issue.description || issue.deck;
  if (description) {
    description = description.replace(/<[^>]*>/g, '').trim();
  }

  return {
    title,
    authors,
    publishDate: issue.cover_date || issue.store_date,
    description,
    coverUrl: issue.image?.medium_url || issue.image?.small_url,
    seriesName: issue.volume?.name,
    seriesNumber,
    categories: ['Comics'],
    source: 'comicvine',
    sourceId: String(issue.id),
  };
}

/**
 * Convert ComicVine volume to our metadata format
 */
export function volumeToMetadata(volume: ComicVineVolume): BookMetadata {
  // Strip HTML from description
  let description = volume.description || volume.deck;
  if (description) {
    description = description.replace(/<[^>]*>/g, '').trim();
  }

  return {
    title: volume.name,
    authors: 'Various', // Volumes don't have single authors
    publisher: volume.publisher?.name,
    publishDate: volume.start_year,
    description,
    coverUrl: volume.image?.medium_url || volume.image?.small_url,
    seriesName: volume.name,
    categories: ['Comics'],
    source: 'comicvine',
    sourceId: String(volume.id),
  };
}

/**
 * Check if this provider is configured
 */
export function isConfigured(): boolean {
  return !!getApiKey();
}
