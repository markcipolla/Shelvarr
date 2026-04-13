import { useMemo } from 'react';
import { encode as btoa } from 'base-64';
import { useAuthStore } from '../stores/useAuthStore';

export function useAuthHeaders(): Record<string, string> {
  const credentials = useAuthStore((s) => s.credentials);
  const sessionCookie = useAuthStore((s) => s.sessionCookie);

  return useMemo(() => {
    const headers: Record<string, string> = {};
    if (!credentials) return headers;

    if (sessionCookie) {
      headers['Cookie'] = `KOMGA-SESSION=${sessionCookie}`;
    }
    if (credentials.authType === 'basic' && credentials.username && credentials.password) {
      headers['Authorization'] = `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`;
    } else if (credentials.authType === 'apikey' && credentials.apiKey) {
      headers['X-API-Key'] = credentials.apiKey;
    }
    return headers;
  }, [credentials, sessionCookie]);
}
