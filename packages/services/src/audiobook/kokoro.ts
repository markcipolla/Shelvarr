/**
 * Kokoro TTS client.
 * Talks to kokoro-fastapi's OpenAI-compatible speech endpoint.
 * See https://github.com/remsky/kokoro-fastapi
 */

import type { KokoroConfig } from '@shelvarr/types';
import { getSetting } from '@shelvarr/db';
import { getServiceConfig } from '../config';

/**
 * Upper bound on the text sent in one request. Kokoro stitches long input
 * itself, but smaller requests keep progress granular and avoid long stalls.
 */
export const MAX_CHUNK_CHARS = 1500;

/** Setting keys backing the Kokoro section of the settings UI. */
export const SETTING_KEYS = {
  url: 'kokoro_url',
  voice: 'kokoro_voice',
  model: 'kokoro_model',
  speed: 'kokoro_speed',
} as const;

/**
 * Read a setting as a non-empty string.
 * Tolerates an uninitialised database so the service still works on env alone.
 */
function readSetting(key: string): string | null {
  try {
    const value = getSetting<unknown>(key, null);
    if (value === null || value === undefined) return null;
    const text = typeof value === 'string' ? value : String(value);
    return text.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Effective Kokoro settings: values saved in the UI win, environment variables
 * are the fallback. Resolved per call, so a settings change takes effect
 * without restarting the server.
 */
export function getKokoroConfig(): KokoroConfig {
  const env = getServiceConfig().kokoro;
  const speed = Number(readSetting(SETTING_KEYS.speed));

  return {
    url: readSetting(SETTING_KEYS.url) ?? env.url,
    voice: readSetting(SETTING_KEYS.voice) ?? env.voice,
    model: readSetting(SETTING_KEYS.model) ?? env.model,
    speed: Number.isFinite(speed) && speed > 0 ? speed : env.speed,
  };
}

export function isConfigured(): boolean {
  return !!getKokoroConfig().url;
}

/** Build an API URL, tolerating a base URL that already ends in `/v1`. */
function apiUrl(baseUrl: string, path: string): string {
  const clean = baseUrl.replace(/\/+$/, '');
  return clean.endsWith('/v1') ? `${clean}${path}` : `${clean}/v1${path}`;
}

/**
 * Fetch the voices a Kokoro server offers, so the UI can present a picker
 * instead of asking for a voice id from memory.
 */
export async function listVoices(baseUrl?: string): Promise<string[]> {
  const url = baseUrl ?? getKokoroConfig().url;
  if (!url) {
    throw new Error('Kokoro is not configured');
  }

  const response = await fetch(apiUrl(url, '/audio/voices'));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = (await response.json()) as { voices?: unknown } | unknown[];
  const voices = Array.isArray(payload) ? payload : payload?.voices;

  return Array.isArray(voices) ? voices.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Split text into TTS-sized pieces, breaking on sentence boundaries where
 * possible so chunk joins land in natural pauses.
 */
export function chunkText(text: string, maxChars: number = MAX_CHUNK_CHARS): string[] {
  const chunks: string[] = [];
  let current = '';

  const append = (piece: string): void => {
    const separator = current ? ' ' : '';
    if (current.length + separator.length + piece.length > maxChars) {
      if (current) chunks.push(current);
      current = piece;
    } else {
      current += separator + piece;
    }
  };

  for (const paragraph of text.split(/\n+/)) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    const sentences = trimmed.length <= maxChars
      ? [trimmed]
      : trimmed.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [trimmed];

    for (const sentence of sentences) {
      let piece = sentence.trim();
      if (!piece) continue;

      // A single sentence over the limit still has to be broken somewhere.
      while (piece.length > maxChars) {
        const space = piece.lastIndexOf(' ', maxChars);
        const cut = space > 0 ? space : maxChars;
        append(piece.slice(0, cut).trim());
        piece = piece.slice(cut).trim();
      }

      if (piece) append(piece);
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

/** Synthesize a chunk of text to MP3 bytes. */
export async function synthesize(
  text: string,
  signal?: AbortSignal,
  overrides?: Partial<KokoroConfig>
): Promise<Buffer> {
  const { url, voice, model, speed } = { ...getKokoroConfig(), ...overrides };
  if (!url) {
    throw new Error('Kokoro is not configured');
  }

  const response = await fetch(apiUrl(url, '/audio/speech'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      voice,
      input: text,
      response_format: 'mp3',
      speed,
    }),
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Kokoro TTS failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
