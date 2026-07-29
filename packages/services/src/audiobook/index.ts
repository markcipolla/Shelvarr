/**
 * Audiobook generation.
 * Narrates an EPUB into one MP3 per chapter, written to a sibling directory
 * next to the source file. Long generations are resumable: completed tracks
 * are written atomically, so a re-run skips whatever already finished.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join, resolve } from 'path';
import { createLogger } from '../utils/logger';
import { extractChapters } from './epub';
import { chunkText, getKokoroConfig, isConfigured, listVoices, synthesize } from './kokoro';

export { isConfigured, getKokoroConfig, listVoices, synthesize, chunkText };
export { SETTING_KEYS } from './kokoro';
export type { EpubChapter } from './epub';

const log = createLogger('audiobook');

const MANIFEST_FILE = 'audiobook.json';

/** Characters no common filesystem accepts in a filename. */
const ILLEGAL_FILENAME_CHARS = '<>:"/\\|?*';

export interface AudiobookTrack {
  file: string;
  title: string;
  chars: number;
}

export interface AudiobookManifest {
  bookId: number;
  title: string;
  voice: string;
  generatedAt: string;
  tracks: AudiobookTrack[];
}

export interface GenerateOptions {
  onProgress?: (current: number, total: number) => void;
  signal?: AbortSignal;
  /** Re-narrate tracks that already exist on disk. */
  force?: boolean;
}

export interface AudiobookResult {
  outputDir: string;
  chapters: number;
  chunks: number;
  /** Chapters skipped because audio already existed. */
  reused: number;
}

/** Strip characters that are illegal or awkward in filenames. */
function safeFilename(name: string): string {
  const cleaned = Array.from(name)
    .filter((ch) => ch.charCodeAt(0) >= 0x20 && !ILLEGAL_FILENAME_CHARS.includes(ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || 'Chapter';
}

/** Directory holding a book's generated audio, alongside the source file. */
export function audiobookDir(bookPath: string): string {
  const base = basename(bookPath, extname(bookPath));
  return join(dirname(bookPath), `${base} Audiobook`);
}

/** Read the manifest for a book's audiobook, or null if none has been generated. */
export function readManifest(bookPath: string): AudiobookManifest | null {
  const manifestPath = join(audiobookDir(bookPath), MANIFEST_FILE);
  if (!existsSync(manifestPath)) return null;

  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8')) as AudiobookManifest;
  } catch {
    return null;
  }
}

/**
 * Resolve a track filename to an on-disk path, refusing anything that escapes
 * the book's audiobook directory.
 */
export function resolveTrack(bookPath: string, filename: string): string | null {
  const dir = audiobookDir(bookPath);
  const resolved = resolve(dir, filename);

  if (resolved !== join(dir, basename(filename))) return null;
  if (!resolved.toLowerCase().endsWith('.mp3')) return null;

  return existsSync(resolved) ? resolved : null;
}

/**
 * Narrate a book to per-chapter MP3s. Reports progress in TTS chunks, which is
 * finer-grained than chapters and roughly proportional to time spent.
 */
export async function generateAudiobook(
  input: { bookId: number; bookPath: string; title: string },
  options: GenerateOptions = {}
): Promise<AudiobookResult> {
  const { onProgress, signal, force = false } = options;

  if (!isConfigured()) {
    throw new Error('Kokoro is not configured');
  }
  if (extname(input.bookPath).toLowerCase() !== '.epub') {
    throw new Error('Audiobook generation currently supports EPUB only');
  }

  const plan = extractChapters(input.bookPath).map((chapter) => ({
    chapter,
    chunks: chunkText(chapter.text),
  }));
  const totalChunks = plan.reduce((sum, entry) => sum + entry.chunks.length, 0);

  const outputDir = audiobookDir(input.bookPath);
  mkdirSync(outputDir, { recursive: true });

  log.info('Generating audiobook', {
    bookId: input.bookId,
    chapters: plan.length,
    totalChunks,
    outputDir,
  });

  const tracks: AudiobookTrack[] = [];
  let completedChunks = 0;
  let reused = 0;

  onProgress?.(0, totalChunks);

  for (const { chapter, chunks } of plan) {
    const file = `${String(chapter.index).padStart(3, '0')} - ${safeFilename(chapter.title)}.mp3`;
    const target = join(outputDir, file);
    tracks.push({ file, title: chapter.title, chars: chapter.text.length });

    // Tracks are renamed into place only once complete, so an existing file is
    // known-good and can be reused when resuming an interrupted run.
    if (!force && existsSync(target)) {
      reused++;
      completedChunks += chunks.length;
      onProgress?.(completedChunks, totalChunks);
      continue;
    }

    const parts: Buffer[] = [];
    for (const chunk of chunks) {
      if (signal?.aborted) {
        throw new Error('Task cancelled');
      }
      parts.push(await synthesize(chunk, signal));
      completedChunks++;
      onProgress?.(completedChunks, totalChunks);
    }

    const partial = `${target}.part`;
    writeFileSync(partial, Buffer.concat(parts));
    renameSync(partial, target);
  }

  const manifest: AudiobookManifest = {
    bookId: input.bookId,
    title: input.title,
    voice: getKokoroConfig().voice,
    generatedAt: new Date().toISOString(),
    tracks,
  };
  writeFileSync(join(outputDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2));

  log.info('Audiobook complete', { bookId: input.bookId, chapters: plan.length, reused });

  return { outputDir, chapters: plan.length, chunks: totalChunks, reused };
}

/** Total bytes of generated audio for a book, or 0 if none exists. */
export function audiobookSize(bookPath: string): number {
  const manifest = readManifest(bookPath);
  if (!manifest) return 0;

  const dir = audiobookDir(bookPath);
  return manifest.tracks.reduce((sum, track) => {
    try {
      return sum + statSync(join(dir, track.file)).size;
    } catch {
      return sum;
    }
  }, 0);
}
