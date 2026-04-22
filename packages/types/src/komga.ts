// Komga API types - defines the shape of Komga-compatible API responses

export interface Library {
  id: string;
  name: string;
}

export interface Series {
  id: string;
  libraryId: string;
  name: string;
  booksCount: number;
  metadata: SeriesMetadata;
}

export interface SeriesMetadata {
  title: string;
  titleSort: string;
  summary: string;
  status: string;
  publisher: string;
}

export interface Book {
  id: string;
  seriesId: string;
  name: string;
  number: number;
  media: BookMedia;
  metadata: BookMetadata;
  readProgress: ReadProgress | null;
  sizeBytes: number;
}

export interface BookMedia {
  status: string;
  mediaType: string;
  pagesCount: number;
}

export interface BookMetadata {
  title: string;
  summary: string;
  number: string;
  authors: Author[];
}

export interface Author {
  name: string;
  role: string;
}

export interface ReadProgress {
  page: number;
  completed: boolean;
  readDate: string;
  created: string;
  lastModified: string;
}

export interface Page {
  number: number;
  fileName: string;
  mediaType: string;
  width: number;
  height: number;
}

export interface PagedResponse<T> {
  content: T[];
  pageable: {
    pageNumber: number;
    pageSize: number;
  };
  totalPages: number;
  totalElements: number;
  last: boolean;
  first: boolean;
  numberOfElements: number;
}

export type MediaFormat = 'epub' | 'pdf' | 'cbz' | 'cbr' | 'unknown';

export interface AuthCredentials {
  serverUrl: string;
  username?: string;
  password?: string;
  apiKey?: string;
  authType: 'basic' | 'apikey';
}

export interface DownloadedBook {
  bookId: string;
  filePath: string;
  format: MediaFormat;
  extractedDir?: string;
  downloadedAt: number;
  persisted?: boolean;
  book?: Book;
}
