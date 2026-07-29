/**
 * Minimal EPUB text extraction for narration.
 * Walks the OPF spine in reading order and returns speakable plain text per chapter.
 */

import { readFileSync } from 'fs';
import { unzipSync, strFromU8 } from 'fflate';

export interface EpubChapter {
  /** 1-based position in reading order. */
  index: number;
  title: string;
  text: string;
}

/**
 * Spine documents shorter than this are covers, blank pages and section
 * dividers — narrating them produces tracks of pure silence.
 */
const MIN_CHAPTER_CHARS = 100;

/** Decode the XML/HTML entities that survive tag stripping. */
function decodeEntities(input: string): string {
  return input
    .replace(/&(?:#39|apos);/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rsquo;/g, '’')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // Ampersand last, so decoded text is not decoded a second time.
    .replace(/&amp;/g, '&');
}

/** Strip XHTML down to plain text, preserving paragraph breaks. */
function htmlToText(html: string): string {
  const stripped = html
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  return decodeEntities(stripped)
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Read an attribute out of a single start tag. */
function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match?.[1] ?? null;
}

/** Resolve a manifest href against the OPF's own directory, collapsing `.`/`..`. */
function resolveHref(opfPath: string, href: string): string {
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const target = href.split('#')[0] ?? '';
  const parts: string[] = [];

  for (const segment of (base + decodeURIComponent(target)).split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }

  return parts.join('/');
}

/** Best-effort chapter heading: a top-level heading, else the document title. */
function chapterTitle(doc: string, fallbackIndex: number): string {
  const patterns = [
    /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i,
    /<title\b[^>]*>([\s\S]*?)<\/title>/i,
  ];

  for (const pattern of patterns) {
    const raw = doc.match(pattern)?.[1];
    if (!raw) continue;
    const title = decodeEntities(raw.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (title) return title.slice(0, 100);
  }

  return `Chapter ${fallbackIndex}`;
}

/**
 * Extract narratable chapters from an EPUB file, in reading order.
 * Throws if the file is not a readable EPUB.
 */
export function extractChapters(epubPath: string): EpubChapter[] {
  const files = unzipSync(new Uint8Array(readFileSync(epubPath)));
  const read = (entry: string): string | null => {
    const buf = files[entry];
    return buf ? strFromU8(buf) : null;
  };

  // container.xml points at the OPF package document.
  const container = read('META-INF/container.xml');
  if (!container) {
    throw new Error('Not a valid EPUB: missing META-INF/container.xml');
  }

  const rootfile = container.match(/<rootfile\b[^>]*>/i)?.[0] ?? '';
  const opfPath = attr(rootfile, 'full-path');
  if (!opfPath) {
    throw new Error('Not a valid EPUB: container.xml has no rootfile');
  }

  const opf = read(opfPath);
  if (!opf) {
    throw new Error(`Not a valid EPUB: missing package document ${opfPath}`);
  }

  // Manifest: item id -> href, limited to documents we can narrate.
  const manifest = new Map<string, string>();
  for (const tag of opf.match(/<item\b[^>]*>/gi) ?? []) {
    const id = attr(tag, 'id');
    const href = attr(tag, 'href');
    if (id && href && /x?html/i.test(attr(tag, 'media-type') ?? '')) {
      manifest.set(id, href);
    }
  }

  // Spine: the reading order.
  const spine = opf.match(/<spine\b[\s\S]*?<\/spine>/i)?.[0] ?? '';
  const chapters: EpubChapter[] = [];

  for (const itemref of spine.match(/<itemref\b[^>]*>/gi) ?? []) {
    const href = manifest.get(attr(itemref, 'idref') ?? '');
    if (!href) continue;

    const doc = read(resolveHref(opfPath, href));
    if (!doc) continue;

    const text = htmlToText(doc);
    if (text.length < MIN_CHAPTER_CHARS) continue;

    const index = chapters.length + 1;
    chapters.push({ index, title: chapterTitle(doc, index), text });
  }

  if (chapters.length === 0) {
    throw new Error('No readable text found in EPUB');
  }

  return chapters;
}
