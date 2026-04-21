/**
 * Kapowarr API Client
 * Integrates with Kapowarr server for comic volume/issue management.
 * Kapowarr auth: API key passed as `api_key` query parameter.
 */

import { getServiceConfig } from '../config';
import type { KapowarrVolume, KapowarrVolumeDetail, KapowarrIssue, KapowarrFile } from '@shelvarr/types';

export type { KapowarrVolume, KapowarrVolumeDetail, KapowarrIssue, KapowarrFile };

/**
 * Valid sort values for GET /api/volumes, matching the LibrarySorting enum.
 * See backend/base/definitions.py#LibrarySorting.
 */
export type KapowarrSort = 'title' | 'year' | 'volume_number' | 'recently_added' | 'publisher';

export interface KapowarrConnectionStatus {
  connected: boolean;
  serverVersion?: string;
  error?: string;
}

export interface KapowarrListResponse<T> {
  error: string | null;
  result: T;
}

class KapowarrClient {
  private baseUrl: string | null = null;
  private apiKey: string | null = null;

  configure(url: string | null, apiKey: string | null): void {
    if (!url || !apiKey) {
      this.baseUrl = null;
      this.apiKey = null;
      return;
    }
    this.baseUrl = url.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return this.baseUrl !== null && this.apiKey !== null;
  }

  loadFromConfig(): void {
    const config = getServiceConfig();
    this.configure(config.kapowarr.url, config.kapowarr.apiKey);
  }

  private buildUrl(endpoint: string, params: Record<string, string | number | undefined> = {}): string {
    if (!this.baseUrl || !this.apiKey) {
      throw new Error('Kapowarr client not configured');
    }
    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.set('api_key', this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async request<T>(endpoint: string, params: Record<string, string | number | undefined> = {}, init: RequestInit = {}): Promise<T> {
    const url = this.buildUrl(endpoint, params);
    const response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Kapowarr API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return {} as T;
    }

    const body = await response.json() as KapowarrListResponse<T> | T;
    if (body && typeof body === 'object' && 'result' in body && 'error' in body) {
      const wrapped = body as KapowarrListResponse<T>;
      if (wrapped.error) {
        throw new Error(`Kapowarr API error: ${wrapped.error}`);
      }
      return wrapped.result;
    }
    return body as T;
  }

  async testConnection(): Promise<KapowarrConnectionStatus> {
    if (!this.isConfigured()) {
      return { connected: false, error: 'Kapowarr not configured' };
    }
    try {
      const about = await this.request<{ version?: string }>('/api/system/about');
      return { connected: true, serverVersion: about?.version };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  async getVolumes(params: { query?: string; sort?: KapowarrSort; filter?: 'wanted' | 'monitored' } = {}): Promise<KapowarrVolume[]> {
    return this.request<KapowarrVolume[]>('/api/volumes', {
      query: params.query,
      sort: params.sort,
      filter: params.filter,
    });
  }

  async getVolume(id: number): Promise<KapowarrVolumeDetail> {
    return this.request<KapowarrVolumeDetail>(`/api/volumes/${id}`);
  }

  async getIssue(id: number): Promise<KapowarrIssue> {
    return this.request<KapowarrIssue>(`/api/issues/${id}`);
  }

  /**
   * Build a direct cover URL (for use in <img src="...">).
   * Cover endpoints accept the same `api_key` query parameter.
   */
  getVolumeCoverUrl(id: number): string | null {
    if (!this.isConfigured()) return null;
    return this.buildUrl(`/api/volumes/${id}/cover`);
  }

  getIssueCoverUrl(id: number): string | null {
    if (!this.isConfigured()) return null;
    return this.buildUrl(`/api/issues/${id}/cover`);
  }
}

export const kapowarrClient = new KapowarrClient();

let _initialized = false;
const ensureInit = () => {
  if (!_initialized) {
    _initialized = true;
    try {
      kapowarrClient.loadFromConfig();
    } catch {
      // Config not yet initialized, ignore
    }
  }
};

const origRequest = (kapowarrClient as any).request.bind(kapowarrClient);
(kapowarrClient as any).request = function <T>(...args: any[]): Promise<T> {
  ensureInit();
  return origRequest(...args);
};
const origIsConfigured = kapowarrClient.isConfigured.bind(kapowarrClient);
kapowarrClient.isConfigured = () => {
  ensureInit();
  return origIsConfigured();
};
const origBuildUrl = (kapowarrClient as any).buildUrl.bind(kapowarrClient);
(kapowarrClient as any).buildUrl = function (...args: any[]): string {
  ensureInit();
  return origBuildUrl(...args);
};

export default kapowarrClient;
