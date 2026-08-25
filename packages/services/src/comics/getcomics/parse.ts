/**
 * Extract comic data (series, year, volume number, issue number, special
 * version) from a string — a filepath, filename, or GetComics post title.
 *
 * Derived from Kapowarr (GPL-3.0) `backend/base/file_extraction.py` —
 * see NOTICE.md. The regex heuristics are Kapowarr's; the control flow is a
 * direct translation. Two places need JS-specific handling, both marked
 * inline: Python's conditional group `(?(name)…)`, which JS lacks, and
 * Python's Unicode-aware `\b`, which JS's is not.
 *
 * `tests/unit/comics-parse.test.ts` runs Kapowarr's own extraction corpus
 * against this port; it passes all 91 cases.
 */

import type { FilenameData, IssueNumber, SpecialVersion } from '@shelvarr/types';
import {
  checkOverlappingPos,
  fixYear as fixBrokenYear,
  normaliseNumber,
  normaliseString,
} from './normalise';

const DIGITS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

/** a -> "01", b -> "02", … z -> "26". Lets `2b` sort just after `2`. */
const ALPHABET: Record<string, string> = Object.fromEntries(
  'abcdefghijklmnopqrstuvwxyz'
    .split('')
    .map((letter, index) => [letter, String(index + 1).padStart(2, '0')])
);

const ROMAN_DIGITS: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
};

const IMAGE_EXTENSIONS = ['.png', '.jpeg', '.jpg', '.webp', '.gif'];

const CONTENT_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  '.cbz', '.zip', '.cbr', '.rar', '.cb7', '.7zip', '.7z',
  '.cbt', '.epub', '.pdf', '.cba', '.mobi',
]);

const METADATA_FILES = new Set([
  'cvinfo.xml', 'comicinfo.xml', 'series.json', 'metadata.json',
]);

// region Regexes
const VOLUME_SNIPPET =
  String.raw`\b(?:(?:v(?:ol|olume))(?:\.\s|[.\-\s])?|v)(\d+(?:(?:-|\s-\s|\.-\.)\d+)?|(?<!v)I{1,3})`;
const YEAR_SNIPPET =
  String.raw`(?:(\d{4})(?:-\d{2}){0,2}|(\d{4})[\s.]?[-\s](?:[\s.]?\d{4})?|(?:\d{2}-){1,2}(\d{4})|(\d{4})[\s.\-_]Edition|(\d{4})-\d{4}\s{3}\d{4})`;
const ISSUE_SNIPPET =
  String.raw`(?!\d+(?:p|th|rd|st|\s?(?:gb|mb|kb)))(?<!')(?<!cv[\s\-_])(?:\d+(?:\.?[a-z0-9]+|[\s\-._]?[½¼])?|[½¼∞])`;
/**
 * Python's `\b` is Unicode-aware, so `½` counts as a word character; JS's is
 * not. Where a trailing `\b` follows a captured issue number it means "not
 * followed by another word character", so spell that out including the
 * vulgar fractions. Without this, `#6-7 ½` truncates to `6-7`.
 */
const ISSUE_TRAILING_BOUNDARY = String.raw`(?![0-9A-Za-z_½¼])`;

/** `(…)`, `[…]`, `{…}` — replaced with spaces so positions are preserved. */
const stripFilenameRegex = /\(.*?\)|\[.*?\]|\{.*?\}/gi;

// International "volume"/"issue" markers, translated to English before parsing.
const russianVolumeRegex = /Томa?[\s.]?(\d+)/gi;
const russianVolumeRegex2 = /(\d+)[\s.]?Томa?/gi;
const chineseVolumeRegex = /第(\d+)(?:卷|册)/gi;
const chineseVolumeRegex2 = /(?:卷|册)(\d+)/gi;
const koreanVolumeRegex = /제?(\d+)권/gi;
const japaneseVolumeRegex = /(\d+)巻/gi;
const frenchIssueRegex = /\bT(?:omes?)?(?=[\s.]?\d)/gi;

const specialVersionRegex =
  /(?:(?<!\s{3})\b|\()(?:(?<tpb>tpb|trade paper back)|(?<one_shot>os|one[ \-_]?shot)|(?<hard_cover>hc|hard[ \-_]?cover)|(?<omnibus>omnibus))(?:\b|\))/i;

const volumeRegex = new RegExp(VOLUME_SNIPPET, 'i');
const volumeFolderRegex = new RegExp(VOLUME_SNIPPET + String.raw`|^(\d+)$`, 'i');

const issueRegex1 = new RegExp(String.raw`\(_(-?` + ISSUE_SNIPPET + String.raw`)\)`, 'gi');
const issueRegex2 = new RegExp(
  String.raw`(?:(?<!\()(?:(?<![a-z])c(?!2c)|\bissues?|\bbooks?)(?!\))|\bno)(?:\.?[\s\-_]?|\s-\s)(?:#\s*)?(-?` +
    ISSUE_SNIPPET +
    String.raw`(?:(?:-|\s-\s|\.-\.)-?` + ISSUE_SNIPPET + String.raw`)?)` + ISSUE_TRAILING_BOUNDARY,
  'gi'
);
const issueRegex3 = new RegExp(
  String.raw`(?:annuals?[\s._])?(?<!part[\s._])(` + ISSUE_SNIPPET +
    String.raw`)[\s\-._]?\(?[\s\-._]?of[\s\-._]?` + ISSUE_SNIPPET +
    String.raw`(?![\s\-._]covers)\)?(?=\s|\.|_|(?=\()|$)`,
  'gi'
);
const issueRegex4 = new RegExp(
  String.raw`(?<!--)(?:annuals?[\s._])?(?<!pages\s)(?:#\s*)?(-?` + ISSUE_SNIPPET +
    String.raw`(?:-|\s-\s|\.-\.)` + ISSUE_SNIPPET + String.raw`)(?=\s|\.|_|(?=\()|$)`,
  'gi'
);
const issueRegex5 = new RegExp(
  String.raw`(?<!page\s)(?:annuals?[\s._])?#\s*(-?` + ISSUE_SNIPPET +
    String.raw`)` + ISSUE_TRAILING_BOUNDARY +
    String.raw`(?!(?:-|\s-\s|\.-\.)` + ISSUE_SNIPPET + String.raw`)`,
  'gi'
);
// Kapowarr's issue_regex_6 uses a conditional group — `(?(n_c)c\d+|\s\-)` —
// which JS regex does not support. Split into its two branches; both capture
// the number in group 1, so downstream handling is uniform.
const issueRegex6a = new RegExp(
  String.raw`^(-?` + ISSUE_SNIPPET + String.raw`)(?=\s-(?=\s|\.|_|(?=\()|$))`,
  'gi'
);
const issueRegex6b = new RegExp(
  String.raw`(?<=(?<!part)(?<!page)[\s._])n(-?` + ISSUE_SNIPPET +
    String.raw`)(?=c\d+(?=\s|\.|_|(?=\()|$))`,
  'gi'
);
const issueRegex7 = new RegExp(
  String.raw`(?:part[\s._]|annuals?[\s._]|(?<=[\s._])|^)(-?` + ISSUE_SNIPPET +
    String.raw`)(?![\s\-._]covers?)(?![\s\-._]of[\s\-._]\d+[\s\-._]covers?)(?=\s|\.|_|\(|$)`,
  'gi'
);

const yearRegex = new RegExp(
  String.raw`\((?:[a-z]+\.?\s)?` + YEAR_SNIPPET + String.raw`\)|--` + YEAR_SNIPPET +
    String.raw`--|__` + YEAR_SNIPPET + String.raw`__|, ` + YEAR_SNIPPET +
    String.raw`\s{3}|\b(?:(?:\d{2}-){1,2}(\d{4})|(\d{4})(?:-\d{2}){1,2})\b`,
  'gi'
);

const seriesRegex = /(^(\d+\.)?\s+|^\d+\s{3}|\s(?=\s)|[\s,]+$)/g;
/** If this matches, the release is *not* an annual. */
const annualRegex = /(?:\+|plus)[\s._]?annuals?|annuals?[\s._]?(?:\+|plus)|^((?!annuals?).)*$/i;
const annualPrefixRegex = /^annuals?[\s._]/i;
const coverRegex =
  /\b(?<!no[ \-_])(?<!hard[ \-_])(?<!\d[ \-_]covers)cover\b|n\d+c(\d+)|(?:\b|\d)i?fc\b|^folder$/i;
const revisionRegex = /^[1-3]\.\d$/;
// endregion

// region Number conversion
/**
 * Convert an issue number string into a float that sorts correctly.
 * `"3.5"` -> 3.5, `"3 ½"` -> 3.5, `"-10a"` -> -10.01.
 */
export function calculatedIssueNumber(issueNumber: string): number | null {
  if (/^\s*-?\d+(?:\.\d+)?\s*$/.test(issueNumber)) {
    return parseFloat(issueNumber);
  }

  let rest = normaliseNumber(issueNumber);
  let converted = '';
  if (rest.startsWith('-')) {
    converted = '-';
    rest = rest.slice(1);
  }

  let dot = true;
  for (const char of rest) {
    if (DIGITS.has(char)) {
      converted += char;
      continue;
    }

    if (char === '∞') {
      converted += '9999999999999';
    } else if (dot) {
      converted += '.';
      dot = false;
    }

    if (char === '½') converted += '5';
    else if (char === '¼') converted += '3';
    else if (ALPHABET[char]) converted += ALPHABET[char];
  }

  if (!converted.replace(/\./g, '')) return null;
  const result = parseFloat(converted);
  return Number.isFinite(result) ? result : null;
}

/**
 * Convert an issue number or range into a number or `[start, end]` pair.
 * `"2b"` -> 2.02, `"2½ - 4.5"` -> `[2.5, 4.5]`.
 */
export function extractIssueNumber(raw: string): IssueNumber {
  const issueNumber = raw.replace(/\//g, '-');
  if (!issueNumber.slice(1).includes('-')) {
    return calculatedIssueNumber(issueNumber);
  }

  const body = issueNumber.slice(1).replace(/ /g, '');
  const splitAt = body.indexOf('-');
  const start = issueNumber[0]! + body.slice(0, splitAt);
  const end = body.slice(splitAt + 1);

  const startDigit = start.replace(/^-+/, '')[0];
  const endDigit = end.replace(/^-+/, '')[0];
  if (!startDigit || !endDigit || !DIGITS.has(startDigit) || !DIGITS.has(endDigit)) {
    // Not actually a range after all — let the single-number path decide.
    return calculatedIssueNumber(issueNumber);
  }

  const calcStart = calculatedIssueNumber(start);
  const calcEnd = calculatedIssueNumber(end);
  if (calcStart !== null && calcEnd !== null) return [calcStart, calcEnd];
  if (calcStart !== null) return calcStart;
  if (calcEnd !== null) return calcEnd;
  return null;
}

/**
 * Convert a volume number or range into an int or `[start, end]` pair.
 * Roman numerals I-X are understood.
 */
export function extractVolumeNumber(
  raw: string | null | undefined
): number | [number, number] | null {
  if (raw === null || raw === undefined) return null;

  const roman = ROMAN_DIGITS[raw.toLowerCase()];
  const result = extractIssueNumber(roman !== undefined ? String(roman) : raw);

  if (result === null) return null;
  if (Array.isArray(result)) return [Math.trunc(result[0]), Math.trunc(result[1])];
  return Math.trunc(result);
}
// endregion

// region Filename data
function translateFilepath(filepath: string): string {
  let out = filepath.replace(frenchIssueRegex, 'Issue');
  if (out.includes('Том')) {
    out = out.replace(russianVolumeRegex, 'Volume $1').replace(russianVolumeRegex2, 'Volume $1');
  }
  if (out.includes('第') || out.includes('卷') || out.includes('册')) {
    out = out.replace(chineseVolumeRegex, 'Volume $1').replace(chineseVolumeRegex2, 'Volume $1');
  }
  if (out.includes('권')) out = out.replace(koreanVolumeRegex, 'Volume $1');
  if (out.includes('巻')) out = out.replace(japaneseVolumeRegex, 'Volume $1');
  return out;
}

function basename(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx === -1 ? p : p.slice(idx + 1);
}

function dirname(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx === -1 ? '' : p.slice(0, idx);
}

function extensionlessFilename(filepath: string): string {
  const name = basename(filepath);
  const dot = name.lastIndexOf('.');
  if (dot > 0 && CONTENT_EXTENSIONS.has(name.slice(dot).toLowerCase())) {
    return name.slice(0, dot);
  }
  return name;
}

interface IssueCandidate {
  value: string;
  start: number;
  end: number;
}

/** All matches of `regex` in `text`, starting the scan at `from`. */
function findAll(regex: RegExp, text: string, from = 0): RegExpExecArray[] {
  const scanner = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  scanner.lastIndex = from;
  const out: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  while ((match = scanner.exec(text)) !== null) {
    out.push(match);
    if (match.index === scanner.lastIndex) scanner.lastIndex += 1;
  }
  return out;
}

interface PosOption {
  text: string;
  /** Start scanning here (Python's `pos`). */
  from: number;
  regexes: RegExp[];
}

/**
 * Yield issue-number candidates in Kapowarr's preference order: matches
 * without a "part" prefix first, then rightmost-first.
 */
function* findIssueNumbers(
  posOptions: PosOption[],
  isAnnual: boolean
): Generator<IssueCandidate> {
  for (const option of posOptions) {
    for (const regex of option.regexes) {
      const matches = findAll(regex, option.text, option.from);
      if (matches.length === 0) continue;

      matches.sort((a, b) => {
        const aNoPart = !a[0].toLowerCase().includes('part');
        const bNoPart = !b[0].toLowerCase().includes('part');
        if (aNoPart !== bNoPart) return aNoPart ? -1 : 1;
        return b.index - a.index;
      });

      if (regex === issueRegex7) {
        // Disprefer what looks like a revision number ("1.5") at the very end.
        const scannedWholeString = option.from === 0;
        const isRevision = (m: RegExpExecArray) =>
          scannedWholeString && revisionRegex.test(m[0]);
        matches.sort((a, b) => Number(isRevision(a)) - Number(isRevision(b)));
      }

      for (const match of matches) {
        const complete = match[0].toLowerCase();
        let start = match.index;
        const end = match.index + match[0].length;

        if (complete.startsWith('annual')) {
          // Annual issue numbers only count when annuals are the priority.
          if (!isAnnual) continue;
          const prefix = annualPrefixRegex.exec(complete);
          if (!prefix) continue;
          start += prefix[0].length;
        }

        const value = match[1];
        if (value === undefined) continue;
        yield { value, start, end };
      }
    }
  }
}

export interface ExtractOptions {
  /** Assume volume 1 when no volume marker is present. Default true. */
  assumeVolumeNumber?: boolean;
  /** Prefer a year found in the folder name over one in the filename. */
  preferFolderYear?: boolean;
  /** Repair years that look like typos (`1890` -> `1980`). */
  fixYear?: boolean;
}

/**
 * Extract comic data from a filepath, filename, or web title.
 *
 * ```ts
 * extractFilenameData("Batman (1940) Volume 2 Issue 11-25.cbz")
 * // { series: "Batman", year: 1940, volumeNumber: 2,
 * //   specialVersion: null, issueNumber: [11, 25], annual: false }
 * ```
 */
export function extractFilenameData(
  input: string,
  options: ExtractOptions = {}
): FilenameData {
  const {
    assumeVolumeNumber = true,
    preferFolderYear = false,
    fixYear = false,
  } = options;

  let series: string | null = null;
  let year: string | null = null;
  let volumeNumber: number | [number, number] | null = null;
  let specialVersion: SpecialVersion | null = null;
  let issueNumber: string | null = null;

  // Positions of everything found so far — a number can't be both the year
  // and the issue number, so overlaps disqualify later candidates.
  const FAR = 10_000;
  let allYearPos: Array<[number, number]> = [[FAR, 0]];
  let allYearFolderPos: Array<[number, number]> = [[FAR, 0]];
  let volumePos = FAR;
  let volumeEnd = 0;
  let volumeFolderPos = FAR;
  let volumeFolderEnd = 0;
  let issuePos = FAR;
  let issueFolderPos = FAR;
  let specialPos = FAR;
  let specialEnd = 0;

  // A metadata file's own name carries nothing; parse its folder instead.
  let filepath = input;
  if (METADATA_FILES.has(basename(filepath).toLowerCase())) {
    filepath = dirname(filepath);
    specialVersion = 'metadata';
  }

  filepath = translateFilepath(normaliseString(filepath));

  const annualResult = annualRegex.test(basename(filepath));
  const annualFolderResult = annualRegex.test(basename(dirname(filepath)));
  const annual = !(annualResult && annualFolderResult);
  filepath = filepath.replace(/\+/g, ' ');

  const isImageFile = IMAGE_EXTENSIONS.some((ext) =>
    filepath.toLowerCase().endsWith(ext)
  );
  const folderName = basename(dirname(filepath));
  const upperFolderName = basename(dirname(dirname(filepath)));
  const filename = extensionlessFilename(filepath);
  const cleanFilename =
    filename.replace(stripFilenameRegex, (m) => ' '.repeat(m.length)) + ' ';

  // Year
  const yearOrder = preferFolderYear
    ? [folderName, filename, upperFolderName]
    : [filename, folderName, upperFolderName];
  for (const location of yearOrder) {
    const results = findAll(yearRegex, location);
    if (results.length === 0) continue;

    if (year === null) {
      const first = results[0]!.slice(1).find((g) => g);
      if (first) year = first;
    }
    const positions = results.map(
      (r) => [r.index, r.index + r[0].length] as [number, number]
    );
    if (location === filename) allYearPos = positions;
    if (location === folderName) allYearFolderPos = positions;
  }

  // Volume number. For a loose page image the filename is just "003.jpg", so
  // only the folder is meaningful.
  const volumeResult = isImageFile ? null : volumeRegex.exec(cleanFilename);
  if (volumeResult) {
    volumeNumber = extractVolumeNumber(volumeResult[1]);
    volumePos = volumeResult.index;
    volumeEnd = volumeResult.index + volumeResult[0].length;
  }

  const volumeFolderResult = volumeFolderRegex.exec(folderName);
  if (volumeFolderResult) {
    volumeFolderPos = volumeFolderResult.index;
    volumeFolderEnd = volumeFolderResult.index + volumeFolderResult[0].length;
    if (!volumeResult) {
      volumeNumber = extractVolumeNumber(volumeFolderResult[1] ?? volumeFolderResult[2]);
    }
  }

  if (assumeVolumeNumber && !volumeResult && !volumeFolderResult) {
    volumeNumber = 1;
  }

  // Special version
  if (!specialVersion) {
    const coverResult = coverRegex.exec(filename);
    if (coverResult) {
      specialVersion = 'cover';
      if (coverResult[1]) {
        specialPos = filename.indexOf(coverResult[1], coverResult.index);
        specialEnd = specialPos + coverResult[1].length;
      } else {
        specialPos = coverResult.index;
        specialEnd = coverResult.index + coverResult[0].length;
      }
    } else {
      const specialResult = specialVersionRegex.exec(filename);
      if (specialResult?.groups) {
        const key = Object.entries(specialResult.groups).find(
          ([, value]) => value !== undefined
        )?.[0];
        if (key) {
          specialVersion = key.replace(/_/g, '-') as SpecialVersion;
          specialPos = specialResult.index;
        }
      }
    }
  }

  // Issue number — skipped when we already know it's a special version.
  if (specialVersion === null || specialVersion === 'cover' || specialVersion === 'metadata') {
    const allRegexes = [
      issueRegex1, issueRegex2, issueRegex3, issueRegex4,
      issueRegex5, issueRegex6a, issueRegex6b, issueRegex7,
    ];
    const beforeVolumeRegexes = allRegexes.slice(0, -1);

    // Python's `endpos` has no JS equivalent; truncating from the right is
    // equivalent here because `pos` is 0 and lookbehind only reads leftward.
    const searchText = isImageFile ? folderName : filename;
    const afterVolume = isImageFile ? volumeFolderEnd : volumeEnd;
    const beforeVolume = isImageFile ? volumeFolderPos : volumePos;
    const blockedPos = isImageFile
      ? allYearFolderPos
      : [...allYearPos, [specialPos, specialEnd] as [number, number]];

    const posOptions: PosOption[] = [
      { text: searchText, from: afterVolume, regexes: allRegexes },
      {
        text: beforeVolume === FAR ? searchText : searchText.slice(0, beforeVolume),
        from: 0,
        regexes: beforeVolumeRegexes,
      },
    ];

    for (const candidate of findIssueNumbers(posOptions, annual)) {
      if (!checkOverlappingPos(blockedPos, [candidate.start, candidate.end])) {
        issueNumber = candidate.value;
        if (isImageFile) issueFolderPos = candidate.start;
        else issuePos = candidate.start;
        break;
      }
    }
  }

  if (!issueNumber && !specialVersion) {
    // No issue number and no special version: assume a TPB
    // (e.g. "Iron-Man Volume 1.cbz").
    specialVersion = 'tpb';
  }

  // Series name: whatever sits left of everything else we identified. A
  // position of 0 means the very first thing in the string was an issue
  // number or year, so there is no series name there — fall back to the
  // folder, then to the folder above it.
  const seriesPos = Math.min(allYearPos[0]![0], volumePos, specialPos, issuePos);
  if (seriesPos && !isImageFile) {
    series = cleanFilename.slice(0, seriesPos - 1);
  } else {
    const seriesFolderPos = Math.min(
      allYearFolderPos[0]![0],
      volumeFolderPos,
      issueFolderPos
    );
    if (seriesFolderPos) {
      series = folderName.slice(0, seriesFolderPos - 1);
    } else {
      series = upperFolderName.replace(stripFilenameRegex, '');
    }
  }
  series = series.replace(/[-_]/g, ' ').replace(seriesRegex, '');

  let numericYear = year ? parseInt(year, 10) : null;
  if (numericYear !== null && Number.isNaN(numericYear)) numericYear = null;
  if (fixYear && numericYear !== null) numericYear = fixBrokenYear(numericYear);

  return {
    series,
    year: numericYear,
    volumeNumber,
    specialVersion,
    issueNumber: issueNumber !== null ? extractIssueNumber(issueNumber) : null,
    annual,
  };
}

/**
 * Reconcile a release's detected special version against what we know the
 * volume actually is. E.g. a volume marked "one-shot" locally means a TPB
 * release on the site is still the right download.
 *
 * Derived from Kapowarr's `refine_special_version`.
 */
export function refineSpecialVersion<
  T extends {
    specialVersion: SpecialVersion | null;
    issueNumber: IssueNumber;
    volumeNumber: number | [number, number] | null;
  }
>(volume: { specialVersion: SpecialVersion | null; volumeNumber: number | null }, data: T): T {
  const refined: T = { ...data };

  if (
    volume.specialVersion === 'volume-as-issue' &&
    (refined.specialVersion === 'tpb' ||
      refined.specialVersion === 'omnibus' ||
      Array.isArray(refined.volumeNumber))
  ) {
    // For a volume-as-issue series, "Volume 2" on the release names an issue,
    // not a volume — so move the number across. (A "One-Shot Volume 2-3" is
    // the same thing: a normal volume whose issues are each a one-shot.)
    if (Array.isArray(refined.volumeNumber)) {
      refined.issueNumber = [refined.volumeNumber[0], refined.volumeNumber[1]];
    } else if (refined.volumeNumber !== null) {
      refined.issueNumber = refined.volumeNumber;
    }
    refined.volumeNumber = volume.volumeNumber;
    refined.specialVersion = null;
  }

  if (
    refined.specialVersion === 'tpb' &&
    (volume.specialVersion === 'hard-cover' ||
      volume.specialVersion === 'one-shot' ||
      volume.specialVersion === 'omnibus')
  ) {
    // Extraction falls back to "tpb" for anything it can't pin down; if we
    // know what the volume actually is, say so.
    refined.specialVersion = volume.specialVersion;
  }

  return refined;
}

// endregion
