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
  describeDownload,
  probeDownload,
  resolveDirectDownload,
  type ResolvedDownload,
} from './direct';

export {
  LinkBrokenError,
  DownloadLimitReachedError,
  describeDownload,
  probeDownload,
  resolveDirectDownload,
  downloadToFile,
  filenameFromDisposition,
  filenameFromUrl,
  type ResolvedDownload,
  type DownloadResult,
  type DownloadToFileOptions,
} from './direct';

const PIXELDRAIN_FILE = /pixeldrain\.com\/u\/([A-Za-z0-9]+)/;
const PIXELDRAIN_LIST = /pixeldrain\.com\/l\/([A-Za-z0-9]+)/;

/** A folder of files: picking one automatically would be a guess. */
const FOLDER_UNSUPPORTED = 'Pixeldrain folder links are not supported';

/** Pixeldrain's share pages are a web app; the file lives behind the API. */
const apiUrl = (id: string) => `https://pixeldrain.com/api/file/${id}?download`;

/**
 * Resolve a link the article labelled as Pixeldrain.
 *
 * The label is not a promise. GetComics puts its own `/dls/` URL behind most
 * buttons, and where that redirect ends is only knowable by following it: some
 * land on a Pixeldrain share page, which has to be rewritten to the API URL
 * before it will yield bytes, and some are GetComics serving the file itself.
 * Both are downloads, so the probe decides rather than the button text — a
 * mislabelled button used to be discarded and blocklisted with "Not a
 * Pixeldrain link", losing a link that worked.
 */
export async function resolvePixeldrain(
  link: string,
  signal?: AbortSignal
): Promise<ResolvedDownload> {
  const known = PIXELDRAIN_FILE.exec(link);
  if (known?.[1]) return resolveDirectDownload(apiUrl(known[1]), signal);
  if (PIXELDRAIN_LIST.test(link)) throw new LinkBrokenError(link, FOLDER_UNSUPPORTED);

  const probe = await probeDownload(link, signal);
  const finalUrl = probe.url || link;

  const file = PIXELDRAIN_FILE.exec(finalUrl);
  if (file?.[1]) return resolveDirectDownload(apiUrl(file[1]), signal);
  if (PIXELDRAIN_LIST.test(finalUrl)) throw new LinkBrokenError(link, FOLDER_UNSUPPORTED);

  // Somewhere other than Pixeldrain. Take it if it is a file; `describeDownload`
  // raises the usual "resolves to a web page" if it is a landing page.
  return describeDownload(link, probe);
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
