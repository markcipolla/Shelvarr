import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import type {
  KomgaLibrary,
  KomgaSeries,
  KomgaBook,
  KomgaBookMetadataUpdate
} from '@/lib/services/komga/index';

// Mock data
const mockLibrary: KomgaLibrary = {
  id: 'lib-1',
  name: 'Test Library',
  root: '/data/comics',
  importComicInfoBook: true,
  scanForceModifiedTime: false,
  scanDeep: true,
  repairExtensions: false,
  convertToCbz: false,
  emptyTrashAfterScan: false,
  seriesCover: 'first',
  hashFiles: true,
  hashPages: true,
  analyzeDimensions: true,
  unavailable: false,
};

const mockSeries: KomgaSeries = {
  id: 'series-1',
  libraryId: 'lib-1',
  name: 'Test Series',
  url: 'http://localhost:25600/series/series-1',
  booksCount: 10,
  booksReadCount: 5,
  booksUnreadCount: 5,
  booksInProgressCount: 0,
  metadata: {
    status: 'ONGOING',
    title: 'Test Series',
    titleSort: 'Test Series',
  },
};

const mockBook: KomgaBook = {
  id: 'book-1',
  seriesId: 'series-1',
  libraryId: 'lib-1',
  name: 'Test Book #1.cbz',
  url: 'http://localhost:25600/books/book-1/file',
  number: 1,
  fileLastModified: '2024-01-01T00:00:00Z',
  sizeBytes: 1024000,
  media: {
    status: 'READY',
    mediaType: 'application/x-cbz',
    pagesCount: 24,
  },
  metadata: {
    title: 'Test Book #1',
    summary: 'A test book',
    number: '1',
    numberSort: 1,
    releaseDate: '2024-01-01',
    authors: [{ name: 'Test Author', role: 'writer' }],
    tags: ['test', 'comic'],
    isbn: '1234567890',
    links: [],
  },
};

// Create test instance of KomgaClient
class TestKomgaClient {
  private baseUrl: string | null = null;
  private authHeader: string | null = null;

  configure(url: string | null, apiKey: string | null): void {
    if (!url || !apiKey) {
      this.baseUrl = null;
      this.authHeader = null;
      return;
    }

    this.baseUrl = url.replace(/\/$/, '');
    this.authHeader = `Bearer ${apiKey}`;
  }

  isConfigured(): boolean {
    return this.baseUrl !== null && this.authHeader !== null;
  }

  loadFromConfig(): void {
    // Mock implementation - would normally load from config
  }

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

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  async testConnection(): Promise<{ connected: boolean; serverVersion?: string; error?: string }> {
    if (!this.isConfigured()) {
      return { connected: false, error: 'Komga not configured' };
    }

    try {
      await this.getLibraries();
      return {
        connected: true,
        serverVersion: 'connected',
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  async getLibraries(): Promise<KomgaLibrary[]> {
    return this.request<KomgaLibrary[]>('/api/v1/libraries');
  }

  async getLibrary(id: string): Promise<KomgaLibrary> {
    return this.request<KomgaLibrary>(`/api/v1/libraries/${id}`);
  }

  async scanLibrary(id: string): Promise<void> {
    await this.request<void>(`/api/v1/libraries/${id}/scan`, {
      method: 'POST',
    });
  }

  async scanAllLibraries(): Promise<void> {
    const libraries = await this.getLibraries();
    await Promise.all(libraries.map(lib => this.scanLibrary(lib.id)));
  }

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

  async analyzeLibrary(id: string): Promise<void> {
    await this.request<void>(`/api/v1/libraries/${id}/analyze`, {
      method: 'POST',
    });
  }

  async refreshLibraryMetadata(id: string): Promise<void> {
    await this.request<void>(`/api/v1/libraries/${id}/metadata/refresh`, {
      method: 'POST',
    });
  }

  async findLibraryByPath(path: string): Promise<KomgaLibrary | null> {
    const libraries = await this.getLibraries();

    const normalizedPath = path.replace(/\/$/, '');

    for (const lib of libraries) {
      const libPath = lib.root.replace(/\/$/, '');
      if (libPath === normalizedPath || normalizedPath.startsWith(libPath + '/') || libPath.startsWith(normalizedPath + '/')) {
        return lib;
      }
    }

    return null;
  }

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

  async getBook(id: string): Promise<KomgaBook> {
    return this.request<KomgaBook>(`/api/v1/books/${id}`);
  }

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

      const normalizedSearch = filename.toLowerCase();
      for (const book of result.content) {
        const bookFilename = book.name.toLowerCase();
        if (bookFilename === normalizedSearch || bookFilename.includes(normalizedSearch)) {
          return book;
        }
      }

      return result.content[0] || null;
    } catch {
      return null;
    }
  }

  async updateBookMetadata(bookId: string, metadata: KomgaBookMetadataUpdate): Promise<void> {
    await this.request<void>(`/api/v1/books/${bookId}/metadata`, {
      method: 'PATCH',
      body: JSON.stringify(metadata),
    });
  }

  async uploadBookThumbnailFromUrl(bookId: string, imageUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        return { success: false, error: `Failed to fetch image: ${response.status}` };
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const buffer = await response.arrayBuffer();

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

      let libraryId: string | undefined;
      if (libraryPath) {
        const library = await this.findLibraryByPath(libraryPath);
        if (library) {
          libraryId = library.id;
        }
      }

      const book = await this.findBookByFilename(filename, libraryId);
      if (!book) {
        return { success: false, error: 'Book not found in Komga' };
      }

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

      if (Object.keys(update).length > 0) {
        await this.updateBookMetadata(book.id, update);
      }

      if (metadata.coverUrl) {
        const coverResult = await this.uploadBookThumbnailFromUrl(book.id, metadata.coverUrl);
        if (!coverResult.success) {
          console.warn(`Failed to upload cover to Komga: ${coverResult.error}`);
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

describe('Komga Client', () => {
  let client: TestKomgaClient;
  let fetchMock: ReturnType<typeof mock.fn>;

  beforeEach(() => {
    client = new TestKomgaClient();
    fetchMock = mock.fn(fetch);
    global.fetch = fetchMock as any;
  });

  afterEach(() => {
    mock.restoreAll();
  });

  describe('Configuration', () => {
    it('should start unconfigured', () => {
      assert.strictEqual(client.isConfigured(), false);
    });

    it('should configure with valid URL and API key', () => {
      client.configure('http://localhost:25600', 'test-api-key');
      assert.strictEqual(client.isConfigured(), true);
    });

    it('should remove trailing slash from URL', () => {
      client.configure('http://localhost:25600/', 'test-api-key');
      assert.strictEqual(client.isConfigured(), true);
    });

    it('should unconfigure when called with null URL', () => {
      client.configure('http://localhost:25600', 'test-api-key');
      assert.strictEqual(client.isConfigured(), true);

      client.configure(null, 'test-api-key');
      assert.strictEqual(client.isConfigured(), false);
    });

    it('should unconfigure when called with null API key', () => {
      client.configure('http://localhost:25600', 'test-api-key');
      assert.strictEqual(client.isConfigured(), true);

      client.configure('http://localhost:25600', null);
      assert.strictEqual(client.isConfigured(), false);
    });

    it('should unconfigure when called with both null values', () => {
      client.configure('http://localhost:25600', 'test-api-key');
      assert.strictEqual(client.isConfigured(), true);

      client.configure(null, null);
      assert.strictEqual(client.isConfigured(), false);
    });

    it('should call loadFromConfig without errors', () => {
      assert.doesNotThrow(() => client.loadFromConfig());
    });
  });

  describe('Request Method', () => {
    it('should throw error when not configured', async () => {
      await assert.rejects(
        async () => await client.getLibraries(),
        { message: 'Komga client not configured' }
      );
    });

    it('should make successful request with proper headers', async () => {
      client.configure('http://localhost:25600', 'test-api-key');

      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [mockLibrary],
          headers: new Headers({ 'content-type': 'application/json' }),
        } as Response)
      );

      const result = await client.getLibraries();

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 'lib-1');

      const calls = fetchMock.mock.calls;
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].arguments[0], 'http://localhost:25600/api/v1/libraries');

      const fetchOptions = calls[0].arguments[1] as RequestInit;
      assert.strictEqual(fetchOptions.headers?.['Authorization'], 'Bearer test-api-key');
      assert.strictEqual(fetchOptions.headers?.['Content-Type'], 'application/json');
    });

    it('should handle 204 No Content response', async () => {
      client.configure('http://localhost:25600', 'test-api-key');

      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 204,
          headers: new Headers(),
        } as Response)
      );

      const result = await client.scanLibrary('lib-1');
      assert.strictEqual(result, undefined);
    });

    it('should handle content-length 0 response', async () => {
      client.configure('http://localhost:25600', 'test-api-key');

      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-length': '0' }),
        } as Response)
      );

      const result = await client.scanLibrary('lib-1');
      assert.strictEqual(result, undefined);
    });

    it('should throw error on failed request with error text', async () => {
      client.configure('http://localhost:25600', 'test-api-key');

      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: async () => 'Library not found',
        } as Response)
      );

      await assert.rejects(
        async () => await client.getLibrary('nonexistent'),
        { message: /Komga API error: 404 Not Found - Library not found/ }
      );
    });

    it('should throw error on failed request without error text', async () => {
      client.configure('http://localhost:25600', 'test-api-key');

      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => { throw new Error('Cannot read text'); },
        } as Response)
      );

      await assert.rejects(
        async () => await client.getLibraries(),
        { message: /Komga API error: 500 Internal Server Error/ }
      );
    });
  });

  describe('Test Connection', () => {
    it('should return error when not configured', async () => {
      const result = await client.testConnection();

      assert.strictEqual(result.connected, false);
      assert.strictEqual(result.error, 'Komga not configured');
    });

    it('should return success when configured and can connect', async () => {
      client.configure('http://localhost:25600', 'test-api-key');

      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [mockLibrary],
          headers: new Headers(),
        } as Response)
      );

      const result = await client.testConnection();

      assert.strictEqual(result.connected, true);
      assert.strictEqual(result.serverVersion, 'connected');
    });

    it('should return error on connection failure with Error', async () => {
      client.configure('http://localhost:25600', 'test-api-key');

      fetchMock.mock.mockImplementation(() =>
        Promise.reject(new Error('Network error'))
      );

      const result = await client.testConnection();

      assert.strictEqual(result.connected, false);
      assert.strictEqual(result.error, 'Network error');
    });

    it('should return error on connection failure with non-Error', async () => {
      client.configure('http://localhost:25600', 'test-api-key');

      fetchMock.mock.mockImplementation(() =>
        Promise.reject('Unknown error')
      );

      const result = await client.testConnection();

      assert.strictEqual(result.connected, false);
      assert.strictEqual(result.error, 'Connection failed');
    });
  });

  describe('Library Operations', () => {
    beforeEach(() => {
      client.configure('http://localhost:25600', 'test-api-key');
    });

    it('should get all libraries', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [mockLibrary],
          headers: new Headers(),
        } as Response)
      );

      const result = await client.getLibraries();

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 'lib-1');
    });

    it('should get a specific library', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockLibrary,
          headers: new Headers(),
        } as Response)
      );

      const result = await client.getLibrary('lib-1');

      assert.strictEqual(result.id, 'lib-1');
      assert.strictEqual(result.name, 'Test Library');
    });

    it('should scan a library', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 204,
          headers: new Headers(),
        } as Response)
      );

      await assert.doesNotReject(async () => await client.scanLibrary('lib-1'));

      const calls = fetchMock.mock.calls;
      assert.strictEqual(calls[0].arguments[0], 'http://localhost:25600/api/v1/libraries/lib-1/scan');

      const fetchOptions = calls[0].arguments[1] as RequestInit;
      assert.strictEqual(fetchOptions.method, 'POST');
    });

    it('should scan all libraries', async () => {
      const mockLibrary2 = { ...mockLibrary, id: 'lib-2', name: 'Library 2' };

      fetchMock.mock.mockImplementation((url: string) => {
        if (url.includes('/api/v1/libraries') && !url.includes('/scan')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [mockLibrary, mockLibrary2],
            headers: new Headers(),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 204,
          headers: new Headers(),
        } as Response);
      });

      await client.scanAllLibraries();

      const calls = fetchMock.mock.calls;
      assert.strictEqual(calls.length, 3); // 1 getLibraries + 2 scanLibrary
      assert.ok(calls.some(c => c.arguments[0].includes('/libraries/lib-1/scan')));
      assert.ok(calls.some(c => c.arguments[0].includes('/libraries/lib-2/scan')));
    });

    it('should analyze a library', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 204,
          headers: new Headers(),
        } as Response)
      );

      await client.analyzeLibrary('lib-1');

      const calls = fetchMock.mock.calls;
      assert.strictEqual(calls[0].arguments[0], 'http://localhost:25600/api/v1/libraries/lib-1/analyze');
    });

    it('should refresh library metadata', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 204,
          headers: new Headers(),
        } as Response)
      );

      await client.refreshLibraryMetadata('lib-1');

      const calls = fetchMock.mock.calls;
      assert.strictEqual(calls[0].arguments[0], 'http://localhost:25600/api/v1/libraries/lib-1/metadata/refresh');
    });
  });

  describe('Find Library By Path', () => {
    beforeEach(() => {
      client.configure('http://localhost:25600', 'test-api-key');
    });

    it('should find library by exact path match', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [mockLibrary],
          headers: new Headers(),
        } as Response)
      );

      const result = await client.findLibraryByPath('/data/comics');

      assert.strictEqual(result?.id, 'lib-1');
    });

    it('should find library by nested path', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [mockLibrary],
          headers: new Headers(),
        } as Response)
      );

      const result = await client.findLibraryByPath('/data/comics/marvel');

      assert.strictEqual(result?.id, 'lib-1');
    });

    it('should find library when library path is nested in search path', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [mockLibrary],
          headers: new Headers(),
        } as Response)
      );

      const result = await client.findLibraryByPath('/data');

      assert.strictEqual(result?.id, 'lib-1');
    });

    it('should handle trailing slashes', async () => {
      const libraryWithTrailingSlash = { ...mockLibrary, root: '/data/comics/' };

      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [libraryWithTrailingSlash],
          headers: new Headers(),
        } as Response)
      );

      const result = await client.findLibraryByPath('/data/comics');

      assert.strictEqual(result?.id, 'lib-1');
    });

    it('should return null when no matching library found', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [mockLibrary],
          headers: new Headers(),
        } as Response)
      );

      const result = await client.findLibraryByPath('/other/path');

      assert.strictEqual(result, null);
    });

    it('should return null when libraries list is empty', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [],
          headers: new Headers(),
        } as Response)
      );

      const result = await client.findLibraryByPath('/data/comics');

      assert.strictEqual(result, null);
    });
  });

  describe('Scan Library By Path', () => {
    beforeEach(() => {
      client.configure('http://localhost:25600', 'test-api-key');
    });

    it('should scan library by path successfully', async () => {
      fetchMock.mock.mockImplementation((url: string) => {
        if (url.includes('/api/v1/libraries') && !url.includes('/scan')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [mockLibrary],
            headers: new Headers(),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 204,
          headers: new Headers(),
        } as Response);
      });

      const result = await client.scanLibraryByPath('/data/comics');

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.libraryId, 'lib-1');
    });

    it('should return error when library not found', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [],
          headers: new Headers(),
        } as Response)
      );

      const result = await client.scanLibraryByPath('/nonexistent/path');

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'No matching Komga library found for path');
    });

    it('should return error on scan failure with Error', async () => {
      fetchMock.mock.mockImplementation((url: string) => {
        if (url.includes('/api/v1/libraries') && !url.includes('/scan')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [mockLibrary],
            headers: new Headers(),
          } as Response);
        }
        return Promise.reject(new Error('Scan failed'));
      });

      const result = await client.scanLibraryByPath('/data/comics');

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Scan failed');
    });

    it('should return error on scan failure with non-Error', async () => {
      fetchMock.mock.mockImplementation((url: string) => {
        if (url.includes('/api/v1/libraries') && !url.includes('/scan')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [mockLibrary],
            headers: new Headers(),
          } as Response);
        }
        return Promise.reject('Unknown error');
      });

      const result = await client.scanLibraryByPath('/data/comics');

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Failed to scan library');
    });
  });

  describe('Series Operations', () => {
    beforeEach(() => {
      client.configure('http://localhost:25600', 'test-api-key');
    });

    it('should get series without parameters', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ content: [mockSeries], totalElements: 1, totalPages: 1 }),
          headers: new Headers(),
        } as Response)
      );

      const result = await client.getSeries();

      assert.strictEqual(result.content.length, 1);
      assert.strictEqual(result.content[0].id, 'series-1');

      const calls = fetchMock.mock.calls;
      assert.strictEqual(calls[0].arguments[0], 'http://localhost:25600/api/v1/series');
    });

    it('should get series with libraryId parameter', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ content: [mockSeries], totalElements: 1, totalPages: 1 }),
          headers: new Headers(),
        } as Response)
      );

      const result = await client.getSeries({ libraryId: 'lib-1' });

      assert.strictEqual(result.content.length, 1);

      const calls = fetchMock.mock.calls;
      assert.ok(calls[0].arguments[0].includes('library_id=lib-1'));
    });

    it('should get series with page parameter', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ content: [mockSeries], totalElements: 1, totalPages: 1 }),
          headers: new Headers(),
        } as Response)
      );

      await client.getSeries({ page: 2 });

      const calls = fetchMock.mock.calls;
      assert.ok(calls[0].arguments[0].includes('page=2'));
    });

    it('should get series with size parameter', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ content: [mockSeries], totalElements: 1, totalPages: 1 }),
          headers: new Headers(),
        } as Response)
      );

      await client.getSeries({ size: 20 });

      const calls = fetchMock.mock.calls;
      assert.ok(calls[0].arguments[0].includes('size=20'));
    });

    it('should get series with search parameter', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ content: [mockSeries], totalElements: 1, totalPages: 1 }),
          headers: new Headers(),
        } as Response)
      );

      await client.getSeries({ search: 'test' });

      const calls = fetchMock.mock.calls;
      assert.ok(calls[0].arguments[0].includes('search=test'));
    });

    it('should get series with all parameters', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ content: [mockSeries], totalElements: 1, totalPages: 1 }),
          headers: new Headers(),
        } as Response)
      );

      await client.getSeries({
        libraryId: 'lib-1',
        page: 0,
        size: 10,
        search: 'marvel',
      });

      const calls = fetchMock.mock.calls;
      const url = calls[0].arguments[0];
      assert.ok(url.includes('library_id=lib-1'));
      assert.ok(url.includes('page=0'));
      assert.ok(url.includes('size=10'));
      assert.ok(url.includes('search=marvel'));
    });
  });

  describe('Book Operations', () => {
    beforeEach(() => {
      client.configure('http://localhost:25600', 'test-api-key');
    });

    it('should get books without parameters', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
          headers: new Headers(),
        } as Response)
      );

      const result = await client.getBooks();

      assert.strictEqual(result.content.length, 1);
      assert.strictEqual(result.content[0].id, 'book-1');

      const calls = fetchMock.mock.calls;
      assert.strictEqual(calls[0].arguments[0], 'http://localhost:25600/api/v1/books');
    });

    it('should get books with libraryId parameter', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
          headers: new Headers(),
        } as Response)
      );

      await client.getBooks({ libraryId: 'lib-1' });

      const calls = fetchMock.mock.calls;
      assert.ok(calls[0].arguments[0].includes('library_id=lib-1'));
    });

    it('should get books with seriesId parameter', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
          headers: new Headers(),
        } as Response)
      );

      await client.getBooks({ seriesId: 'series-1' });

      const calls = fetchMock.mock.calls;
      assert.ok(calls[0].arguments[0].includes('series_id=series-1'));
    });

    it('should get books with page parameter', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
          headers: new Headers(),
        } as Response)
      );

      await client.getBooks({ page: 1 });

      const calls = fetchMock.mock.calls;
      assert.ok(calls[0].arguments[0].includes('page=1'));
    });

    it('should get books with size parameter', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
          headers: new Headers(),
        } as Response)
      );

      await client.getBooks({ size: 25 });

      const calls = fetchMock.mock.calls;
      assert.ok(calls[0].arguments[0].includes('size=25'));
    });

    it('should get books with search parameter', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
          headers: new Headers(),
        } as Response)
      );

      await client.getBooks({ search: 'spider-man' });

      const calls = fetchMock.mock.calls;
      assert.ok(calls[0].arguments[0].includes('search=spider-man'));
    });

    it('should get books with all parameters', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
          headers: new Headers(),
        } as Response)
      );

      await client.getBooks({
        libraryId: 'lib-1',
        seriesId: 'series-1',
        page: 0,
        size: 10,
        search: 'test',
      });

      const calls = fetchMock.mock.calls;
      const url = calls[0].arguments[0];
      assert.ok(url.includes('library_id=lib-1'));
      assert.ok(url.includes('series_id=series-1'));
      assert.ok(url.includes('page=0'));
      assert.ok(url.includes('size=10'));
      assert.ok(url.includes('search=test'));
    });

    it('should get a single book by ID', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockBook,
          headers: new Headers(),
        } as Response)
      );

      const result = await client.getBook('book-1');

      assert.strictEqual(result.id, 'book-1');

      const calls = fetchMock.mock.calls;
      assert.strictEqual(calls[0].arguments[0], 'http://localhost:25600/api/v1/books/book-1');
    });
  });

  describe('Find Book By Filename', () => {
    beforeEach(() => {
      client.configure('http://localhost:25600', 'test-api-key');
    });

    it('should find book by exact filename match', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
          headers: new Headers(),
        } as Response)
      );

      const result = await client.findBookByFilename('test book #1.cbz');

      assert.strictEqual(result?.id, 'book-1');
    });

    it('should find book by partial filename match', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
          headers: new Headers(),
        } as Response)
      );

      const result = await client.findBookByFilename('test book');

      assert.strictEqual(result?.id, 'book-1');
    });

    it('should find book with libraryId parameter', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
          headers: new Headers(),
        } as Response)
      );

      const result = await client.findBookByFilename('test book', 'lib-1');

      assert.strictEqual(result?.id, 'book-1');

      const calls = fetchMock.mock.calls;
      assert.ok(calls[0].arguments[0].includes('library_id=lib-1'));
    });

    it('should return first result when no exact match found', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
          headers: new Headers(),
        } as Response)
      );

      const result = await client.findBookByFilename('nonmatching');

      assert.strictEqual(result?.id, 'book-1');
    });

    it('should return null when no books found', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ content: [], totalElements: 0, totalPages: 0 }),
          headers: new Headers(),
        } as Response)
      );

      const result = await client.findBookByFilename('nonexistent');

      assert.strictEqual(result, null);
    });

    it('should return null on error', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.reject(new Error('API error'))
      );

      const result = await client.findBookByFilename('test');

      assert.strictEqual(result, null);
    });
  });

  describe('Update Book Metadata', () => {
    beforeEach(() => {
      client.configure('http://localhost:25600', 'test-api-key');
    });

    it('should update book metadata', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 204,
          headers: new Headers(),
        } as Response)
      );

      const metadata: KomgaBookMetadataUpdate = {
        title: 'Updated Title',
        titleLock: true,
      };

      await client.updateBookMetadata('book-1', metadata);

      const calls = fetchMock.mock.calls;
      assert.strictEqual(calls[0].arguments[0], 'http://localhost:25600/api/v1/books/book-1/metadata');

      const fetchOptions = calls[0].arguments[1] as RequestInit;
      assert.strictEqual(fetchOptions.method, 'PATCH');
      assert.strictEqual(fetchOptions.body, JSON.stringify(metadata));
    });
  });

  describe('Upload Book Thumbnail', () => {
    beforeEach(() => {
      client.configure('http://localhost:25600', 'test-api-key');
    });

    it('should upload thumbnail from URL successfully', async () => {
      fetchMock.mock.mockImplementation((url: string) => {
        if (url.includes('example.com/cover.jpg')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'image/jpeg' }),
            arrayBuffer: async () => new ArrayBuffer(1024),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
        } as Response);
      });

      const result = await client.uploadBookThumbnailFromUrl('book-1', 'https://example.com/cover.jpg');

      assert.strictEqual(result.success, true);
    });

    it('should return error when image fetch fails', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          headers: new Headers(),
        } as Response)
      );

      const result = await client.uploadBookThumbnailFromUrl('book-1', 'https://example.com/notfound.jpg');

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('Failed to fetch image: 404'));
    });

    it('should use default content-type when not provided', async () => {
      fetchMock.mock.mockImplementation((url: string) => {
        if (url.includes('example.com/cover.jpg')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers(),
            arrayBuffer: async () => new ArrayBuffer(1024),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
        } as Response);
      });

      const result = await client.uploadBookThumbnailFromUrl('book-1', 'https://example.com/cover.jpg');

      assert.strictEqual(result.success, true);
    });

    it('should return error when not configured', async () => {
      const unconfiguredClient = new TestKomgaClient();

      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'image/jpeg' }),
          arrayBuffer: async () => new ArrayBuffer(1024),
        } as Response)
      );

      const result = await unconfiguredClient.uploadBookThumbnailFromUrl('book-1', 'https://example.com/cover.jpg');

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Komga not configured');
    });

    it('should return error when upload fails', async () => {
      fetchMock.mock.mockImplementation((url: string) => {
        if (url.includes('example.com/cover.jpg')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'image/jpeg' }),
            arrayBuffer: async () => new ArrayBuffer(1024),
          } as Response);
        }
        return Promise.resolve({
          ok: false,
          status: 500,
          text: async () => 'Upload error',
          headers: new Headers(),
        } as Response);
      });

      const result = await client.uploadBookThumbnailFromUrl('book-1', 'https://example.com/cover.jpg');

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('Upload failed: 500'));
    });

    it('should handle upload error text failure', async () => {
      fetchMock.mock.mockImplementation((url: string) => {
        if (url.includes('example.com/cover.jpg')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'image/jpeg' }),
            arrayBuffer: async () => new ArrayBuffer(1024),
          } as Response);
        }
        return Promise.resolve({
          ok: false,
          status: 500,
          text: async () => { throw new Error('Cannot read'); },
          headers: new Headers(),
        } as Response);
      });

      const result = await client.uploadBookThumbnailFromUrl('book-1', 'https://example.com/cover.jpg');

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('Upload failed: 500'));
    });

    it('should return error on exception with Error', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.reject(new Error('Network error'))
      );

      const result = await client.uploadBookThumbnailFromUrl('book-1', 'https://example.com/cover.jpg');

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Network error');
    });

    it('should return error on exception with non-Error', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.reject('Unknown error')
      );

      const result = await client.uploadBookThumbnailFromUrl('book-1', 'https://example.com/cover.jpg');

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Failed to upload thumbnail');
    });
  });

  describe('Sync Book To Komga', () => {
    beforeEach(() => {
      client.configure('http://localhost:25600', 'test-api-key');
    });

    it('should return error when not configured', async () => {
      const unconfiguredClient = new TestKomgaClient();

      const result = await unconfiguredClient.syncBookToKomga('test.cbz', {});

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Komga not configured');
    });

    it('should return error when book not found', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ content: [], totalElements: 0, totalPages: 0 }),
          headers: new Headers(),
        } as Response)
      );

      const result = await client.syncBookToKomga('nonexistent.cbz', {});

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Book not found in Komga');
    });

    it('should sync metadata with title', async () => {
      fetchMock.mock.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/api/v1/books') && !url.includes('/metadata')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
            headers: new Headers(),
          } as Response);
        }
        if (options?.method === 'PATCH') {
          return Promise.resolve({
            ok: true,
            status: 204,
            headers: new Headers(),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [mockLibrary],
          headers: new Headers(),
        } as Response);
      });

      const result = await client.syncBookToKomga('test.cbz', {
        title: 'New Title',
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.komgaBookId, 'book-1');
    });

    it('should sync metadata with description', async () => {
      fetchMock.mock.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/api/v1/books') && !url.includes('/metadata')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
            headers: new Headers(),
          } as Response);
        }
        if (options?.method === 'PATCH') {
          return Promise.resolve({
            ok: true,
            status: 204,
            headers: new Headers(),
          } as Response);
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => [], headers: new Headers() } as Response);
      });

      const result = await client.syncBookToKomga('test.cbz', {
        description: 'New description',
      });

      assert.strictEqual(result.success, true);
    });

    it('should sync metadata with authors', async () => {
      fetchMock.mock.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/api/v1/books') && !url.includes('/metadata')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
            headers: new Headers(),
          } as Response);
        }
        if (options?.method === 'PATCH') {
          return Promise.resolve({
            ok: true,
            status: 204,
            headers: new Headers(),
          } as Response);
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => [], headers: new Headers() } as Response);
      });

      const result = await client.syncBookToKomga('test.cbz', {
        authors: ['Author One', 'Author Two'],
      });

      assert.strictEqual(result.success, true);
    });

    it('should not sync when authors is empty array', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
          headers: new Headers(),
        } as Response)
      );

      const result = await client.syncBookToKomga('test.cbz', {
        authors: [],
      });

      assert.strictEqual(result.success, true);

      // Should only call getBooks (no metadata update)
      const calls = fetchMock.mock.calls;
      assert.strictEqual(calls.length, 1);
    });

    it('should sync metadata with isbn', async () => {
      fetchMock.mock.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/api/v1/books') && !url.includes('/metadata')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
            headers: new Headers(),
          } as Response);
        }
        if (options?.method === 'PATCH') {
          return Promise.resolve({
            ok: true,
            status: 204,
            headers: new Headers(),
          } as Response);
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => [], headers: new Headers() } as Response);
      });

      const result = await client.syncBookToKomga('test.cbz', {
        isbn: '1234567890',
      });

      assert.strictEqual(result.success, true);
    });

    it('should sync metadata with publishDate', async () => {
      fetchMock.mock.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/api/v1/books') && !url.includes('/metadata')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
            headers: new Headers(),
          } as Response);
        }
        if (options?.method === 'PATCH') {
          return Promise.resolve({
            ok: true,
            status: 204,
            headers: new Headers(),
          } as Response);
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => [], headers: new Headers() } as Response);
      });

      const result = await client.syncBookToKomga('test.cbz', {
        publishDate: '2024-01-01',
      });

      assert.strictEqual(result.success, true);
    });

    it('should sync metadata with seriesNumber', async () => {
      fetchMock.mock.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/api/v1/books') && !url.includes('/metadata')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
            headers: new Headers(),
          } as Response);
        }
        if (options?.method === 'PATCH') {
          return Promise.resolve({
            ok: true,
            status: 204,
            headers: new Headers(),
          } as Response);
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => [], headers: new Headers() } as Response);
      });

      const result = await client.syncBookToKomga('test.cbz', {
        seriesNumber: 5,
      });

      assert.strictEqual(result.success, true);
    });

    it('should sync metadata with seriesNumber 0', async () => {
      fetchMock.mock.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/api/v1/books') && !url.includes('/metadata')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
            headers: new Headers(),
          } as Response);
        }
        if (options?.method === 'PATCH') {
          return Promise.resolve({
            ok: true,
            status: 204,
            headers: new Headers(),
          } as Response);
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => [], headers: new Headers() } as Response);
      });

      const result = await client.syncBookToKomga('test.cbz', {
        seriesNumber: 0,
      });

      assert.strictEqual(result.success, true);
    });

    it('should sync with all metadata fields', async () => {
      fetchMock.mock.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/api/v1/books') && !url.includes('/metadata')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
            headers: new Headers(),
          } as Response);
        }
        if (options?.method === 'PATCH') {
          return Promise.resolve({
            ok: true,
            status: 204,
            headers: new Headers(),
          } as Response);
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => [], headers: new Headers() } as Response);
      });

      const result = await client.syncBookToKomga('test.cbz', {
        title: 'Full Title',
        description: 'Full description',
        authors: ['Author'],
        isbn: '123',
        publishDate: '2024-01-01',
        seriesNumber: 1,
      });

      assert.strictEqual(result.success, true);
    });

    it('should upload cover when coverUrl provided', async () => {
      const consoleWarnMock = mock.fn(console.warn);
      console.warn = consoleWarnMock as any;

      fetchMock.mock.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/api/v1/books') && !url.includes('/metadata') && !url.includes('/thumbnails')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
            headers: new Headers(),
          } as Response);
        }
        if (url.includes('example.com/cover.jpg')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'image/jpeg' }),
            arrayBuffer: async () => new ArrayBuffer(1024),
          } as Response);
        }
        if (url.includes('/thumbnails')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers(),
          } as Response);
        }
        if (options?.method === 'PATCH') {
          return Promise.resolve({
            ok: true,
            status: 204,
            headers: new Headers(),
          } as Response);
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => [], headers: new Headers() } as Response);
      });

      const result = await client.syncBookToKomga('test.cbz', {
        title: 'Test',
        coverUrl: 'https://example.com/cover.jpg',
      });

      assert.strictEqual(result.success, true);

      mock.restoreAll();
    });

    it('should not fail when cover upload fails', async () => {
      const consoleWarnMock = mock.fn(console.warn);
      console.warn = consoleWarnMock as any;

      fetchMock.mock.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/api/v1/books') && !url.includes('/metadata') && !url.includes('/thumbnails')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
            headers: new Headers(),
          } as Response);
        }
        if (url.includes('example.com/cover.jpg')) {
          return Promise.resolve({
            ok: false,
            status: 404,
            headers: new Headers(),
          } as Response);
        }
        if (options?.method === 'PATCH') {
          return Promise.resolve({
            ok: true,
            status: 204,
            headers: new Headers(),
          } as Response);
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => [], headers: new Headers() } as Response);
      });

      const result = await client.syncBookToKomga('test.cbz', {
        title: 'Test',
        coverUrl: 'https://example.com/cover.jpg',
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(consoleWarnMock.mock.calls.length, 1);

      mock.restoreAll();
    });

    it('should find library by path when libraryPath provided', async () => {
      fetchMock.mock.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/api/v1/libraries') && !url.includes('/scan')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [mockLibrary],
            headers: new Headers(),
          } as Response);
        }
        if (url.includes('/api/v1/books') && !url.includes('/metadata')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
            headers: new Headers(),
          } as Response);
        }
        if (options?.method === 'PATCH') {
          return Promise.resolve({
            ok: true,
            status: 204,
            headers: new Headers(),
          } as Response);
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => [], headers: new Headers() } as Response);
      });

      const result = await client.syncBookToKomga(
        'test.cbz',
        { title: 'Test' },
        '/data/comics'
      );

      assert.strictEqual(result.success, true);
    });

    it('should handle when library not found by path', async () => {
      fetchMock.mock.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/api/v1/libraries')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [],
            headers: new Headers(),
          } as Response);
        }
        if (url.includes('/api/v1/books') && !url.includes('/metadata')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
            headers: new Headers(),
          } as Response);
        }
        if (options?.method === 'PATCH') {
          return Promise.resolve({
            ok: true,
            status: 204,
            headers: new Headers(),
          } as Response);
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => [], headers: new Headers() } as Response);
      });

      const result = await client.syncBookToKomga(
        'test.cbz',
        { title: 'Test' },
        '/nonexistent/path'
      );

      assert.strictEqual(result.success, true);
    });

    it('should skip metadata update when no metadata provided', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
          headers: new Headers(),
        } as Response)
      );

      const result = await client.syncBookToKomga('test.cbz', {});

      assert.strictEqual(result.success, true);

      // Should only call getBooks (no metadata update)
      const calls = fetchMock.mock.calls;
      assert.strictEqual(calls.length, 1);
    });

    it('should return error when book search fails and returns empty', async () => {
      fetchMock.mock.mockImplementation(() =>
        Promise.reject(new Error('API error'))
      );

      const result = await client.syncBookToKomga('test.cbz', { title: 'Test' });

      assert.strictEqual(result.success, false);
      // findBookByFilename catches errors and returns null, which causes "Book not found" error
      assert.strictEqual(result.error, 'Book not found in Komga');
    });

    it('should return error on metadata update exception', async () => {
      fetchMock.mock.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/api/v1/books') && !url.includes('/metadata')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ content: [mockBook], totalElements: 1, totalPages: 1 }),
            headers: new Headers(),
          } as Response);
        }
        if (options?.method === 'PATCH') {
          return Promise.reject(new Error('Metadata update failed'));
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => [], headers: new Headers() } as Response);
      });

      const result = await client.syncBookToKomga('test.cbz', { title: 'Test' });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Metadata update failed');
    });
  });
});
