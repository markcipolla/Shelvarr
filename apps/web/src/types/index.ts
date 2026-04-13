// Core domain types for Shelvarr

export interface Library {
  id: number;
  name: string;
  path: string;
  komgaLibraryId: string | null;
  createdAt: string;
}

export interface Book {
  id: number;
  libraryId: number;
  filePath: string;
  fileHash: string | null;
  fileSize: number | null;
  title: string | null;
  authors: string | null; // JSON array
  seriesName: string | null;
  seriesNumber: number | null;
  isbn: string | null;
  publisher: string | null;
  publishDate: string | null;
  description: string | null;
  coverUrl: string | null;
  metadataSource: string | null;
  metadataId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Series {
  id: number;
  name: string;
  author: string | null;
  totalBooks: number | null;
  metadataSource: string | null;
  metadataId: string | null;
  createdAt: string;
}

export interface BookSeries {
  bookId: number;
  seriesId: number;
  position: number | null;
}

export interface Task {
  id: number;
  type: TaskType;
  status: TaskStatus;
  progress: number;
  total: number | null;
  result: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export type TaskType = 'scan' | 'metadata' | 'organize' | 'download';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Author {
  id: number;
  name: string;
  openlibraryId: string | null;
  googleBooksId: string | null;
  totalWorks: number | null;
  lastSynced: string | null;
  createdAt: string;
}

export interface AuthorWork {
  id: number;
  authorId: number;
  title: string;
  isbn: string | null;
  publishYear: number | null;
  metadataSource: string | null;
  metadataId: string | null;
  owned: boolean;
  bookId: number | null;
  wanted: boolean;
  createdAt: string;
}

export interface Download {
  id: number;
  title: string;
  author: string | null;
  isbn: string | null;
  source: DownloadSource;
  sourceUrl: string | null;
  status: DownloadStatus;
  targetLibraryId: number | null;
  filePath: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export type DownloadSource = 'zlibrary' | 'annas' | 'libgen';
export type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'failed';

// API response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface HealthResponse {
  status: 'ok' | 'error';
  version: string;
  timestamp: string;
}

// Config types
export interface KomgaConfig {
  url: string | null;
  username: string | null;
  password: string | null;
}

export interface AppConfig {
  env: string;
  port: number;
  dataDir: string;
  libraryRoot: string;
  dbPath: string;
  komga: KomgaConfig;
  supportedExtensions: string[];
  rateLimits: {
    googleBooks: number;
    openLibrary: number;
    hardcover: number;
    bookbrainz: number;
    audnexus: number;
    comicvine: number;
    wikidata: number;
  };
  // API keys from environment
  hardcoverToken: string | null;
  comicvineApiKey: string | null;
}

// Settings stored in database
export interface Settings {
  [key: string]: unknown;
  _config?: {
    libraryRoot: string;
    supportedExtensions: string[];
    komgaConfigured: boolean;
    komgaUrl?: string | null;
    komgaUsername?: string | null;
  };
}

// Metadata provider types
export type MetadataSource =
  | 'googlebooks'
  | 'openlibrary'
  | 'hardcover'
  | 'bookbrainz'
  | 'audnexus'
  | 'comicvine'
  | 'wikidata';

export interface MetadataSearchResult {
  source: MetadataSource;
  id: string;
  title: string;
  authors: string[];
  isbn?: string;
  publisher?: string;
  publishDate?: string;
  description?: string;
  coverUrl?: string;
  pageCount?: number;
  seriesName?: string;
  seriesNumber?: number;
}

// Metadata source configuration
export interface MetadataSourceConfig {
  name: MetadataSource;
  displayName: string;
  enabled: boolean;
  requiresApiKey: boolean;
  apiKey?: string;
  apiKeyUrl?: string;  // URL to get API key
}

// File organization types
export interface OrganizePreview {
  bookId: number;
  currentPath: string;
  newPath: string;
  action: 'move' | 'rename' | 'skip';
  reason?: string;
}

export interface DuplicateGroup {
  hash: string;
  books: Book[];
  similarity: number;
}
