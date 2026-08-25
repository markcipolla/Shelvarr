/**
 * Decide whether a search result or download group actually corresponds to the
 * volume/issue we're looking for.
 *
 * Derived from Kapowarr (GPL-3.0) `backend/implementations/matching.py` —
 * see NOTICE.md.
 */

import type {
  FilenameData,
  IssueNumber,
  MatchedComicSearchResult,
  ComicSearchResult,
  SpecialVersion,
} from '@shelvarr/types';
import { forceRange, normaliseQueryString } from './normalise';

/** The volume we're trying to satisfy. */
export interface VolumeMatchData {
  title: string;
  altTitle?: string | null;
  year: number | null;
  volumeNumber: number | null;
  specialVersion: SpecialVersion | null;
}

/** One issue of that volume. */
export interface VolumeIssueData {
  id: number;
  calculatedIssueNumber: number;
  /** Release year, if known. */
  year: number | null;
  monitored: boolean;
  hasFile: boolean;
}

/**
 * Noise that shouldn't affect whether two titles are "the same": punctuation,
 * articles, and format words.
 */
const cleanTitleRegex =
  /((?<=annual)s|\/|-|–|\+|,|\.|!|:|\bthe\s|\band\b|&|’|'|"|\bone[-\s]?shot\b|\bhard[-\s]?cover\b|\bomnibus\b|\btpb\b)/g;

function cleanTitle(title: string): string {
  return normaliseQueryString(title)
    .toLowerCase()
    .replace(cleanTitleRegex, '')
    .replace(/ /g, '');
}

/** Whether two titles refer to the same series. */
export function matchTitle(
  title1: string,
  title2: string,
  allowContains = false
): boolean {
  const reference = cleanTitle(title1);
  const check = cleanTitle(title2);
  if (allowContains) return check !== '' && reference.includes(check);
  return reference === check;
}

/**
 * Whether two years match, allowing one year of wiggle room either side.
 * With `conservative`, an unknown year is treated as a match rather than a
 * rejection.
 */
export function matchYear(
  referenceYear: number | null,
  checkYear: number | null,
  endYear: number | null = null,
  conservative = false
): boolean {
  if (referenceYear === null || checkYear === null) return conservative;
  const endBorder = endYear ?? referenceYear;
  return referenceYear - 1 <= checkYear && checkYear <= endBorder + 1;
}

/**
 * Whether a volume number matches the volume — or, for a volume-as-issue
 * series, whether it matches issue numbers instead.
 */
export function matchVolumeNumber(
  volume: VolumeMatchData,
  issues: VolumeIssueData[],
  checkNumber: number | [number, number] | null,
  conservative = false
): boolean {
  if (volume.volumeNumber === null && volume.year === null) return conservative;
  if (checkNumber === null) return conservative;

  if (!Array.isArray(checkNumber)) {
    if (checkNumber === volume.volumeNumber) return true;
    if (matchYear(volume.year, checkNumber)) return true;
  }

  // Volume numbers don't line up — but for a volume-as-issue series the
  // "volume number" on the release is really the issue number.
  if (volume.specialVersion !== 'volume-as-issue') return false;

  const numbers = Array.isArray(checkNumber) ? checkNumber : [checkNumber];
  const found = numbers.filter((n) =>
    issues.some((issue) => issue.calculatedIssueNumber === n)
  );
  return found.length === numbers.length;
}

/**
 * Whether two special versions are compatible, allowing for filenames being
 * vaguer than our own metadata.
 */
export function matchSpecialVersion(
  referenceVersion: SpecialVersion | null,
  checkVersion: SpecialVersion | null,
  volumeTitle: string,
  issueNumber: IssueNumber = null
): boolean {
  if (
    checkVersion === referenceVersion ||
    checkVersion === 'cover' ||
    checkVersion === 'metadata'
  ) {
    return true;
  }

  if (
    issueNumber === 1 &&
    (referenceVersion === 'hard-cover' ||
      referenceVersion === 'one-shot' ||
      referenceVersion === 'omnibus')
  ) {
    return true;
  }

  if (referenceVersion === 'volume-as-issue' && checkVersion === null) return true;

  if (volumeTitle.toLowerCase().includes('omnibus') && checkVersion === 'omnibus') {
    return true;
  }

  // A volume's real special version often isn't stated in the filename, and
  // extraction falls back to "tpb" in that case.
  return (
    checkVersion === 'tpb' &&
    (referenceVersion === 'hard-cover' ||
      referenceVersion === 'one-shot' ||
      referenceVersion === 'omnibus' ||
      referenceVersion === 'volume-as-issue')
  );
}

/**
 * Whether a download group within an article is for this volume.
 *
 * @param endingYear Year of the volume's last issue, or the volume year.
 */
export function downloadGroupFilter(
  info: FilenameData,
  volume: VolumeMatchData,
  endingYear: number | null,
  issues: VolumeIssueData[]
): boolean {
  const annual = volume.title.toLowerCase().includes('annual');

  return (
    matchTitle(volume.title, info.series) &&
    info.annual === annual &&
    matchSpecialVersion(
      volume.specialVersion,
      info.specialVersion,
      volume.title,
      info.issueNumber
    ) &&
    matchVolumeNumber(volume, issues, info.volumeNumber, true) &&
    matchYear(volume.year, info.year, endingYear ?? volume.year, true)
  );
}

export interface SearchMatchContext {
  volume: VolumeMatchData;
  issues: VolumeIssueData[];
  /** Calculated issue number -> release year, for every issue of the volume. */
  numberToYear: Map<number, number | null>;
  /** Set when searching for a single issue rather than the whole volume. */
  calculatedIssueNumber?: number | null;
  /** Optional blocklist check, so the matcher itself stays pure. */
  isBlocklisted?: (link: string) => boolean;
}

/**
 * Decide whether a search result matches what we're looking for, and if not,
 * why. The reason is surfaced in the manual-search UI.
 */
export function checkSearchResultMatch(
  result: ComicSearchResult,
  context: SearchMatchContext
): MatchedComicSearchResult {
  const { volume, issues, numberToYear, calculatedIssueNumber = null } = context;
  const reject = (matchIssue: string): MatchedComicSearchResult => ({
    ...result,
    match: false,
    matchIssue,
  });

  const annual = volume.title.toLowerCase().includes('annual');

  if (context.isBlocklisted?.(result.link)) return reject('Link is blocklisted');
  if (result.annual !== annual) return reject('Annual conflict');

  if (
    !matchTitle(volume.title, result.series) &&
    !matchTitle(volume.altTitle ?? '', result.series)
  ) {
    return reject("Titles don't match");
  }

  if (!matchVolumeNumber(volume, issues, result.volumeNumber, true)) {
    return reject("Volume numbers don't match");
  }

  if (
    !matchSpecialVersion(
      volume.specialVersion,
      result.specialVersion,
      volume.title,
      result.issueNumber
    )
  ) {
    return reject('Special version conflict');
  }

  let issueNumber: number | [number, number];
  if (result.issueNumber !== null) {
    issueNumber = result.issueNumber;
  } else if (volume.specialVersion === 'volume-as-issue' && result.volumeNumber !== null) {
    issueNumber = result.volumeNumber;
  } else {
    issueNumber = -Infinity;
  }

  const lastNumber = forceRange(issueNumber)[1];
  if (
    !matchYear(volume.year, result.year, numberToYear.get(lastNumber) ?? null, true)
  ) {
    return reject("Year doesn't match");
  }

  if (volume.specialVersion === null || volume.specialVersion === 'volume-as-issue') {
    if (calculatedIssueNumber === null) {
      // Volume search: every issue the result claims to cover must exist.
      const [start, end] = forceRange(issueNumber);
      if (!numberToYear.has(start) || !numberToYear.has(end)) {
        return reject("Issue numbers don't match");
      }
    } else if (
      Array.isArray(issueNumber)
        ? issueNumber[0] !== calculatedIssueNumber || issueNumber[1] !== calculatedIssueNumber
        : issueNumber !== calculatedIssueNumber
    ) {
      // Issue search: the result must be for exactly that issue.
      return reject("Issue numbers don't match");
    }
  }

  return { ...result, match: true, matchIssue: null };
}
