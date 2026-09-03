/**
 * Transform Shelvarr DB rows into the JSON the library API returns
 */

import type * as Api from '@shelvarr/types/api';
import type { ReadProgressRow, EpubProgressionRow } from '@shelvarr/db';
import { getEpubProgression, getHardcoverStatusId, hardcoverStatusLabel } from '@shelvarr/db';

interface DbBook {
  id: number;
  library_id: number;
  file_path: string;
  file_hash: string | null;
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
  metadata_source: string | null;
  metadata_id: string | null;
  created_at: string;
  updated_at: string;
  // Optional Hardcover status id, when a query already joined it in. Falls back
  // to a lookup by metadata_id when absent.
  hc_status?: number | null;
}

interface DbLibrary {
  id: number;
  name: string;
  path: string;
  type: string | null;
  created_at: string;
}

interface DbSeries {
  id: number;
  name: string;
  author: string | null;
  total_books: number | null;
  metadata_source: string | null;
  metadata_id: string | null;
  created_at: string;
  books_count?: number;
  library_id?: number;
}

const EXTENSION_MEDIA_TYPE_MAP: Record<string, string> = {
  epub: 'application/epub+zip',
  pdf: 'application/pdf',
  cbz: 'application/x-cbz',
  cbr: 'application/x-cbr',
  mobi: 'application/x-mobipocket-ebook',
  azw: 'application/vnd.amazon.ebook',
  azw3: 'application/vnd.amazon.ebook',
};

function extensionToMediaType(ext: string | null, filePath?: string): string {
  const normalized = ext?.replace('.', '') || '';
  if (normalized && EXTENSION_MEDIA_TYPE_MAP[normalized]) {
    return EXTENSION_MEDIA_TYPE_MAP[normalized];
  }
  // Fall back to file path extension
  if (filePath) {
    const match = filePath.match(/\.([a-z0-9]+)$/i);
    const ext = match?.[1]?.toLowerCase();
    if (ext && EXTENSION_MEDIA_TYPE_MAP[ext]) {
      return EXTENSION_MEDIA_TYPE_MAP[ext];
    }
  }
  return 'application/octet-stream';
}

function parseAuthors(authorsField: string | null): Api.Author[] {
  if (!authorsField) return [];
  try {
    const parsed = JSON.parse(authorsField);
    if (Array.isArray(parsed)) {
      return parsed.map((name: string) => ({ name, role: 'writer' }));
    }
    return [{ name: String(parsed), role: 'writer' }];
  } catch {
    return [{ name: authorsField, role: 'writer' }];
  }
}

function formatReadProgress(
  progress: ReadProgressRow | null,
  epub: EpubProgressionRow | null = null,
): Api.ReadProgress | null {
  if (!progress && !epub) return null;
  const completed = progress?.completed === 1 || (epub ? epub.progression >= 0.98 : false);
  const lastModified = epub?.updated_at ?? progress?.updated_at ?? new Date().toISOString();
  const created = progress?.created_at ?? epub?.created_at ?? lastModified;
  return {
    page: progress?.page ?? 0,
    completed,
    readDate: lastModified,
    created,
    lastModified,
    progression: epub?.progression,
  };
}

// The user's cached Hardcover reading status for a book. Prefers a status id the
// query already joined in (`hc_status`); otherwise looks it up by Hardcover id.
function resolveHardcoverStatus(row: DbBook): Api.Book['hardcoverStatus'] {
  if (row.hc_status !== undefined) return hardcoverStatusLabel(row.hc_status);
  if (row.metadata_source === 'hardcover' && row.metadata_id) {
    return hardcoverStatusLabel(getHardcoverStatusId(row.metadata_id));
  }
  return null;
}

export function toApiBook(row: DbBook, readProgress: ReadProgressRow | null = null): Api.Book {
  const epub = getEpubProgression(row.id);
  return {
    id: String(row.id),
    seriesId: row.series_name ? String(row.series_name) : String(row.library_id),
    name: row.title || row.file_path.split('/').pop() || 'Unknown',
    number: row.series_number || 0,
    media: {
      status: 'READY',
      mediaType: extensionToMediaType(row.extension, row.file_path),
      pagesCount: 0, // Not tracked for ebooks
    },
    metadata: {
      title: row.title || 'Unknown',
      summary: row.description || '',
      number: row.series_number ? String(row.series_number) : '0',
      authors: parseAuthors(row.authors),
    },
    readProgress: formatReadProgress(readProgress, epub),
    sizeBytes: row.file_size || 0,
    hardcoverStatus: resolveHardcoverStatus(row),
  };
}

export function toApiLibrary(row: DbLibrary): Api.Library {
  return {
    id: String(row.id),
    name: row.name,
  };
}

export function toApiSeries(row: DbSeries): Api.Series {
  return {
    id: String(row.id),
    libraryId: row.library_id ? String(row.library_id) : '0',
    name: row.name,
    booksCount: row.books_count || row.total_books || 0,
    metadata: {
      title: row.name,
      titleSort: row.name,
      summary: '',
      status: 'ENDED',
      publisher: '',
    },
  };
}

export function toPagedResponse<T>(
  content: T[],
  page: number,
  size: number,
  totalElements: number
): Api.PagedResponse<T> {
  const totalPages = Math.ceil(totalElements / size);
  return {
    content,
    pageable: {
      pageNumber: page,
      pageSize: size,
    },
    totalPages,
    totalElements,
    last: page >= totalPages - 1,
    first: page === 0,
    numberOfElements: content.length,
  };
}

export function toEpubProgression(row: EpubProgressionRow | null) {
  if (!row) return null;
  return {
    bookId: String(row.book_id),
    deviceId: row.device_id,
    locator: JSON.parse(row.locator),
    progression: row.progression,
    created: row.created_at,
    lastModified: row.updated_at,
  };
}
