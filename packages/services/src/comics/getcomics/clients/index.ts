/**
 * Resolve a GetComics button link into something streamable.
 *
 * GetComics proxies several hosts through its own `/dls/<token>` URLs, so the
 * host is decided by the button label (see `groups.ts`) and the link is only
 * followed here. Both supported hosts end up as ordinary range-capable HTTP
 * responses; see NOTICE.md for why the others aren't implemented.
 */

import type { DownloadHost } from '@shelvarr/types';
import {
  LinkBrokenError,
  resolveDirectDownload,
  type ResolvedDownload,
} from './direct';

export {
  LinkBrokenError,
  DownloadLimitReachedError,
  resolveDirectDownload,
  downloadToFile,
  filenameFromDisposition,
  filenameFromUrl,
  type ResolvedDownload,
  type DownloadResult,
  type DownloadToFileOptions,
} from './direct';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const PIXELDRAIN_FILE = /pixeldrain\.com\/u\/([A-Za-z0-9]+)/;
const PIXELDRAIN_LIST = /pixeldrain\.com\/l\/([A-Za-z0-9]+)/;

/**
 * Pixeldrain's share pages are a web app; the file itself lives behind the
 * public API. Follow the GetComics redirect to find the share id, then rewrite
 * it to the API URL.
 */
export async function resolvePixeldrain(
  link: string,
  signal?: AbortSignal
): Promise<ResolvedDownload> {
  let finalUrl = link;

  if (!PIXELDRAIN_FILE.test(link) && !PIXELDRAIN_LIST.test(link)) {
    const response = await fetch(link, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
      ...(signal ? { signal } : {}),
    });
    await response.arrayBuffer().catch(() => undefined);
    finalUrl = response.url || link;
  }

  const file = PIXELDRAIN_FILE.exec(finalUrl);
  if (file?.[1]) {
    return resolveDirectDownload(
      `https://pixeldrain.com/api/file/${file[1]}?download`,
      signal
    );
  }

  // A list is a folder of files; picking one automatically would be a guess,
  // so treat it as unusable and let the next link in the group be tried.
  if (PIXELDRAIN_LIST.test(finalUrl)) {
    throw new LinkBrokenError(link, 'Pixeldrain folder links are not supported');
  }

  throw new LinkBrokenError(link, `Not a Pixeldrain link: ${finalUrl}`);
}

/** Hosts `resolveDownload` can handle. */
export const RESOLVABLE_HOSTS: DownloadHost[] = ['getcomics', 'pixeldrain'];

export function isResolvable(host: DownloadHost): boolean {
  return RESOLVABLE_HOSTS.includes(host);
}

/**
 * Turn a button link into a direct, streamable URL.
 *
 * @throws LinkBrokenError when the link is dead, unsupported, or leads to a
 * landing page rather than a file.
 */
export async function resolveDownload(
  host: DownloadHost,
  link: string,
  signal?: AbortSignal
): Promise<ResolvedDownload> {
  switch (host) {
    case 'pixeldrain':
      return resolvePixeldrain(link, signal);
    case 'getcomics':
      return resolveDirectDownload(link, signal);
    default:
      throw new LinkBrokenError(link, `Downloads from ${host} are not supported`);
  }
}
