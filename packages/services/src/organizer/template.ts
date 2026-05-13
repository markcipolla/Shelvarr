/**
 * Pure template helpers for the file organizer.
 *
 * This module is intentionally free of `fs`, `path`, `crypto`, and database
 * imports so it can be bundled into client components (e.g. the live preview
 * on /settings/organize) without dragging Node-only modules into the browser
 * bundle.
 */

/**
 * Default filename template used when the user has not configured one.
 * Produces a hierarchical layout: `Author/Series/Book NNN - Title.ext`.
 * For standalone books (no series) the empty `{series}` and `{number}` segments
 * collapse, leaving `Author/Book - Title.ext`. See applyTemplate for the
 * exact collapsing rules and TemplateVars docs for the available placeholders.
 */
export const DEFAULT_ORGANIZE_TEMPLATE =
  '{author}/{series}/Book {number} - {title}.{ext}';

/**
 * Template variables that can be used in naming patterns.
 *
 * Available placeholders (case-sensitive):
 * - {author}                              First author (sanitized; default "Unknown Author")
 * - {title}                               Book title (sanitized; default "Untitled")
 * - {series} / {series_name}              Series name (sanitized; empty if standalone)
 * - {number} / {series_number}            Zero-padded (3 digits) series number; empty if none
 * - {year}                                4-digit year parsed from publish_date; empty if unparseable
 * - {isbn}                                Raw ISBN; empty if absent
 * - {ext} / {extension}                   File extension WITHOUT the leading dot
 *
 * Double-brace placeholders ({{x}}) are accepted as input and normalized to {x}.
 * If the template contains an explicit {ext}/{extension} placeholder, it is
 * substituted inline and no trailing extension is appended. Otherwise the
 * original `vars.ext` (which includes the dot) is appended at the end.
 */
export interface TemplateVars {
  author: string;
  title: string;
  series: string;
  number: string;          // Zero-padded series number
  series_number: string;   // Alias for number
  year: string;
  isbn: string;
  ext: string;             // With leading dot, e.g. ".epub"
}

/**
 * Sanitize a string for use in file paths.
 * Removes characters invalid in file paths and trims overly long components.
 */
export function sanitizePathComponent(str: string, fallback: string = ''): string {
  if (!str) return fallback;

  return str
    // Replace characters invalid in file paths
    .replace(/[<>:"/\\|?*]/g, '')
    // Replace multiple spaces with single space
    .replace(/\s+/g, ' ')
    // Remove leading/trailing spaces and dots
    .trim()
    .replace(/^\.+|\.+$/g, '')
    // Limit length
    .slice(0, 200)
    || 'Unknown';
}

/**
 * Apply a naming template to generate a new path.
 * See TemplateVars JSDoc for the canonical list of supported placeholders.
 */
export function applyTemplate(template: string, vars: Partial<TemplateVars>): string {
  let result = template;

  // Normalize friendly double-brace input
  result = result.replace(/\{\{(\w+)\}\}/g, '{$1}');

  // Alias normalization — collapse aliases to canonical placeholders
  result = result
    .replace(/\{series_name\}/g, '{series}')
    .replace(/\{series_number\}/g, '{number}')
    .replace(/\{extension\}/g, '{ext}');

  // Resolve values, supporting either `number`/`series_number` field names
  const author = vars.author ?? '';
  const title = vars.title ?? '';
  const series = vars.series ?? '';
  const numberVal = vars.number ?? vars.series_number ?? '';
  const year = vars.year ?? '';
  const isbn = vars.isbn ?? '';
  const extWithDot = vars.ext ?? '';
  const extWithoutDot = extWithDot.startsWith('.') ? extWithDot.slice(1) : extWithDot;

  // Determine whether the template substitutes the extension inline
  const hasExtPlaceholder = /\{ext\}/.test(result);

  // Replace all template variables
  result = result.replace(/\{author\}/g, author);
  result = result.replace(/\{title\}/g, title);
  result = result.replace(/\{series\}/g, series);
  result = result.replace(/\{number\}/g, numberVal);
  result = result.replace(/\{year\}/g, year);
  result = result.replace(/\{isbn\}/g, isbn);
  if (hasExtPlaceholder) {
    result = result.replace(/\{ext\}/g, extWithoutDot);
  }

  // Remove empty path components (e.g., if series is empty, "{series}/" becomes nothing).
  // Trim whitespace and stray punctuation left behind by empty placeholders within each segment.
  result = result
    .split('/')
    .map(part => part
      .replace(/\s*\(\s*\)/g, '')
      .replace(/\s*\[\s*\]/g, '')
      .replace(/\s*#\s*$/g, '')
      .replace(/\s+-\s*$/g, '')
      .replace(/^\s*-\s+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    )
    .filter(part => part !== '')
    .join('/');

  // Append extension only if the template didn't substitute one inline
  if (!hasExtPlaceholder) {
    result += extWithDot;
  }

  return result;
}
