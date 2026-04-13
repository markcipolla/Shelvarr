import { useAuthStore } from '../../stores/useAuthStore';

/**
 * Fire-and-forget: update reading status on Hardcover via Shelvarr server.
 * Uses the connected server URL (the Shelvarr server IS the Komga-compatible server).
 * Never throws — silently logs errors so reading flow is never blocked.
 */
export async function updateReadingStatus(
  komgaBookId: string,
  status: 'reading' | 'read' | 'dnf'
): Promise<void> {
  const credentials = useAuthStore.getState().credentials;
  if (!credentials?.serverUrl) return;

  try {
    const url = `${credentials.serverUrl.replace(/\/$/, '')}/api/reading-status/by-komga`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ komgaBookId, status }),
    });
  } catch (err) {
    console.warn('Shelvarr status sync failed (non-blocking):', err);
  }
}
