/**
 * Streaming HTTP download with redirect following and range resume.
 *
 * Generic across sources: nothing here knows about comics, LibGen, or any
 * other caller. A caller resolves a link into a `ResolvedDownload` however
 * makes sense for its host — GetComics buttons and LibGen mirrors need very
 * different resolution logic — and then hands it to `downloadToFile`, which
 * just streams bytes to disk.
 *
 * Split out of `comics/getcomics/clients/direct.ts` (E2-2), which still owns
 * the GetComics-specific resolution helpers (`probeDownload`,
 * `describeDownload`, `resolveDirectDownload`) and re-exports everything
 * below for existing callers.
 *
 * Stands in for Kapowarr's `BaseDirectDownload` (GPL-3.0,
 * `backend/implementations/download_clients.py`) — see NOTICE.md — but is
 * much smaller, because the hosts Shelvarr fetches from resolve to ordinary
 * range-capable HTTP responses.
 */

import { createWriteStream, existsSync, statSync, unlinkSync } from 'fs';
import { dirname } from 'path';
import { mkdir } from 'fs/promises';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { parseRetryAfter } from './pacing';

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** The link doesn't lead to a file (dead, removed, or an error page). */
export class LinkBrokenError extends Error {
  constructor(readonly link: string, message?: string) {
    super(message ?? `Download link is broken: ${link}`);
    this.name = 'LinkBrokenError';
  }
}

/**
 * The host works but is rate-limiting us. Worth retrying later.
 *
 * `retryAfterMs` carries what the response's `Retry-After` header asked for,
 * when it sent one. A caller that knows which *source* the host belongs to
 * turns this into a per-source deferral (E1-6, `downloads/source-limits.ts`)
 * so the rest of the queue waits out the same limit instead of each finding
 * it the hard way; without a header it falls back to that source's own
 * default wait.
 */
export class DownloadLimitReachedError extends Error {
  constructor(readonly host: string, readonly retryAfterMs: number | null = null) {
    super(`Download limit reached for ${host}`);
    this.name = 'DownloadLimitReachedError';
  }
}

/** A link resolved to something we can actually stream. */
export interface ResolvedDownload {
  /** The final URL after redirects. */
  url: string;
  /** Filename the server suggests, or one derived from the URL. */
  filename: string;
  /** Total size in bytes, or null when the server won't say. */
  size: number | null;
  supportsRange: boolean;
  contentType: string | null;
}

export interface DownloadToFileOptions {
  /** Called with bytes-so-far as the download proceeds. */
  onProgress?: (bytesDownloaded: number, totalBytes: number | null) => void;
  signal?: AbortSignal;
  /** Resume from a partial file if one is already on disk. Default true. */
  resume?: boolean;
}

export interface DownloadResult {
  path: string;
  bytes: number;
}

/** Pull a filename out of a Content-Disposition header. */
export function filenameFromDisposition(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
  return match?.[1] ? match[1].replace(/['"]/g, '') : fallback;
}

/**
 * Fetch `url` with a Range request for byte 0 — enough to read a download's
 * real headers (size, content type, whether Range is honoured) without
 * pulling the file body across the wire. Shared by every source that
 * resolves a "is this link actually a file" candidate (LibGen, Anna's
 * Archive, Z-Library): each supplies its own headers and, where it already
 * has one, its own retrying fetch (`fetchFn`) — LibGen's mirrors
 * intermittently 500 under load and are worth a retry, so it passes its own
 * `fetchWithRetry`; sources without that infrastructure fall back to a
 * plain fetch that treats a network error as "this candidate didn't work"
 * rather than throwing.
 *
 * Returns null on a network failure or a non-2xx/206 status. The body is
 * left undrained — callers that don't need it (an HTML-detection path that
 * wants the text instead) can read it their own way.
 */
export async function fetchProbe(
  url: string,
  options: {
    headers?: Record<string, string>;
    fetchFn?: (url: string, init: RequestInit) => Promise<Response | null>;
  } = {}
): Promise<Response | null> {
  const doFetch =
    options.fetchFn ??
    (async (u: string, init: RequestInit) => {
      try {
        return await fetch(u, init);
      } catch {
        return null;
      }
    });

  const response = await doFetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': '*/*', 'Range': 'bytes=0-0', ...options.headers },
    redirect: 'follow',
  });
  if (!response) return null;
  if (!response.ok && response.status !== 206) return null;

  return response;
}

/**
 * Turn an already-fetched probe response into a `ResolvedDownload`. Does not
 * read or drain the body — callers that haven't already consumed it should
 * do so first (`response.arrayBuffer().catch(() => undefined)` is enough;
 * the bytes themselves are never used) so the underlying socket can be
 * reused.
 */
export function buildResolvedDownload(response: Response, url: string, fallbackFilename: string): ResolvedDownload {
  const contentType = response.headers.get('content-type');

  let size: number | null = null;
  const contentRange = response.headers.get('content-range');
  if (contentRange) {
    const total = /\/(\d+)\s*$/.exec(contentRange)?.[1];
    if (total) size = parseInt(total, 10);
  } else {
    const length = response.headers.get('content-length');
    if (length) size = parseInt(length, 10);
  }

  return {
    url: response.url || url,
    filename: filenameFromDisposition(response.headers.get('content-disposition'), fallbackFilename),
    size: size !== null && Number.isFinite(size) ? size : null,
    supportsRange: response.status === 206 || response.headers.get('accept-ranges') === 'bytes',
    contentType,
  };
}

/**
 * Probe `url` and resolve it into a streamable download, without fetching
 * the file body. A response whose content type is `text/html` is treated as
 * `LinkBrokenError` — a rate-limit or error page, not the file — which is
 * the right call for a source with no notion of a bot-check challenge page.
 * A source that does (Anna's Archive) uses `fetchProbe` + `buildResolvedDownload`
 * directly instead, so it can tell a challenge apart from an ordinary dead
 * link before deciding which error to raise.
 */
export async function probeDownloadUrl(
  url: string,
  options: {
    headers?: Record<string, string>;
    fallbackFilename: string;
    fetchFn?: (url: string, init: RequestInit) => Promise<Response | null>;
  }
): Promise<ResolvedDownload | null> {
  const response = await fetchProbe(url, options);
  if (!response) return null;

  // Drain the tiny probe body so the socket can be reused; only the headers
  // are actually used below.
  await response.arrayBuffer().catch(() => undefined);

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('text/html')) {
    throw new LinkBrokenError(url, 'Server served HTML instead of a file');
  }

  return buildResolvedDownload(response, url, options.fallbackFilename);
}

/**
 * Stream a resolved download to `destination`, resuming from a partial file
 * when the server supports it.
 */
export async function downloadToFile(
  resolved: ResolvedDownload,
  destination: string,
  options: DownloadToFileOptions = {}
): Promise<DownloadResult> {
  const { onProgress, signal, resume = true } = options;

  await mkdir(dirname(destination), { recursive: true });

  let startByte = 0;
  if (resume && resolved.supportsRange && existsSync(destination)) {
    const existing = statSync(destination).size;
    // A file that's already complete needs no work; an over-long one is
    // corrupt, so start again.
    if (resolved.size !== null && existing === resolved.size) {
      onProgress?.(existing, resolved.size);
      return { path: destination, bytes: existing };
    }
    if (resolved.size !== null && existing > resolved.size) unlinkSync(destination);
    else startByte = existing;
  }

  const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (startByte > 0) headers['Range'] = `bytes=${startByte}-`;

  const response = await fetch(resolved.url, {
    headers,
    redirect: 'follow',
    ...(signal ? { signal } : {}),
  });

  if (response.status === 429) {
    throw new DownloadLimitReachedError(
      new URL(resolved.url).hostname,
      parseRetryAfter(response.headers.get('retry-after'))
    );
  }
  if (!response.ok) {
    throw new LinkBrokenError(resolved.url, `Server returned ${response.status}`);
  }
  if (!response.body) {
    throw new LinkBrokenError(resolved.url, 'Server returned an empty body');
  }

  // If we asked to resume but the server ignored it, start from scratch.
  const resumed = startByte > 0 && response.status === 206;
  if (startByte > 0 && !resumed) startByte = 0;

  let downloaded = startByte;
  const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  source.on('data', (chunk: Buffer) => {
    downloaded += chunk.length;
    onProgress?.(downloaded, resolved.size);
  });

  const sink = createWriteStream(destination, resumed ? { flags: 'a' } : { flags: 'w' });
  await pipeline(source, sink, ...(signal ? [{ signal }] : []));

  return { path: destination, bytes: downloaded };
}
