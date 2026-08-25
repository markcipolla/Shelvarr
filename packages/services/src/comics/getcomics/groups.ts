/**
 * Turn a GetComics article body into download groups: "this section of the
 * post is issues 1-25, and here are the buttons for it".
 *
 * Derived from Kapowarr (GPL-3.0) `backend/implementations/getcomics.py`
 * (`_get_download_groups` and friends) — see NOTICE.md. Kapowarr uses
 * BeautifulSoup; we do a positional scan of the markup instead, because the
 * structure we depend on is shallow (headers, buttons, `<hr>` separators) and
 * the article HTML is malformed enough that a real parser buys little.
 */

import type { DownloadGroup, DownloadHost, FilenameData } from '@shelvarr/types';
import { extractFilenameData } from './parse';
import { decodeHtmlEntities, normaliseYear, fixYear, stripTags } from './normalise';

/**
 * Button text (or `title` attribute) that identifies each host. Checked
 * longest-first so "pixel drain link" wins over "link".
 */
const HOST_TERMS: Record<DownloadHost, string[]> = {
  mega: ['mega', 'mega link'],
  mediafire: ['mediafire', 'mediafire link'],
  pixeldrain: ['pixeldrain', 'pixel drain', 'pixeldrain link', 'pixel drain link'],
  datanodes: ['datanodes', 'data nodes', 'datanodes link'],
  vikingfile: ['vikingfile', 'viking file', 'vikingfile link'],
  terabox: ['terabox', 'tera box', 'terabox link'],
  getcomics: [
    'getcomics', 'download now', 'main download', 'main server', 'main link',
    'mirror download', 'mirror server', 'mirror link', 'link 1', 'link 2',
  ],
};

/** Hosts we can actually fetch a file from. See NOTICE.md for why. */
export const SUPPORTED_HOSTS: DownloadHost[] = ['getcomics', 'pixeldrain'];

/** Default order to try hosts in. GetComics' own servers are fastest. */
export const DEFAULT_HOST_PREFERENCE: DownloadHost[] = [
  'getcomics', 'pixeldrain', 'datanodes', 'vikingfile', 'terabox', 'mega', 'mediafire',
];

/** Buttons that lead to a web reader or an unrelated service, never a file. */
const IGNORED_BUTTON_TERMS = ['read online', 'read now', 'view online'];

/** Link shorteners and dead services Kapowarr refuses outright. */
const BLOCKED_PREFIXES = ['https://sh.st/', 'https://torrentgalaxy.to/'];

/**
 * Identify which host a button points at. Matches on the button's label
 * first (GetComics proxies several hosts through its own `/dls/` URLs, so the
 * label is more informative than the URL), then falls back to the hostname.
 */
export function identifyHost(linkText: string, url: string): DownloadHost | null {
  const text = linkText.trim().toLowerCase();
  if (IGNORED_BUTTON_TERMS.some((term) => text.includes(term))) return null;

  for (const [host, terms] of Object.entries(HOST_TERMS) as Array<[DownloadHost, string[]]>) {
    if (terms.some((term) => text.includes(term))) return host;
  }

  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('pixeldrain.com')) return 'pixeldrain';
  if (lowerUrl.includes('datanodes.to')) return 'datanodes';
  if (lowerUrl.includes('vikingfile.com')) return 'vikingfile';
  if (lowerUrl.includes('terabox.com')) return 'terabox';
  if (lowerUrl.includes('mega.nz') || lowerUrl.includes('mega.co.nz')) return 'mega';
  if (lowerUrl.includes('mediafire.com')) return 'mediafire';
  if (lowerUrl.includes('getcomics.org/dls/')) return 'getcomics';
  return null;
}

interface Anchor {
  /** Character offset of the `<a` in the source HTML. */
  index: number;
  href: string;
  text: string;
}

const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
const hrefRegex = /\bhref\s*=\s*("([^"]*)"|'([^']*)')/i;
const titleAttrRegex = /\btitle\s*=\s*("([^"]*)"|'([^']*)')/i;

function findAnchors(html: string): Anchor[] {
  const anchors: Anchor[] = [];
  let match: RegExpExecArray | null;
  anchorRegex.lastIndex = 0;
  while ((match = anchorRegex.exec(html)) !== null) {
    const attrs = match[1] ?? '';
    const href = hrefRegex.exec(attrs);
    if (!href) continue;
    const rawHref = href[2] ?? href[3] ?? '';
    // The `title` attribute carries the host name even when the anchor's
    // text is an icon element.
    const titleAttr = titleAttrRegex.exec(attrs);
    const label = stripTags(match[2] ?? '').trim() ||
      decodeHtmlEntities(titleAttr?.[2] ?? titleAttr?.[3] ?? '');
    anchors.push({
      index: match.index,
      href: decodeHtmlEntities(rawHref).trim(),
      text: label,
    });
  }
  return anchors;
}

function isUsableLink(href: string): boolean {
  if (!href) return false;
  if (!href.startsWith('http') && !href.startsWith('magnet:?')) return false;
  return !BLOCKED_PREFIXES.some((prefix) => href.startsWith(prefix));
}

/**
 * A group header: the centred `<p>` that names the release and lists
 * "Language / Image Format / Year / Size".
 */
interface Header {
  index: number;
  /** Where the header's markup ends — buttons after this belong to it. */
  end: number;
  subTitle: string;
  info: FilenameData;
}

const paragraphRegex = /<p\b[^>]*>([\s\S]*?)(?=<p\b|<hr\b|<\/p>|$)/gi;
const listItemRegex = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;

/**
 * Split a fragment into its text nodes, the way BeautifulSoup's
 * `get_text(separator)` would. Kapowarr relies on the first text node being
 * the release name.
 */
function textNodes(html: string): string[] {
  return html
    .split(/<[^>]*>/)
    .map((part) => decodeHtmlEntities(part).trim())
    .filter((part) => part !== '');
}

function buildInfo(title: string): FilenameData {
  return extractFilenameData(title, { assumeVolumeNumber: false, fixYear: true });
}

/**
 * Headers are the paragraphs that describe a release — Kapowarr keys off the
 * word "Language", which GetComics puts in every one of them.
 */
function findHeaders(html: string): Header[] {
  const headers: Header[] = [];
  let match: RegExpExecArray | null;
  paragraphRegex.lastIndex = 0;
  while ((match = paragraphRegex.exec(html)) !== null) {
    const body = match[1] ?? '';
    if (!body.includes('Language')) continue;

    const parts = textNodes(body);
    const subTitle = parts[0] ?? '';
    if (!subTitle) continue;

    const info = buildInfo(subTitle);
    if (info.specialVersion === 'cover') continue;

    // The release title often omits the year while the metadata line has it.
    if (info.year === null) {
      const yearPart = parts.findIndex((p) => p.startsWith('Year'));
      if (yearPart !== -1) {
        const value = parts[yearPart + 1];
        const year = value ? normaliseYear(value.split('|')[0]!.split('-')[0]!) : null;
        if (year !== null) info.year = fixYear(year);
      }
    }

    headers.push({
      index: match.index,
      end: match.index + match[0].length,
      subTitle,
      info,
    });
  }
  return headers;
}

/**
 * Extract the big-button download groups: a header paragraph followed by
 * `aio-button-center` anchors, terminated by an `<hr>`.
 */
function extractButtonGroups(html: string): DownloadGroup[] {
  const headers = findHeaders(html);
  if (headers.length === 0) return [];

  const separators = [...html.matchAll(/<hr\b[^>]*>/gi)].map((m) => m.index);
  const anchors = findAnchors(html);

  return headers
    .map((header, position) => {
      const nextHeader = headers[position + 1]?.index ?? Infinity;
      const nextSeparator = separators.find((index) => index >= header.end) ?? Infinity;
      const boundary = Math.min(nextHeader, nextSeparator);

      const links: DownloadGroup['links'] = {};
      for (const anchor of anchors) {
        if (anchor.index < header.end || anchor.index >= boundary) continue;
        if (!isUsableLink(anchor.href)) continue;
        const host = identifyHost(anchor.text, anchor.href);
        if (!host) continue;
        (links[host] ??= []).push(anchor.href);
      }

      return { subTitle: header.subTitle, info: header.info, links };
    })
    .filter((group) => Object.keys(group.links).length > 0);
}

/**
 * Extract groups laid out as a list — one `<li>` per release, with the links
 * inline. Older posts use this shape.
 */
function extractListGroups(html: string): DownloadGroup[] {
  const groups: DownloadGroup[] = [];
  let match: RegExpExecArray | null;
  listItemRegex.lastIndex = 0;
  while ((match = listItemRegex.exec(html)) !== null) {
    const body = match[1] ?? '';
    const subTitle = textNodes(body)[0] ?? '';
    if (!subTitle) continue;

    const info = buildInfo(subTitle);
    if (info.specialVersion === 'cover') continue;

    const links: DownloadGroup['links'] = {};
    for (const anchor of findAnchors(body)) {
      if (!isUsableLink(anchor.href)) continue;
      const host = identifyHost(anchor.text, anchor.href);
      if (!host) continue;
      (links[host] ??= []).push(anchor.href);
    }

    if (Object.keys(links).length > 0) groups.push({ subTitle, info, links });
  }
  return groups;
}

/**
 * Parse an article body into download groups, with each group's links ordered
 * by host preference.
 */
export function extractDownloadGroups(
  contentHtml: string,
  hostPreference: DownloadHost[] = DEFAULT_HOST_PREFERENCE
): DownloadGroup[] {
  const groups = [...extractButtonGroups(contentHtml), ...extractListGroups(contentHtml)];

  const rank = (host: DownloadHost) => {
    const index = hostPreference.indexOf(host);
    return index === -1 ? hostPreference.length : index;
  };

  return groups.map((group) => ({
    ...group,
    links: Object.fromEntries(
      (Object.entries(group.links) as Array<[DownloadHost, string[]]>).sort(
        ([a], [b]) => rank(a) - rank(b)
      )
    ) as DownloadGroup['links'],
  }));
}
