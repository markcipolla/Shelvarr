/**
 * Resolving a GetComics button link into something streamable.
 *
 * The actual byte-streaming (`downloadToFile`) and the types around it live
 * in `utils/streaming-download.ts` (E2-2) — they are generic across sources,
 * and LibGen's downloader uses them too. This module keeps only what is
 * specific to interpreting a GetComics button link: following its redirect,
 * and deciding whether what it lands on is a file GetComics served directly
 * or a Pixeldrain share page.
 *
 * Re-exports the shared streaming pieces below so nothing importing them from
 * here (or from `./index`) needs to change.
 */

import {
  DownloadLimitReachedError,
  USER_AGENT,
  downloadToFile,
  LinkBrokenError,
  type DownloadResult,
  type DownloadToFileOptions,
  type ResolvedDownload,
} from '../../../utils/streaming-download';

export {
  DownloadLimitReachedError,
  downloadToFile,
  LinkBrokenError,
  type DownloadResult,
  type DownloadToFileOptions,
  type ResolvedDownload,
};

const PROBE_TIMEOUT_MS = 30_000;

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
