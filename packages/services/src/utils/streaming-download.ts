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

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** The link doesn't lead to a file (dead, removed, or an error page). */
export class LinkBrokenError extends Error {
  constructor(readonly link: string, message?: string) {
    super(message ?? `Download link is broken: ${link}`);
    this.name = 'LinkBrokenError';
  }
}

/** The host works but is rate-limiting us. Worth retrying later. */
export class DownloadLimitReachedError extends Error {
  constructor(readonly host: string) {
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
    throw new DownloadLimitReachedError(new URL(resolved.url).hostname);
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
