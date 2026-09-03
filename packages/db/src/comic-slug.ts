/**
 * URL slugs for comic volumes.
 *
 * `/comics/<slug>` is what people see, bookmark and share, so a slug has to be
 * readable, unique across the library, and — once handed out — permanent. It
 * is derived from the title and year the first time a volume is stored and
 * then left alone: a later ComicVine refresh that rewords the title must not
 * silently break links that already exist.
 */

/**
 * Segments under `/comics` that are pages rather than volumes. A volume whose
 * title slugifies to one of these gets a numeric suffix instead, so it can
 * never shadow the route.
 */
const RESERVED_SLUGS = new Set(['add', 'import', 'downloads', 'new']);

/** How long a slug is allowed to get before the year is appended. */
const MAX_TITLE_LENGTH = 80;

/** Lowercase, ASCII, hyphen-separated. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    // Combining marks left behind by the decomposition above: café -> cafe.
    .replace(/[\u0300-\u036f]/g, '')
    // Apostrophes join their word rather than splitting it: Marvel's -> marvels.
    .replace(/['\u2018\u2019]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_TITLE_LENGTH)
    .replace(/^-+|-+$/g, '');
}

export interface ComicSlugParts {
  title: string;
  year?: number | null;
}

/** The slug a volume would take if nothing else had claimed it. */
export function baseComicSlug({ title, year }: ComicSlugParts): string {
  const base = slugify(title ?? '') || 'volume';
  // The year is what usually tells two volumes of the same series apart, so it
  // is worth more than a bare "-2" suffix.
  const withYear = year ? `${base}-${year}` : base;
  // A slug of nothing but digits would shadow a volume id in `/comics/<ref>`,
  // which still accepts ids so old links keep working.
  return /^\d+$/.test(withYear) ? `volume-${withYear}` : withYear;
}

/**
 * A slug for this volume that no other volume is using.
 *
 * `isTaken` is injected so the uniqueness rule stays testable without a
 * database, and so callers can exclude the volume's own current slug.
 */
export function uniqueComicSlug(
  parts: ComicSlugParts,
  isTaken: (slug: string) => boolean
): string {
  const base = baseComicSlug(parts);
  if (!RESERVED_SLUGS.has(base) && !isTaken(base)) return base;

  for (let suffix = 2; suffix < 10000; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!isTaken(candidate)) return candidate;
  }

  // Ten thousand volumes sharing a title and year is not a real library, but a
  // slug still has to come back rather than the loop falling out.
  return `${base}-${Date.now()}`;
}
