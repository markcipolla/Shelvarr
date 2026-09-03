import { useMemo } from 'react';
import { useAuthStore } from '../stores/useAuthStore';

/**
 * Headers for URLs handed straight to a native component — `<Image source>`,
 * a PDF viewer, a download. The axios client adds these itself.
 */
export function useAuthHeaders(): Record<string, string> {
  const token = useAuthStore((state) => state.token);
  return useMemo(() => {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, [token]);
}
