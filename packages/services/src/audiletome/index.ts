/**
 * Audiletome API Client
 * Integrates with an audiletome server to poll audiobook-creation status and
 * pull finished .m4b files. Talks to the read-only, versioned integration API
 * under /api/v1.
 *
 * Auth follows the *arr convention: the API key is sent as an `X-Api-Key`
 * header. When no key is configured the API is assumed open (trusted network).
 */

import { getServiceConfig } from '../config';
import type { AudiletomeBook, AudiletomeSystemStatus } from '@shelvarr/types';

export type { AudiletomeBook, AudiletomeSystemStatus };

export interface AudiletomeConnectionStatus {
  connected: boolean;
  serverName?: string;
  serverVersion?: string;
  error?: string;
}

class AudiletomeClient {
  private baseUrl: string | null = null;
  private apiKey: string | null = null;

  configure(url: string | null, apiKey: string | null): void {
    // The API key is optional — audiletome leaves the API open when it is unset.
    if (!url) {
      this.baseUrl = null;
      this.apiKey = null;
      return;
    }
    this.baseUrl = url.replace(/\/$/, '');
    this.apiKey = apiKey || null;
  }

  isConfigured(): boolean {
    return this.baseUrl !== null;
  }

  loadFromConfig(): void {
    const config = getServiceConfig();
    this.configure(config.audiletome.url, config.audiletome.apiKey);
  }

  private buildHeaders(extra: HeadersInit = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(extra as Record<string, string>),
    };
    if (this.apiKey) {
      headers['X-Api-Key'] = this.apiKey;
    }
    return headers;
  }

  private async request<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
    if (!this.baseUrl) {
      throw new Error('Audiletome client not configured');
    }
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...init,
      headers: this.buildHeaders(init.headers),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Audiletome API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return {} as T;
    }

    // The /api/v1 endpoints return typed Pydantic models directly (no envelope).
    return (await response.json()) as T;
  }

  async testConnection(): Promise<AudiletomeConnectionStatus> {
    if (!this.isConfigured()) {
      return { connected: false, error: 'Audiletome not configured' };
    }
    try {
      const status = await this.getStatus();
      return { connected: true, serverName: status?.name, serverVersion: status?.version };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /** App name, version, and liveness. */
  async getStatus(): Promise<AudiletomeSystemStatus> {
    return this.request<AudiletomeSystemStatus>('/api/v1/system/status');
  }

  /** All books with their status + chunk progress. */
  async getBooks(): Promise<AudiletomeBook[]> {
    return this.request<AudiletomeBook[]>('/api/v1/books');
  }

  /** One book's status. Throws if the id is unknown (upstream 404). */
  async getBook(id: number | string): Promise<AudiletomeBook> {
    return this.request<AudiletomeBook>(`/api/v1/books/${id}`);
  }

  /**
   * Fetch the finished .m4b for a book. Returns the raw Response so a proxy
   * route can stream it straight through. Audiletome returns 409 until the
   * book is done and 404 if the file is missing — callers should surface those.
   */
  async downloadBook(id: number | string): Promise<Response> {
    if (!this.baseUrl) {
      throw new Error('Audiletome client not configured');
    }
    return fetch(`${this.baseUrl}/api/v1/books/${id}/download`, {
      headers: this.buildHeaders(),
    });
  }
}

export const audiletomeClient = new AudiletomeClient();

let _initialized = false;
const ensureInit = () => {
  if (!_initialized) {
    _initialized = true;
    try {
      audiletomeClient.loadFromConfig();
    } catch {
      // Config not yet initialized, ignore
    }
  }
};

const origRequest = (audiletomeClient as any).request.bind(audiletomeClient);
(audiletomeClient as any).request = function <T>(...args: any[]): Promise<T> {
  ensureInit();
  return origRequest(...args);
};
const origIsConfigured = audiletomeClient.isConfigured.bind(audiletomeClient);
audiletomeClient.isConfigured = () => {
  ensureInit();
  return origIsConfigured();
};
const origDownloadBook = audiletomeClient.downloadBook.bind(audiletomeClient);
audiletomeClient.downloadBook = (id: number | string) => {
  ensureInit();
  return origDownloadBook(id);
};

export default audiletomeClient;
