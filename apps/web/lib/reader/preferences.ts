/**
 * How someone likes their reader set up, and how that turns into CSS.
 *
 * Everything here is pure: no React, no epub.js, no fetch. The reader reads
 * preferences off the server, hands them to {@link readerStylesheet}, and
 * pushes the resulting string into the book's iframe. Keeping the maths and
 * the CSS generation out of the component is what makes both testable
 * without standing up a rendition.
 *
 * Two notes on the brand rules. First: the app's own chrome stays sans-serif,
 * because that is what the rest of Shelvarr looks like — but the *book* gets
 * a real serif option, because a novel set in Helvetica is a novel nobody
 * finishes. Second: these settings live on the server against a user id and
 * not against a device, so the type size you picked on the laptop is the type
 * size you get on the tablet.
 */

export const READER_THEMES = ['light', 'sepia', 'dark'] as const;
export type ReaderTheme = (typeof READER_THEMES)[number];

export const READER_TYPEFACES = ['original', 'serif', 'sans', 'mono'] as const;
export type ReaderTypeface = (typeof READER_TYPEFACES)[number];

export const READER_TEXT_ALIGNMENTS = ['original', 'left', 'justify'] as const;
export type ReaderTextAlignment = (typeof READER_TEXT_ALIGNMENTS)[number];

export interface ReaderPreferences {
  theme: ReaderTheme;
  typeface: ReaderTypeface;
  /** Percentage of the browser's own base size, so it respects zoom settings. */
  fontSizePercent: number;
  lineHeight: number;
  /** Side padding inside the book, as a percentage of the reading column. */
  marginPercent: number;
  textAlign: ReaderTextAlignment;
  /** Immersive mode: the reader's own title bar gets out of the way. */
  hideHeader: boolean;
  /** Drives the "about 12 minutes left" estimate. Everyone reads differently. */
  wordsPerMinute: number;
}

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  theme: 'light',
  typeface: 'original',
  fontSizePercent: 100,
  lineHeight: 1.5,
  marginPercent: 6,
  textAlign: 'original',
  hideHeader: false,
  wordsPerMinute: 240,
};

export interface NumericRange {
  min: number;
  max: number;
  step: number;
}

export const READER_PREFERENCE_RANGES = {
  fontSizePercent: { min: 70, max: 250, step: 10 },
  lineHeight: { min: 1.1, max: 2.4, step: 0.1 },
  marginPercent: { min: 0, max: 24, step: 2 },
  wordsPerMinute: { min: 100, max: 600, step: 20 },
} as const satisfies Record<string, NumericRange>;

export const READER_TYPEFACE_LABELS: Record<ReaderTypeface, string> = {
  original: 'As published',
  serif: 'Serif',
  sans: 'Sans-serif',
  mono: 'Monospace',
};

/**
 * Font stacks for the book's own text. `original` is null on purpose: the
 * absence of a rule is what lets the publisher's choice through, and that is
 * a legitimate answer rather than a missing one.
 */
export const READER_TYPEFACE_STACKS: Record<ReaderTypeface, string | null> = {
  original: null,
  serif: "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, 'Times New Roman', serif",
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
};

export interface ReaderThemePalette {
  /** The page the words sit on. */
  background: string;
  text: string;
  link: string;
  /** Surrounding reader chrome, so the frame matches the page. */
  chrome: string;
  chromeText: string;
  chromeMuted: string;
  border: string;
  /** Highlight fill. Semi-transparent so the text underneath stays readable. */
  highlight: string;
}

export const READER_THEME_PALETTES: Record<ReaderTheme, ReaderThemePalette> = {
  light: {
    background: '#ffffff',
    text: '#1f2328',
    link: '#1d4ed8',
    chrome: '#f3f4f6',
    chromeText: '#1f2328',
    chromeMuted: '#6b7280',
    border: '#d8dbe0',
    highlight: 'rgba(250, 204, 21, 0.40)',
  },
  sepia: {
    background: '#f6ecd9',
    text: '#43372a',
    link: '#8a5a1f',
    chrome: '#eadfc7',
    chromeText: '#43372a',
    chromeMuted: '#7c6a54',
    border: '#d9c9a9',
    highlight: 'rgba(214, 158, 46, 0.38)',
  },
  dark: {
    background: '#15171c',
    text: '#c9ced8',
    link: '#89b4ff',
    chrome: '#1b1e25',
    chromeText: '#e5e7eb',
    chromeMuted: '#98a1b0',
    border: '#31363f',
    highlight: 'rgba(250, 204, 21, 0.28)',
  },
};

export const READER_THEME_LABELS: Record<ReaderTheme, string> = {
  light: 'Light',
  sepia: 'Sepia',
  dark: 'Dark',
};

function clampToRange(value: unknown, range: NumericRange, fallback: number): number {
  const asNumber = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(asNumber)) return fallback;
  const clamped = Math.min(range.max, Math.max(range.min, asNumber));
  // One decimal place is enough for every range here, and it keeps line
  // height from arriving as 1.5000000000000002 after a few step clicks.
  return Math.round(clamped * 10) / 10;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * Turn whatever came back from the server (or from an older build, or from a
 * hand-edited row) into a complete, in-range set of preferences.
 *
 * Nothing here ever throws or reports a problem: a preference that cannot be
 * understood is simply the default, because refusing to open a book over a
 * bad line-height would be absurd.
 */
export function normaliseReaderPreferences(input: unknown): ReaderPreferences {
  if (!input || typeof input !== 'object') return { ...DEFAULT_READER_PREFERENCES };
  const raw = input as Record<string, unknown>;
  const d = DEFAULT_READER_PREFERENCES;

  return {
    theme: oneOf(raw['theme'], READER_THEMES, d.theme),
    typeface: oneOf(raw['typeface'], READER_TYPEFACES, d.typeface),
    fontSizePercent: clampToRange(
      raw['fontSizePercent'],
      READER_PREFERENCE_RANGES.fontSizePercent,
      d.fontSizePercent
    ),
    lineHeight: clampToRange(raw['lineHeight'], READER_PREFERENCE_RANGES.lineHeight, d.lineHeight),
    marginPercent: clampToRange(
      raw['marginPercent'],
      READER_PREFERENCE_RANGES.marginPercent,
      d.marginPercent
    ),
    textAlign: oneOf(raw['textAlign'], READER_TEXT_ALIGNMENTS, d.textAlign),
    hideHeader: typeof raw['hideHeader'] === 'boolean' ? raw['hideHeader'] : d.hideHeader,
    wordsPerMinute: clampToRange(
      raw['wordsPerMinute'],
      READER_PREFERENCE_RANGES.wordsPerMinute,
      d.wordsPerMinute
    ),
  };
}

/** Nudge a numeric preference by one step, staying inside its range. */
export function stepPreference(
  value: number,
  range: NumericRange,
  direction: 1 | -1
): number {
  const next = value + range.step * direction;
  return clampToRange(next, range, value);
}

/**
 * The stylesheet injected into the book's iframe.
 *
 * `!important` throughout, which is normally a smell and here is the job:
 * every EPUB ships its own stylesheet, many of them hard-code white
 * backgrounds and black text, and a reader setting that a publisher can
 * overrule is not a setting. The one thing deliberately left alone is the
 * typeface when "As published" is chosen — see READER_TYPEFACE_STACKS.
 *
 * Injected via `themes.registerCss('default', css)` rather than
 * `registerRules`, because epub.js replaces a serialized stylesheet wholesale
 * on re-register but *appends* rule objects, which would pile up a new copy
 * of every rule each time a slider moves.
 */
export function readerStylesheet(preferences: ReaderPreferences): string {
  const prefs = normaliseReaderPreferences(preferences);
  const palette = READER_THEME_PALETTES[prefs.theme];
  const stack = READER_TYPEFACE_STACKS[prefs.typeface];
  const family = stack ? `font-family: ${stack} !important;` : '';
  const align =
    prefs.textAlign === 'original' ? '' : `text-align: ${prefs.textAlign} !important;`;

  // Font size goes on <html> so rem- and em-based books scale, and body is
  // pinned to 100% of that rather than compounding the percentage twice.
  return [
    `html {`,
    `  font-size: ${prefs.fontSizePercent}% !important;`,
    `  background: ${palette.background} !important;`,
    `}`,
    `body {`,
    `  font-size: 100% !important;`,
    `  background: ${palette.background} !important;`,
    `  color: ${palette.text} !important;`,
    `  line-height: ${prefs.lineHeight} !important;`,
    `  padding-left: ${prefs.marginPercent}% !important;`,
    `  padding-right: ${prefs.marginPercent}% !important;`,
    `  ${family}`,
    `}`,
    `p, li, dd, dt, blockquote, td, th, div, span, figcaption {`,
    `  color: ${palette.text} !important;`,
    `  line-height: ${prefs.lineHeight} !important;`,
    `  ${family}`,
    `}`,
    `p, li, dd, blockquote {`,
    `  ${align}`,
    `}`,
    `h1, h2, h3, h4, h5, h6 {`,
    `  color: ${palette.text} !important;`,
    `  ${family}`,
    `}`,
    `a, a:link, a:visited {`,
    `  color: ${palette.link} !important;`,
    `}`,
    // Illustrations and plates routinely assume a page wider than the one
    // they end up on, and a margin setting makes that worse.
    `img, svg, image, video {`,
    `  max-width: 100% !important;`,
    `  height: auto !important;`,
    `}`,
    `::selection {`,
    `  background: ${palette.highlight};`,
    `}`,
  ].join('\n');
}
