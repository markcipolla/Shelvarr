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
  series: string | null;  // JSON array of [seriesName, position] tuples
  seriesName: string | null;  // Primary series name (for queries/display)
  seriesNumber: number | null;  // Primary series position
  isbn: string | null;
  publisher: string | null;
  publishDate: string | null;
  description: string | null;
  coverUrl: string | null;
  extension: string | null;
  komgaBookId: string | null;
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

export type TaskType = 'scan' | 'metadata' | 'book_metadata' | 'organize' | 'download' | 'author_sync' | 'komga_sync';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

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
  language: string | null;
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
  apiKey: string | null;
}

export interface KapowarrConfig {
  url: string | null;
  apiKey: string | null;
}

export interface AppConfig {
  env: string;
  port: number;
  dataDir: string;
  libraryRoot: string;
  dbPath: string;
  komga: KomgaConfig;
  kapowarr: KapowarrConfig;
  supportedExtensions: string[];
  rateLimits: {
    hardcover: number;
  };
  hardcoverToken: string | null;
}

// Kapowarr domain types
export interface KapowarrVolume {
  id: number;
  comicvine_id: number | null;
  title: string;
  year: number | null;
  publisher: string | null;
  volume_number: number | null;
  description: string | null;
  cover: string | null;
  monitored: boolean;
  issue_count: number;
  issues_downloaded: number;
  total_size: number | null;
  folder: string | null;
}

export interface KapowarrIssue {
  id: number;
  volume_id: number;
  comicvine_id: number | null;
  issue_number: string | null;
  calculated_issue_number: number | null;
  title: string | null;
  date: string | null;
  description: string | null;
  monitored: boolean;
  files: string[];
}

// Settings stored in database
export interface Settings {
  [key: string]: unknown;
  _config?: {
    libraryRoot: string;
    supportedExtensions: string[];
    komgaConfigured: boolean;
    komgaUrl?: string | null;
  };
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

// Database-specific types
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
  status: 'wanted' | 'searching' | 'found' | 'acquired';
}

export interface DownloadSourceConfig {
  id: number;
  source: string;
  enabled: number;
  credentials: string | null;
  last_checked: string | null;
}

export interface SourceStatusCache {
  id: number;
  source: string;
  status: 'up' | 'down' | 'degraded' | 'unknown';
  response_time: number | null;
  last_updated: string;
}

// Read progress types (for Komga-compatible API)
export interface ReadProgress {
  id: number;
  bookId: number;
  page: number;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EpubProgression {
  id: number;
  bookId: number;
  deviceId: string;
  locator: string; // JSON - EPUB CFI/position
  progression: number; // 0-1 percentage
  createdAt: string;
  updatedAt: string;
}
