import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useConnectivityStore } from '../../stores/useConnectivityStore';

let apiClient: AxiosInstance | null = null;

function isNetworkError(err: AxiosError): boolean {
  // Axios sets `code === 'ERR_NETWORK'` (or no response) when the request never
  // reached the server. HTTP errors (4xx/5xx) have a response and don't count.
  return !err.response;
}

export function getApiClient(): AxiosInstance {
  if (apiClient) return apiClient;

  apiClient = axios.create({
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
  });

  // Request interceptor: set baseURL from settings
  apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const { shelvarrUrl } = useSettingsStore.getState();
    if (shelvarrUrl) {
      config.baseURL = shelvarrUrl;
    }
    return config;
  });

  // Response interceptor: flip the connectivity flag based on whether the
  // request reached the server. Lets UI grey out remote-only items offline.
  apiClient.interceptors.response.use(
    (response) => {
      useConnectivityStore.getState().setOnline(true);
      return response;
    },
    (error: AxiosError) => {
      if (isNetworkError(error)) {
        useConnectivityStore.getState().setOnline(false);
      } else {
        useConnectivityStore.getState().setOnline(true);
      }
      return Promise.reject(error);
    }
  );

  return apiClient;
}

export function resetApiClient(): void {
  apiClient = null;
}
