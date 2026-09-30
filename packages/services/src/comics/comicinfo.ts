/**
 * Read the `ComicInfo.xml` that is already inside a comic archive.
 *
 * ComicInfo.xml is the de facto standard for comic metadata — ComicRack,
 * Mylar, Komga and most taggers write one into the CBZ/CBR — and a large
 * share of the archives people bring to Shelvarr already carry one. Until
 * now the scanner ignored it entirely and guessed everything from the
 * filename (`getcomics/parse.ts`), which is choosing the worse source on
 * purpose when the archive is holding `<Series>Batman</Series>
 * <Number>1</Number>` right there.
 *
 * **No XML parser.** ComicInfo.xml is a flat one-level list of elements
 * under a single root, with no mixed content and no nesting that matters to
 * us, so a tag-extraction helper is the proportionate tool and an XML
 * dependency would be a new supply-chain surface bought for nothing. What
 * the helper does have to survive is the mess real taggers produce:
 * entities, CDATA, self-closing elements, attributes on the tags, and
 * namespace prefixes. It never throws — a file on someone's disk is not our
 * input to validate, it is a fact to cope with.
 *
 * **Which fields.** Only the four the scanner can actually act on. Writers,
 * pencillers, summary, page count and the rest of the schema are real and
 * readable, but Shelvarr has nowhere to put them: issue metadata comes from
 * ComicVine and the `comic_files` table records a path, a size and a type.
 * Reading fields that get dropped on the floor is code with no caller.
 * Writing metadata *back* into files is a separate card (E7-6) and the field
 * list can grow when there is something to do with it.
 */

import type { FilenameData } from '@shelvarr/types';

import { extractComicEntry } from './archive';
import { extractIssueNumber, extractVolumeNumber } from './getcomics/parse';
import { createLogger } from '../utils/logger';

const log = createLogger('comics-comicinfo');

/** What a ComicInfo.xml tells us that the scanner can use. */
export interface ComicInfo {
  /** `<Series>` — the series title, as the tagger recorded it. */
  series: string | null;
  /** `<Volume>` when it reads as a volume number rather than a year. */
  volumeNumber: number | [number, number] | null;
  /** `<Year>`, or a `<Volume>` that is obviously a year. */
  year: number | null;
  /**
   * `<Number>` verbatim — `"1"`, `"0.5"`, `"1-3"`, `"½"`. Left as a string
   * so `extractIssueNumber` can apply the same conversion it applies to a
   * number scraped out of a filename.
   */
  number: string | null;
  /** `<Title>` — the issue's own title, if the tagger recorded one. */
  title: string | null;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Resolve the five predefined entities and numeric character references. */
function unescapeXml(text: string): string {
  return text.replace(/&(#[Xx]?[0-9A-Fa-f]+|[A-Za-z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      return String.fromCodePoint(code);
    }
    // Anything else (&nbsp;, a DTD entity) is left as written rather than
    // guessed at — the tagger meant something by it and we would only be
    // inventing a replacement.
    return NAMED_ENTITIES[body] ?? whole;
  });
}

/**
 * Decode element content: entities everywhere except inside CDATA, whose
 * whole point is that `&` and `<` in it are literal.
 */
function decodeContent(raw: string): string {
  let out = '';
  let rest = raw;
  for (;;) {
    const start = rest.indexOf('<![CDATA[');
    if (start === -1) return out + unescapeXml(rest);

    out += unescapeXml(rest.slice(0, start));
    const end = rest.indexOf(']]>', start);
    if (end === -1) return out + rest.slice(start + 9); // Unterminated: take the rest.
    out += rest.slice(start + 9, end);
    rest = rest.slice(end + 3);
  }
}

/**
 * The trimmed text of the first `<tag>`, or `null` when it is absent, empty
 * or self-closing. Tolerates attributes and a namespace prefix on the tag.
 */
function tagText(xml: string, tag: string): string | null {
  const pattern = `<(?:[A-Za-z0-9_.-]+:)?${tag}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</(?:[A-Za-z0-9_.-]+:)?${tag}\\s*>)`;
  const match = new RegExp(pattern, 'i').exec(xml);
  if (!match || match[1] === undefined) return null;
  const value = decodeContent(match[1]).trim();
  return value === '' ? null : value;
}

/** Sanity bounds for reading a `<Volume>` as a year rather than a number. */
const EARLIEST_PLAUSIBLE_YEAR = 1900;

function tagYear(xml: string, tag: string): number | null {
  const raw = tagText(xml, tag);
  if (raw === null) return null;
  const year = parseInt(raw, 10);
  if (!Number.isFinite(year)) return null;
  return year >= EARLIEST_PLAUSIBLE_YEAR && year <= new Date().getFullYear() + 1 ? year : null;
}

/**
 * Parse a ComicInfo.xml document. Returns `null` when the string is not a
 * ComicInfo at all, or is one that says nothing we can use — a ComicInfo
 * with every field blank is worth exactly as much as no ComicInfo, and
 * collapsing the two here keeps every caller from having to check.
 *
 * Never throws: the argument is whatever happened to be inside someone's
 * archive.
 */
export function parseComicInfo(xml: string): ComicInfo | null {
  if (typeof xml !== 'string') return null;
  if (!/<(?:[A-Za-z0-9_.-]+:)?ComicInfo[\s/>]/i.test(xml)) return null;

  // <Volume> is ambiguous in the wild. ComicRack's schema means "the volume
  // number of the series", and that is what Mylar and Komga write; a large
  // minority of taggers (and ComicVine-derived tooling, which calls a
  // series' start year its "volume") write a four-digit year instead. We
  // decide by magnitude: anything that reads as a plausible year is treated
  // as one and left to the year field, anything else is a volume number.
  //
  // Being wrong in either direction is survivable, because `matchVolumeNumber`
  // (getcomics/match.ts) already accepts a volume number that equals the
  // volume's *year* as a match — the ambiguity predates this module and the
  // matcher was built to absorb it. What this mapping buys is not correctness
  // in the matcher so much as not claiming "volume 2016" in the data.
  const volumeRaw = tagText(xml, 'Volume');
  const volumeAsYear = tagYear(xml, 'Volume');
  const volumeNumber = volumeAsYear === null ? extractVolumeNumber(volumeRaw) : null;

  const info: ComicInfo = {
    series: tagText(xml, 'Series'),
    volumeNumber,
    // <Year> is the cover date's year and the better answer when both exist.
    year: tagYear(xml, 'Year') ?? volumeAsYear,
    number: tagText(xml, 'Number'),
    title: tagText(xml, 'Title'),
  };

  const empty =
    info.series === null &&
    info.volumeNumber === null &&
    info.year === null &&
    info.number === null &&
    info.title === null;
  return empty ? null : info;
}

/** Archive formats we can look inside. */
const READABLE_EXTENSIONS = new Set(['cbz', 'zip', 'cbr', 'rar']);

/**
 * Read and parse the ComicInfo.xml out of a comic archive, or `null` when
 * there isn't one, the archive is unreadable, or the format isn't one we can
 * open (7z, tar, PDF and EPUB are not handled — the archive back-ends in
 * `archive.ts` don't cover them either).
 *
 * Matched case-insensitively and at any depth, because taggers disagree on
 * both (`comicinfo.xml`, `ComicInfo.XML`, `Batman 001/ComicInfo.xml`).
 *
 * **Cost.** The scanner calls this for every file in a volume folder, so
 * "just extract the archive" would turn a scan of a 100-issue volume into a
 * hundred full decompressions. It doesn't: `extractComicEntry` filters at
 * the entry level, so a CBZ inflates one small XML file out of the central
 * directory and a CBR extracts one member instead of two hundred pages, and
 * it reads and inflates asynchronously so a long scan never holds the event
 * loop. That is cheap enough that CBR does not need excluding.
 *
 * It is not free, though: a scan that used to `stat` each file now reads
 * each one. The bytes are the floor on what this card costs, and it is paid
 * on every scan of every volume rather than once — if that turns out to
 * matter, remembering the answer against the file's size and mtime (the way
 * `comics/pages.ts` keys its cache) is the obvious next move, and is not
 * built here because nothing has measured it yet.
 */
export async function readComicInfo(filepath: string, ext: string): Promise<ComicInfo | null> {
  const format = ext.toLowerCase().replace(/^\./, '');
  if (!READABLE_EXTENSIONS.has(format)) return null;

  let entry: Uint8Array | null;
  try {
    entry = await extractComicEntry(filepath, format, (name) =>
      /(^|[/\\])comicinfo\.xml$/i.test(name)
    );
  } catch (error) {
    // A truncated download, a password-protected RAR, a file that is not
    // really an archive. None of that should stop a scan: the filename is
    // still there to parse.
    log.debug('Could not read ComicInfo.xml', { filepath, error });
    return null;
  }

  if (!entry) return null;
  return parseComicInfo(new TextDecoder('utf-8').decode(entry));
}

/**
 * Overlay a file's ComicInfo onto what its filename said, field by field.
 *
 * Per-field rather than wholesale, because ComicInfo.xml is routinely
 * half-filled: a tagger that recorded `<Series>` but left `<Number>` empty
 * should still get its issue number from `Batman 001.cbz`. Fields ComicInfo
 * says nothing about (`specialVersion`, `annual`) stay as the filename
 * parser left them — it reads the whole path including the folder, which is
 * information no ComicInfo has.
 */
export function applyComicInfo(fromFilename: FilenameData, info: ComicInfo | null): FilenameData {
  if (!info) return fromFilename;

  const issueNumber = info.number === null ? null : extractIssueNumber(info.number);

  return {
    ...fromFilename,
    series: info.series ?? fromFilename.series,
    year: info.year ?? fromFilename.year,
    volumeNumber: info.volumeNumber ?? fromFilename.volumeNumber,
    issueNumber: issueNumber ?? fromFilename.issueNumber,
  };
}
