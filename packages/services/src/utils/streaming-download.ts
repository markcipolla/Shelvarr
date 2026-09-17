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

import { createHash, type Hash } from 'crypto';
import { createReadStream, createWriteStream, existsSync, statSync, unlinkSync } from 'fs';
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

/** Which check a downloaded file failed. */
export type VerificationFailure =
  /** Fewer bytes arrived than the server said the file has. */
  | 'truncated'
  /** The first bytes aren't the signature the extension calls for. */
  | 'wrong-file-type'
  /** The bytes hash to something other than the md5 the search result carried. */
  | 'md5-mismatch';

/**
 * The bytes arrived, but they aren't the file we asked for (E1-5). Deliberately
 * *not* a subclass of `LinkBrokenError`: the link resolved and the host served
 * something, so the two say different things about a mirror — even though both
 * mean "give up on this one and try the next".
 */
export class FileVerificationError extends Error {
  constructor(
    readonly link: string,
    readonly reason: VerificationFailure,
    message: string
  ) {
    super(message);
    this.name = 'FileVerificationError';
  }
}

/**
 * Magic bytes by file extension. Only the formats Shelvarr actually downloads
 * are listed; an extension that isn't here simply isn't sniffed, so adding a
 * new one is additive rather than a behaviour change for the rest.
 */
const MAGIC_SIGNATURES: Record<string, { bytes: readonly number[]; label: string }> = {
  // epub and cbz are both ZIP containers.
  epub: { bytes: [0x50, 0x4b, 0x03, 0x04], label: 'PK\\x03\\x04 (a ZIP container)' },
  cbz: { bytes: [0x50, 0x4b, 0x03, 0x04], label: 'PK\\x03\\x04 (a ZIP container)' },
  zip: { bytes: [0x50, 0x4b, 0x03, 0x04], label: 'PK\\x03\\x04 (a ZIP container)' },
  pdf: { bytes: [0x25, 0x50, 0x44, 0x46], label: '%PDF' },
};

/** The signature an extension's files must start with, or null if unknown. */
function signatureFor(extension: string | null | undefined): { bytes: Buffer; label: string } | null {
  if (!extension) return null;
  const signature = MAGIC_SIGNATURES[extension.toLowerCase().replace(/^\./, '')];
  return signature ? { bytes: Buffer.from(signature.bytes), label: signature.label } : null;
}

/**
 * What a caller knows about the file *before* it arrives, so the download can
 * be checked against it. Opt-in per call: comics resolve from GetComics posts
 * that carry no hash and no reliable extension, so they pass nothing here and
 * behave exactly as they did before E1-5.
 */
export interface DownloadVerification {
  /**
   * Lowercase hex md5 the complete file must hash to. LibGen and Anna's
   * results carry a real one; Z-Library's identifier is a numeric book id, so
   * callers must only pass a value that is genuinely a hash.
   */
  md5?: string | null;
  /** Extension whose magic bytes the file must start with (`epub`, `cbz`, `pdf`). */
  extension?: string | null;
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
  /**
   * What the finished file has to be, checked while the bytes stream past
   * (E1-5). Omitted — as the comic pipeline omits it — nothing is verified.
   */
  verify?: DownloadVerification;
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

/** How many leading bytes are kept for magic-byte sniffing. */
const SNIFF_BYTES = 8;

/**
 * Feed bytes already on disk into a running hash, returning the file's first
 * bytes for sniffing. Resuming a partial file means the stream only carries
 * the tail, so the head has to be read back to hash the whole thing.
 */
async function digestExistingBytes(file: string, hash: Hash | null): Promise<Buffer> {
  let head: Buffer = Buffer.alloc(0);
  for await (const chunk of createReadStream(file) as AsyncIterable<Buffer>) {
    hash?.update(chunk);
    if (head.length < SNIFF_BYTES) {
      head = Buffer.concat([head, chunk]).subarray(0, SNIFF_BYTES);
    }
  }
  return head;
}

/**
 * Stream a resolved download to `destination`, resuming from a partial file
 * when the server supports it.
 *
 * With `options.verify` set (E1-5), the bytes are hashed as they go and
 * checked against the md5 the search result carried, the first bytes are
 * sniffed against the extension's magic signature, and a stream that stops
 * short of the advertised size is rejected. Any of those failing throws
 * `FileVerificationError` and deletes the file, so a bad mirror can never
 * leave something importable behind.
 */
export async function downloadToFile(
  resolved: ResolvedDownload,
  destination: string,
  options: DownloadToFileOptions = {}
): Promise<DownloadResult> {
  const { onProgress, signal, resume = true, verify } = options;

  const verifying = verify !== undefined;
  const expectedMd5 = verify?.md5 ? verify.md5.trim().toLowerCase() : null;
  const signature = signatureFor(verify?.extension);

  /** Bin a file that failed verification: it is not worth resuming or keeping. */
  const discard = (): void => {
    try { unlinkSync(destination); } catch { /* nothing to remove */ }
  };

  /** Bin the file — it is not the file — and hand the caller a typed error. */
  const rejectFile = (reason: VerificationFailure, message: string): FileVerificationError => {
    discard();
    return new FileVerificationError(resolved.url, reason, message);
  };

  /**
   * Compare the first bytes seen so far against the expected signature, once
   * there are enough of them to tell. Returns null while still undecided.
   * Deliberately does not delete anything: mid-stream the write stream may
   * not even have opened the file yet, so the deleting is left to whoever
   * catches the error once the pipeline has torn down.
   */
  const sniff = (head: Buffer): FileVerificationError | null => {
    if (!signature || head.length < signature.bytes.length) return null;
    if (head.subarray(0, signature.bytes.length).equals(signature.bytes)) return null;
    return new FileVerificationError(
      resolved.url,
      'wrong-file-type',
      `File does not start with ${signature.label} — it is not ${verify?.extension} ` +
        `(got ${head.subarray(0, signature.bytes.length).toString('hex')})`
    );
  };

  await mkdir(dirname(destination), { recursive: true });

  let startByte = 0;
  if (resume && resolved.supportsRange && existsSync(destination)) {
    const existing = statSync(destination).size;
    // A file that's already complete needs no work; an over-long one is
    // corrupt, so start again.
    if (resolved.size !== null && existing === resolved.size) {
      // Complete-length is not the same as correct: a partial left by an
      // earlier run against a bad mirror can be exactly the right size and
      // still be junk, so it gets the same checks a fresh stream would.
      if (verifying) {
        const completeHash = expectedMd5 ? createHash('md5') : null;
        const head = await digestExistingBytes(destination, completeHash);
        const badMagic = sniff(head);
        if (badMagic) {
          discard();
          throw badMagic;
        }
        if (completeHash && expectedMd5) {
          const digest = completeHash.digest('hex');
          if (digest !== expectedMd5) {
            throw rejectFile(
              'md5-mismatch',
              `Existing file hashes to ${digest}, expected ${expectedMd5}`
            );
          }
        }
      }
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

  // A resumed download only streams the tail, so the hash and the sniff
  // window have to be primed from what is already on disk. A restarted one
  // overwrites that file, so it starts clean.
  const hash = verifying && expectedMd5 ? createHash('md5') : null;
  let head: Buffer = Buffer.alloc(0);
  if (verifying && resumed) {
    head = await digestExistingBytes(destination, hash);
    const badMagic = sniff(head);
    if (badMagic) {
      discard();
      throw badMagic;
    }
  }

  let downloaded = startByte;
  const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  source.on('data', (chunk: Buffer) => {
    downloaded += chunk.length;
    if (hash) hash.update(chunk);
    if (signature && head.length < SNIFF_BYTES) {
      head = Buffer.concat([head, chunk]).subarray(0, SNIFF_BYTES);
      // Stop the moment the file announces itself as something else — an
      // error page or the wrong file is worth abandoning now, not after
      // pulling a few hundred megabytes of it.
      const badMagic = sniff(head);
      if (badMagic) {
        source.destroy(badMagic);
        return;
      }
    }
    onProgress?.(downloaded, resolved.size);
  });

  const sink = createWriteStream(destination, resumed ? { flags: 'a' } : { flags: 'w' });
  try {
    await pipeline(source, sink, ...(signal ? [{ signal }] : []));
  } catch (err) {
    // A sniff that tripped mid-stream surfaces here as the
    // FileVerificationError the data handler destroyed the source with; now
    // that both streams have torn down, the bytes it rejected can go. Every
    // other stream failure keeps its partial for a later resume.
    if (err instanceof FileVerificationError) discard();
    throw err;
  }

  if (verifying) {
    if (resolved.size !== null && downloaded !== resolved.size) {
      throw rejectFile(
        'truncated',
        `Download stopped at ${downloaded} of ${resolved.size} bytes`
      );
    }
    if (signature && head.length < signature.bytes.length) {
      throw rejectFile(
        'wrong-file-type',
        `File is only ${downloaded} bytes — too short to be ${verify?.extension}`
      );
    }
    if (hash && expectedMd5) {
      const digest = hash.digest('hex');
      if (digest !== expectedMd5) {
        throw rejectFile('md5-mismatch', `File hashes to ${digest}, expected ${expectedMd5}`);
      }
    }
  }

  return { path: destination, bytes: downloaded };
}
