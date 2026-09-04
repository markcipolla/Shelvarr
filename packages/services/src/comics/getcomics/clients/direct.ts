/**
 * Streaming HTTP download with redirect following and range resume.
 *
 * Stands in for Kapowarr's `BaseDirectDownload` (GPL-3.0,
 * `backend/implementations/download_clients.py`) — see NOTICE.md — but is much
 * smaller, because the two hosts Shelvarr fetches from resolve to ordinary
 * range-capable HTTP responses.
 */

import { createWriteStream, existsSync, statSync, unlinkSync } from 'fs';
import { dirname } from 'path';
import { mkdir } from 'fs/promises';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const PROBE_TIMEOUT_MS = 30_000;

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

const filenameStarRegex = /filename\*\s*=\s*[^']*'[^']*'([^;]+)/i;
const filenameRegex = /filename\s*=\s*("([^"]*)"|([^;]+))/i;

/** Pull a filename out of a Content-Disposition header. */
export function filenameFromDisposition(disposition: string | null): string | null {
  if (!disposition) return null;

  const encoded = filenameStarRegex.exec(disposition);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      return encoded[1].trim();
    }
  }

  const plain = filenameRegex.exec(disposition);
  const value = plain?.[2] ?? plain?.[3];
  return value ? value.trim() : null;
}

/** Last path segment of a URL, percent-decoded, minus any query string. */
export function filenameFromUrl(url: string): string {
  const path = url.split('?')[0]!.split('#')[0]!;
  const segment = path.split('/').filter(Boolean).pop() ?? 'download';
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Ask a URL for its first byte: cheap, and the response says where the link
 * really lands, how big the file is, and whether resume will work.
 *
 * Kept separate from `describeDownload` so a caller that only wants the final
 * URL — the Pixeldrain resolver, following GetComics' redirect to a share
 * page — can read it without the page being rejected as HTML first.
 *
 * @throws LinkBrokenError when the host is unreachable or refuses the request.
 */
export async function probeDownload(link: string, signal?: AbortSignal): Promise<Response> {
  const timeout = AbortSignal.timeout(PROBE_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(link, {
      headers: { 'User-Agent': USER_AGENT, Range: 'bytes=0-0' },
      redirect: 'follow',
      signal: combined,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new LinkBrokenError(link, `Could not reach ${link}: ${String(error)}`);
  }

  // Drain the probe body so the socket can be reused.
  await response.arrayBuffer().catch(() => undefined);

  if (response.status === 429) throw new DownloadLimitReachedError(new URL(link).hostname);
  if (!response.ok) throw new LinkBrokenError(link, `Server returned ${response.status}`);

  return response;
}

/**
 * Read a probe response as a streamable download.
 *
 * @throws LinkBrokenError when what came back is a web page rather than a file.
 */
export function describeDownload(link: string, response: Response): ResolvedDownload {
  const contentType = response.headers.get('content-type');
  if (contentType?.startsWith('text/html')) {
    // A landing page, not a file — the link needs an interaction we don't do.
    throw new LinkBrokenError(link, 'Link resolves to a web page, not a file');
  }

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
    url: response.url || link,
    filename:
      filenameFromDisposition(response.headers.get('content-disposition')) ??
      filenameFromUrl(response.url || link),
    size: size !== null && Number.isFinite(size) ? size : null,
    supportsRange:
      response.status === 206 || response.headers.get('accept-ranges') === 'bytes',
    contentType,
  };
}

/** Probe a link and read the result as a download, in one step. */
export async function resolveDirectDownload(
  link: string,
  signal?: AbortSignal
): Promise<ResolvedDownload> {
  return describeDownload(link, await probeDownload(link, signal));
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
