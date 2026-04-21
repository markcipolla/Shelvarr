import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { useSettingsStore } from '../../stores/useSettingsStore';

let apiClient: AxiosInstance | null = null;

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

  return apiClient;
}

export function resetApiClient(): void {
  apiClient = null;
}
