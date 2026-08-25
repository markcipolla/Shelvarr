/**
 * String/number normalisation helpers shared by the comic parser and matcher.
 *
 * Derived from Kapowarr (GPL-3.0) `backend/base/helpers.py` — see NOTICE.md.
 */

import type { IssueNumber } from '@shelvarr/types';

/**
 * Fix common damage in strings coming from online sources: percent-encoding,
 * mangled parentheses, and typographic characters.
 */
export function normaliseString(s: string): string {
  let out = s;
  try {
    out = decodeURIComponent(out);
  } catch {
    // Not valid percent-encoding — leave as-is, same as Python's unquote.
  }
  return out
    .replace(/_28/g, '(')
    .replace(/_29/g, ')')
    .replace(/[–—]/g, '-')
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .trim();
}

/**
 * `normaliseString` plus transliteration of ligatures and accented characters,
 * for building search queries.
 */
export function normaliseQueryString(s: string): string {
  return normaliseString(s)
    .replace(/[æÆ]/g, 'ae')
    .replace(/[œŒ]/g, 'oe')
    .replace(/ß/g, 'ss')
    .replace(/[øØ]/g, 'o')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '');
}

/** Turn a user-entered number into a more tractable form. */
export function normaliseNumber(s: string): string {
  return s
    .replace(/,/g, '.')
    .replace(/\?/g, '0')
    .replace(/\.+$/, '')
    .trim()
    .toLowerCase();
}

/**
 * Fix years that are probably a typo: `1890` -> `1980`, `2204` -> `2024`.
 * Years already in [1900, 2100) are returned untouched.
 */
export function fixYear(year: number): number {
  if (year >= 1900 && year < 2100) return year;

  const digits = String(year).split('');
  if (digits.length === 3) digits.splice(1, 0, '0');
  if (digits.length !== 4) return year;

  if ((digits[0] === '8' || digits[0] === '9') && digits[1] === '1') {
    [digits[0], digits[1]] = [digits[1]!, digits[0]!];
  }

  const swapped = parseInt(digits.join(''), 10);
  if (swapped >= 1900 && swapped < 2100) return swapped;

  return parseInt(digits[0]! + digits[2]! + digits[1]! + digits[3]!, 10);
}

/** Parse a user-entered year, returning null when it isn't a plausible one. */
export function normaliseYear(s: string): number | null {
  const match = /\d{4}/.exec(s);
  if (!match) return null;
  return parseInt(match[0], 10);
}

/** First element of something that may or may not be a range. */
export function firstOfRange<T>(n: T | [T, T]): T {
  return Array.isArray(n) ? n[0] : n;
}

/** Coerce a value or range into a range. */
export function forceRange(n: number | [number, number]): [number, number] {
  return Array.isArray(n) ? n : [n, n];
}

/** Whether two issue numbers/ranges overlap. */
export function checkOverlappingIssues(
  a: number | [number, number],
  b: number | [number, number]
): boolean {
  if (!Array.isArray(a)) {
    if (!Array.isArray(b)) return a === b;
    return b[0] <= a && a <= b[1];
  }
  if (!Array.isArray(b)) return a[0] <= b && b <= a[1];
  return a[0] <= b[1] && b[0] <= a[1];
}

/** Whether a `[start, end)` span overlaps any of the established spans. */
export function checkOverlappingPos(
  established: Array<[number, number]>,
  check: [number, number]
): boolean {
  return established.some(
    ([start, end]) =>
      (start <= check[0] && check[0] < end) || (start < check[1] && check[1] <= end)
  );
}

/** How many issues an issue number/range covers; 1 for a single issue. */
export function issuesCovered(n: IssueNumber): number {
  if (n === null) return 0;
  if (!Array.isArray(n)) return 1;
  return Math.max(1, n[1] - n[0] + 1);
}

/**
 * Decode the HTML entities WordPress emits in `title.rendered`
 * (`&#8211;`, `&amp;`, `&#039;`, …).
 */
export function decodeHtmlEntities(s: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    hellip: '…',
    ndash: '-',
    mdash: '-',
    rsquo: "'",
    lsquo: "'",
    ldquo: '"',
    rdquo: '"',
  };
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      return String.fromCodePoint(parseInt(body.slice(2), 16));
    }
    if (body.startsWith('#')) {
      return String.fromCodePoint(parseInt(body.slice(1), 10));
    }
    return named[body.toLowerCase()] ?? whole;
  });
}

/** Strip HTML tags, leaving text. Used on WordPress-rendered fragments. */
export function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, ''));
}
