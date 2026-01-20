/**
 * Komga API Client
 * Integrates with Komga server for library management
 */

import config from '@/lib/config';

export interface KomgaLibrary {
  id: string;
  name: string;
  root: string;
  importComicInfoBook: boolean;
  scanForceModifiedTime: boolean;
  scanDeep: boolean;
  repairExtensions: boolean;
  convertToCbz: boolean;
  emptyTrashAfterScan: boolean;
  seriesCover: string;
  hashFiles: boolean;
  hashPages: boolean;
  analyzeDimensions: boolean;
  unavailable: boolean;
}

export interface KomgaSeries {
  id: string;
  libraryId: string;
  name: string;
  url: string;
  booksCount: number;
  booksReadCount: number;
  booksUnreadCount: number;
  booksInProgressCount: number;
  metadata: {
    status: string;
    title: string;
    titleSort: string;
  };
}

export interface KomgaBook {
  id: string;
  seriesId: string;
  libraryId: string;
  name: string;
  url: string;
  number: number;
  fileLastModified: string;
  sizeBytes: number;
  media: {
    status: string;
    mediaType: string;
    pagesCount: number;
  };
  metadata: {
    title: string;
    summary: string;
    number: string;
    numberSort: number;
    releaseDate: string | null;
    authors: Array<{ name: string; role: string }>;
    tags: string[];
    isbn: string;
    links: Array<{ label: string; url: string }>;
  };
}

export interface KomgaBookMetadataUpdate {
  title?: string;
  titleLock?: boolean;
  summary?: string;
  summaryLock?: boolean;
  number?: string;
  numberLock?: boolean;
  numberSort?: number;
  numberSortLock?: boolean;
  releaseDate?: string | null;
  releaseDateLock?: boolean;
  authors?: Array<{ name: string; role: string }>;
  authorsLock?: boolean;
  tags?: string[];
  tagsLock?: boolean;
  isbn?: string;
  isbnLock?: boolean;
}

export interface KomgaConnectionStatus {
  connected: boolean;
  serverVersion?: string;
  error?: string;
}

/**
 * Komga API Client class
 */
class KomgaClient {
  private baseUrl: string | null = null;
  private authHeader: string | null = null;

  /**
   * Configure the client with Komga server details
   */
  configure(url: string | null, username: string | null, password: string | null): void {
    if (!url || !username || !password) {
      this.baseUrl = null;
      this.authHeader = null;
      return;
    }

    // Remove trailing slash
    this.baseUrl = url.replace(/\/$/, '');
    // Create basic auth header
    this.authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
  }

  /**
   * Check if client is configured
   */
  isConfigured(): boolean {
    return this.baseUrl !== null && this.authHeader !== null;
  }

  /**
   * Load configuration from app config
   */
  loadFromConfig(): void {
    this.configure(
      config.komga.url,
      config.komga.username,
      config.komga.password
    );
  }

  /**
   * Make an authenticated request to Komga API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.baseUrl || !this.authHeader) {
      throw new Error('Komga client not configured');
    }

    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Komga API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // Some endpoints return no content
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  /**
   * Test connection to Komga server
   */
  async testConnection(): Promise<KomgaConnectionStatus> {
    if (!this.isConfigured()) {
      return { connected: false, error: 'Komga not configured' };
    }

    try {
      // Try to get server info or libraries as a connection test
      await this.getLibraries();
      return {
        connected: true,
        serverVersion: 'connected', // Komga doesn't have a simple version endpoint
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * Get all libraries from Komga
   */
  async getLibraries(): Promise<KomgaLibrary[]> {
    return this.request<KomgaLibrary[]>('/api/v1/libraries');
  }

  /**
   * Get a specific library by ID
   */
  async getLibrary(id: string): Promise<KomgaLibrary> {
    return this.request<KomgaLibrary>(`/api/v1/libraries/${id}`);
  }

  /**
   * Trigger a library scan
   */
  async scanLibrary(id: string): Promise<void> {
    await this.request<void>(`/api/v1/libraries/${id}/scan`, {
      method: 'POST',
    });
  }

  /**
   * Trigger scan for all libraries
   */
  async scanAllLibraries(): Promise<void> {
    const libraries = await this.getLibraries();
    await Promise.all(libraries.map(lib => this.scanLibrary(lib.id)));
  }

  /**
   * Get series with optional filtering
   */
  async getSeries(params: {
    libraryId?: string;
    page?: number;
    size?: number;
    search?: string;
  } = {}): Promise<{ content: KomgaSeries[]; totalElements: number; totalPages: number }> {
    const queryParams = new URLSearchParams();
    if (params.libraryId) queryParams.set('library_id', params.libraryId);
    if (params.page !== undefined) queryParams.set('page', String(params.page));
    if (params.size !== undefined) queryParams.set('size', String(params.size));
    if (params.search) queryParams.set('search', params.search);

    const query = queryParams.toString();
    return this.request(`/api/v1/series${query ? `?${query}` : ''}`);
  }

  /**
   * Get books with optional filtering
   */
  async getBooks(params: {
    libraryId?: string;
    seriesId?: string;
    page?: number;
    size?: number;
    search?: string;
  } = {}): Promise<{ content: KomgaBook[]; totalElements: number; totalPages: number }> {
    const queryParams = new URLSearchParams();
    if (params.libraryId) queryParams.set('library_id', params.libraryId);
    if (params.seriesId) queryParams.set('series_id', params.seriesId);
    if (params.page !== undefined) queryParams.set('page', String(params.page));
    if (params.size !== undefined) queryParams.set('size', String(params.size));
    if (params.search) queryParams.set('search', params.search);

    const query = queryParams.toString();
    return this.request(`/api/v1/books${query ? `?${query}` : ''}`);
  }

  /**
   * Analyze a specific library (reprocess metadata)
   */
  async analyzeLibrary(id: string): Promise<void> {
    await this.request<void>(`/api/v1/libraries/${id}/analyze`, {
      method: 'POST',
    });
  }

  /**
   * Refresh metadata for a library
   */
  async refreshLibraryMetadata(id: string): Promise<void> {
    await this.request<void>(`/api/v1/libraries/${id}/metadata/refresh`, {
      method: 'POST',
    });
  }

  /**
   * Find Komga library by path (matches Shelvarr library paths)
   */
  async findLibraryByPath(path: string): Promise<KomgaLibrary | null> {
    const libraries = await this.getLibraries();

    // Normalize paths for comparison
    const normalizedPath = path.replace(/\/$/, '');

    for (const lib of libraries) {
      const libPath = lib.root.replace(/\/$/, '');
      if (libPath === normalizedPath || normalizedPath.startsWith(libPath + '/') || libPath.startsWith(normalizedPath + '/')) {
        return lib;
      }
    }

    return null;
  }

  /**
   * Trigger scan for a library by its path
   * Useful for triggering Komga scan after Shelvarr reorganizes files
   */
  async scanLibraryByPath(path: string): Promise<{ success: boolean; libraryId?: string; error?: string }> {
    try {
      const library = await this.findLibraryByPath(path);
      if (!library) {
        return { success: false, error: 'No matching Komga library found for path' };
      }

      await this.scanLibrary(library.id);
      return { success: true, libraryId: library.id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to scan library',
      };
    }
  }

  /**
   * Get a single book by ID
   */
  async getBook(id: string): Promise<KomgaBook> {
    return this.request<KomgaBook>(`/api/v1/books/${id}`);
  }

  /**
   * Search for a book by filename
   * Returns the first matching book or null
   */
  async findBookByFilename(filename: string, libraryId?: string): Promise<KomgaBook | null> {
    try {
      const params: { search?: string; libraryId?: string; size?: number } = {
        search: filename,
        size: 10,
      };
      if (libraryId) {
        params.libraryId = libraryId;
      }

      const result = await this.getBooks(params);

      // Find exact filename match
      const normalizedSearch = filename.toLowerCase();
      for (const book of result.content) {
        // Extract filename from URL or name
        const bookFilename = book.name.toLowerCase();
        if (bookFilename === normalizedSearch || bookFilename.includes(normalizedSearch)) {
          return book;
        }
      }

      // If no exact match, return first result as best guess
      return result.content[0] || null;
    } catch {
      return null;
    }
  }

  /**
   * Update book metadata in Komga
   */
  async updateBookMetadata(bookId: string, metadata: KomgaBookMetadataUpdate): Promise<void> {
    await this.request<void>(`/api/v1/books/${bookId}/metadata`, {
      method: 'PATCH',
      body: JSON.stringify(metadata),
    });
  }

  /**
   * Upload a thumbnail/cover for a book from a URL
   */
  async uploadBookThumbnailFromUrl(bookId: string, imageUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Fetch the image
      const response = await fetch(imageUrl);
      if (!response.ok) {
        return { success: false, error: `Failed to fetch image: ${response.status}` };
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const buffer = await response.arrayBuffer();

      // Upload to Komga using multipart form
      const formData = new FormData();
      const blob = new Blob([buffer], { type: contentType });
      formData.append('file', blob, 'cover.jpg');

      if (!this.baseUrl || !this.authHeader) {
        return { success: false, error: 'Komga not configured' };
      }

      const uploadResponse = await fetch(`${this.baseUrl}/api/v1/books/${bookId}/thumbnails`, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
        },
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text().catch(() => '');
        return { success: false, error: `Upload failed: ${uploadResponse.status} ${errorText}` };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload thumbnail',
      };
    }
  }

  /**
   * Sync a book's metadata and cover to Komga
   * Searches for the book by filename and updates its metadata
   */
  async syncBookToKomga(
    filename: string,
    metadata: {
      title?: string;
      description?: string;
      authors?: string[];
      isbn?: string;
      publishDate?: string;
      coverUrl?: string;
      seriesNumber?: number;
    },
    libraryPath?: string
  ): Promise<{ success: boolean; komgaBookId?: string; error?: string }> {
    try {
      if (!this.isConfigured()) {
        return { success: false, error: 'Komga not configured' };
      }

      // Find the Komga library if path provided
      let libraryId: string | undefined;
      if (libraryPath) {
        const library = await this.findLibraryByPath(libraryPath);
        if (library) {
          libraryId = library.id;
        }
      }

      // Find the book in Komga
      const book = await this.findBookByFilename(filename, libraryId);
      if (!book) {
        return { success: false, error: 'Book not found in Komga' };
      }

      // Build metadata update
      const update: KomgaBookMetadataUpdate = {};

      if (metadata.title) {
        update.title = metadata.title;
        update.titleLock = true;
      }

      if (metadata.description) {
        update.summary = metadata.description;
        update.summaryLock = true;
      }

      if (metadata.authors && metadata.authors.length > 0) {
        update.authors = metadata.authors.map(name => ({ name, role: 'writer' }));
        update.authorsLock = true;
      }

      if (metadata.isbn) {
        update.isbn = metadata.isbn;
        update.isbnLock = true;
      }

      if (metadata.publishDate) {
        update.releaseDate = metadata.publishDate;
        update.releaseDateLock = true;
      }

      if (metadata.seriesNumber !== undefined) {
        update.numberSort = metadata.seriesNumber;
        update.numberSortLock = true;
      }

      // Update metadata
      if (Object.keys(update).length > 0) {
        await this.updateBookMetadata(book.id, update);
      }

      // Upload cover if provided
      if (metadata.coverUrl) {
        const coverResult = await this.uploadBookThumbnailFromUrl(book.id, metadata.coverUrl);
        if (!coverResult.success) {
          console.warn(`Failed to upload cover to Komga: ${coverResult.error}`);
          // Don't fail the whole operation for cover upload failure
        }
      }

      return { success: true, komgaBookId: book.id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync to Komga',
      };
    }
  }
}

// Singleton instance
export const komgaClient = new KomgaClient();

// Initialize from config on module load
komgaClient.loadFromConfig();

export default komgaClient;
