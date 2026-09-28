/**
 * "About 12 minutes left in this chapter."
 *
 * epub.js has no idea how long anything takes to read. What it will give you,
 * once `book.locations.generate(n)` has run, is an ordered list of CFIs
 * roughly `n` characters apart — a page-number substitute that works across
 * type sizes and window widths. Everything below is arithmetic on that list,
 * which is why it lives here as pure functions rather than inside the reader:
 * the estimate is the part most worth being able to test.
 *
 * Chapter boundaries fall out of the CFIs themselves. Every location CFI
 * begins with its spine item's base path — the part before the `!` — so
 * consecutive locations sharing a base are, by definition, the same chapter.
 * No extra spine walking, no second pass over the book.
 */

/**
 * Characters per generated location. 1024 is epub.js's own default and is
 * roughly a large paperback page; smaller values make `generate()` markedly
 * slower on a long book for an accuracy nobody can perceive.
 */
export const CHARS_PER_LOCATION = 1024;

/**
 * Characters per word, counting the space after it. English prose sits a
 * shade under six; this only has to be right enough that "12 minutes" is not
 * secretly 25.
 */
const CHARS_PER_WORD = 5.8;

export interface ReadingEstimateInput {
  /** Every location CFI in the book, in spine order. */
  locations: readonly string[];
  /** Index of the location currently on screen, or -1 when not yet known. */
  currentIndex: number;
  charsPerLocation?: number;
  wordsPerMinute: number;
}

export interface ReadingEstimate {
  /** How far through the whole book, 0–100. */
  bookPercent: number;
  /** How far through the current chapter, 0–100. */
  chapterPercent: number;
  minutesLeftInBook: number;
  minutesLeftInChapter: number;
}

/**
 * The spine item a location CFI belongs to: everything before the `!` that
 * separates the package-level path from the position inside the document.
 * A CFI with no `!` is its own chapter, which is the honest answer for the
 * malformed case.
 */
export function cfiSpineBase(cfi: string): string {
  const bang = cfi.indexOf('!');
  return bang === -1 ? cfi : cfi.slice(0, bang);
}

function minutesFor(locationCount: number, charsPerLocation: number, wordsPerMinute: number): number {
  if (locationCount <= 0 || wordsPerMinute <= 0) return 0;
  const words = (locationCount * charsPerLocation) / CHARS_PER_WORD;
  return words / wordsPerMinute;
}

/**
 * Where we are and how much is left, in both the chapter and the book.
 *
 * Returns zeroes rather than null when locations have not been generated yet:
 * the reader shows a quiet placeholder in that window, and a caller should
 * not have to special-case "the numbers aren't ready" twice.
 */
export function estimateReading(input: ReadingEstimateInput): ReadingEstimate {
  const { locations, currentIndex, wordsPerMinute } = input;
  const charsPerLocation = input.charsPerLocation ?? CHARS_PER_LOCATION;
  const total = locations.length;

  if (total === 0 || currentIndex < 0) {
    return { bookPercent: 0, chapterPercent: 0, minutesLeftInBook: 0, minutesLeftInChapter: 0 };
  }

  const index = Math.min(total - 1, currentIndex);
  const bookPercent = total <= 1 ? 100 : (index / (total - 1)) * 100;

  // Walk out from the current location to the edges of its spine item.
  const base = cfiSpineBase(locations[index]!);
  let chapterStart = index;
  while (chapterStart > 0 && cfiSpineBase(locations[chapterStart - 1]!) === base) chapterStart--;
  let chapterEnd = index;
  while (chapterEnd < total - 1 && cfiSpineBase(locations[chapterEnd + 1]!) === base) chapterEnd++;

  const chapterLength = chapterEnd - chapterStart + 1;
  const chapterPercent =
    chapterLength <= 1 ? 100 : ((index - chapterStart) / (chapterLength - 1)) * 100;

  return {
    bookPercent,
    chapterPercent,
    minutesLeftInBook: minutesFor(total - 1 - index, charsPerLocation, wordsPerMinute),
    minutesLeftInChapter: minutesFor(chapterEnd - index, charsPerLocation, wordsPerMinute),
  };
}

/**
 * Minutes as something a person would say out loud.
 *
 * Deliberately vague — "about 12 minutes", never "11.7 minutes". The estimate
 * is built on an average word length and a guessed reading speed, so precision
 * past the nearest minute would be a lie told confidently. Under a minute
 * says so rather than rounding to "about 0 minutes".
 */
export function describeMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return 'less than a minute';
  const rounded = Math.round(minutes);
  if (rounded < 1) return 'less than a minute';
  if (rounded === 1) return 'about a minute';
  if (rounded < 60) return `about ${rounded} minutes`;

  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  const hourPart = hours === 1 ? 'about an hour' : `about ${hours} hours`;
  if (remainder === 0) return hourPart;
  return `${hourPart} ${remainder} min`;
}
