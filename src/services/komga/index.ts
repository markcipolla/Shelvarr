/**
 * Komga API Client
 * Integrates with Komga server for library management
 */

import config from '../../config/index.js';

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
}

// Singleton instance
export const komgaClient = new KomgaClient();

// Initialize from config on module load
komgaClient.loadFromConfig();

export default komgaClient;
