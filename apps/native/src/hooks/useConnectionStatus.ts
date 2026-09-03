import { useAuthStore } from '../stores/useAuthStore';
import { useSettingsStore } from '../stores/useSettingsStore';

/**
 * Why a tab can't show the library — or `ready`, when it can.
 *
 * Screens read this instead of poking at the two stores themselves, so every
 * tab reaches the same verdict and shows the same notice for it.
 */
export type ConnectionStatus = 'ready' | 'no-server' | 'signed-out';

export function useConnectionStatus(): ConnectionStatus {
  const shelvarrUrl = useSettingsStore((s) => s.shelvarrUrl);
  const authState = useAuthStore((s) => s.state);

  if (!shelvarrUrl) return 'no-server';
  if (authState === 'signed-out') return 'signed-out';
  return 'ready';
}
