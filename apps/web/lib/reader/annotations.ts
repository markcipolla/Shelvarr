/**
 * Bookmarks and highlights as the reader sees them.
 *
 * The server shape (`/api/books/[id]/annotations`) and these helpers are
 * deliberately thin: a CFI is opaque to everything except epub.js, so there
 * is nothing to model beyond "a place, a kind, and some text to recognise it
 * by".
 */

export type ReaderAnnotationKind = 'bookmark' | 'highlight';

export interface ReaderAnnotation {
  id: number;
  bookId: number;
  kind: ReaderAnnotationKind;
  cfi: string;
  text: string | null;
  colour: string | null;
  created: string;
}

/**
 * Whether a bookmark already exists at this exact spot.
 *
 * Exact-CFI matching is a deliberate simplification: in scrolled mode the CFI
 * moves as you scroll, so two bookmarks a paragraph apart are two bookmarks.
 * That is easier to explain than a fuzzy "near enough" rule that quietly
 * refuses to bookmark the next page.
 */
export function findBookmarkAt(
  annotations: readonly ReaderAnnotation[],
  cfi: string | null
): ReaderAnnotation | undefined {
  if (!cfi) return undefined;
  return annotations.find((a) => a.kind === 'bookmark' && a.cfi === cfi);
}

export function byKind(
  annotations: readonly ReaderAnnotation[],
  kind: ReaderAnnotationKind
): ReaderAnnotation[] {
  return annotations.filter((a) => a.kind === kind);
}

/**
 * A one-line preview for a list. Long selections are cut at a word boundary
 * where one is available, so an excerpt doesn't end mid-word.
 */
export function annotationPreview(annotation: ReaderAnnotation, limit = 90): string {
  const text = (annotation.text ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return annotation.kind === 'bookmark' ? 'Bookmarked position' : 'Highlighted passage';
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
