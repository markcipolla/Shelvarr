import { useSettingsStore } from '../../stores/useSettingsStore';

export async function testShelvarrConnection(
  url: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return { ok: false, error: 'URL is empty' };

  try {
    const res = await fetch(`${trimmed}/api/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return { ok: false, error: `Server responded with ${res.status}` };
    }
    const body = (await res.json().catch(() => null)) as { status?: string } | null;
    if (!body || body.status !== 'ok') {
      return { ok: false, error: 'Not a Shelvarr server' };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Could not reach server' };
  }
}

/**
 * Fire-and-forget: update reading status on Hardcover via Shelvarr server.
 * Never throws — silently logs errors so reading flow is never blocked.
 */
export type ReadingStatus = 'want-to-read' | 'reading' | 'read' | 'dnf';

export async function updateReadingStatus(
  bookId: string,
  status: ReadingStatus
): Promise<void> {
  const shelvarrUrl = useSettingsStore.getState().shelvarrUrl;
  if (!shelvarrUrl) return;

  try {
    const url = `${shelvarrUrl.replace(/\/$/, '')}/api/reading-status/by-book`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookId, status }),
    });
  } catch (err) {
    console.warn('Shelvarr status sync failed (non-blocking):', err);
  }
}
