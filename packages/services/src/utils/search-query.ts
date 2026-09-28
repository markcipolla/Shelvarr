/**
 * The query a book download search starts from.
 *
 * Shadow libraries match on words, so a catalogue title carrying its series
 * and volume — "The Mercy of Gods: Captive's War, Book 1" — finds nothing,
 * while the bare title and author does. Keep the title up to its first
 * colon, drop series/volume clauses, bracketed asides and punctuation, then
 * add the author verbatim (initials like "James S. A. Corey" search fine).
 */
export function cleanBookTitle(title: string): string {
  const cleaned = (title || '')
    // Subtitle or series after a colon / dash
    .replace(/\s*[:：]\s.*$/, ' ')
    .replace(/\s+[—–]\s+.*$/, ' ')
    // Bracketed asides: "(Unabridged)", "[Kindle Edition]"
    .replace(/[([{].*?[)\]}]/g, ' ')
    // Series and volume clauses: ", Book 1", "Vol. 2", "Part 3"
    .replace(/[,;]?\s*\b(?:books?|bk|vols?|volumes?|parts?|no|number)\b\.?\s*\d+.*$/i, ' ')
    .replace(/\s*#\s*\d+.*$/, ' ')
    // Anything left that isn't a letter, number, space or apostrophe
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // A title that is nothing but noise (": A Novel") is better searched raw.
  return cleaned || title.trim();
}

export function buildBookSearchQuery(title: string, author?: string | null): string {
  return [cleanBookTitle(title), (author || '').trim()].filter(Boolean).join(' ');
}
