import { useSettingsStore } from '../../stores/useSettingsStore';

/**
 * Fire-and-forget: update reading status on Hardcover via Shelvarr.
 * Never throws — silently logs errors so reading flow is never blocked.
 */
export async function updateReadingStatus(
  komgaBookId: string,
  status: 'reading' | 'read' | 'dnf'
): Promise<void> {
  const shelvarrUrl = useSettingsStore.getState().shelvarrUrl;
  if (!shelvarrUrl) return;

  try {
    const url = `${shelvarrUrl.replace(/\/$/, '')}/api/reading-status/by-komga`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ komgaBookId, status }),
    });
  } catch (err) {
    console.warn('Shelvarr status sync failed (non-blocking):', err);
  }
}
