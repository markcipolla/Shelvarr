import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { encode as btoa } from 'base-64';
import { useAuthStore } from '../../stores/useAuthStore';

let apiClient: AxiosInstance | null = null;

export function getApiClient(): AxiosInstance {
  if (apiClient) return apiClient;

  apiClient = axios.create({
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
  });

  // Request interceptor: add auth headers
  apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const { credentials, sessionCookie } = useAuthStore.getState();
    if (!credentials) return config;

    config.baseURL = credentials.serverUrl;

    // Prefer session cookie if available
    if (sessionCookie) {
      config.headers.set('Cookie', `KOMGA-SESSION=${sessionCookie}`);
    }

    if (credentials.authType === 'basic' && credentials.username && credentials.password) {
      const encoded = btoa(`${credentials.username}:${credentials.password}`);
      config.headers.set('Authorization', `Basic ${encoded}`);
    } else if (credentials.authType === 'apikey' && credentials.apiKey) {
      config.headers.set('X-API-Key', credentials.apiKey);
    }

    return config;
  });

  // Response interceptor: capture session cookie
  apiClient.interceptors.response.use((response) => {
    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      const sessionMatch = setCookie.toString().match(/KOMGA-SESSION=([^;]+)/);
      if (sessionMatch) {
        useAuthStore.getState().setSessionCookie(sessionMatch[1]);
      }
    }
    return response;
  });

  return apiClient;
}

export function resetApiClient(): void {
  apiClient = null;
}
