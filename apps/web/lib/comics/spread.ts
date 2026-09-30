/**
 * What shape is this page, and should the reader cut it in half?
 *
 * A comic scanned or published as a double-page spread is stored as one wide
 * image. A reader that does the obvious thing with it — `object-contain`,
 * scale to fit, letterbox the rest — renders the page the artist most wanted
 * you to look at at *half* the size of every other page. On a phone it is
 * unreadable. The fix is to show it as two half-pages, in order.
 *
 * Deciding *which* pages to cut is the whole problem, and it is the part
 * this module takes from Kindle Comic Converter
 * (`kindlecomicconverter/image.py`, `ComicPageParser.splitCheck` — ISC, see
 * NOTICE.md). Two ratios do the work:
 *
 * - Past {@link SPREAD_RATIO} (1.16) a landscape page is a spread rather
 *   than a page that merely happens to be a little wide. Comic pages are
 *   roughly 2:3, so two side by side are roughly 4:3 ≈ 1.33; 1.16 sits below
 *   that with room for trimmed margins, and above the noise of a portrait
 *   page scanned slightly askew.
 * - Past {@link PANORAMA_RATIO} (1.8) cutting down the middle produces
 *   nonsense. A triptych, a foldout, a webtoon strip turned sideways: the
 *   seam is not in the middle, so there is no honest place to cut. KCC
 *   rotates these for an e-ink device; a browser has no equivalent move, so
 *   Shelvarr shows them whole and lets the reader scroll or turn the device.
 *
 * Neither number was arrived at by reasoning — they are thirteen years of
 * KCC bug reports — which is exactly why they are worth borrowing rather
 * than re-deriving.
 *
 * Everything here is pure arithmetic over page dimensions. No pixels are
 * read, nothing is decoded, and nothing touches the filesystem: geometry is
 * enough to make this decision, and that is what makes it cheap enough to do
 * for every page of every issue.
 *
 * **Reading direction is deliberately not modelled.** KCC splits
 * right-to-left for manga, and Shelvarr has no reading-direction setting to
 * drive that from. Adding the parameter here alone would be dead
 * flexibility: getting manga right means flipping page turns, the progress
 * bar and the arrow keys too, which is a card of its own. Until then a
 * spread is split left half first, and a right-to-left comic will read its
 * spreads in the wrong order. Noted, not hidden.
 */

/**
 * Above this width-to-height ratio, a landscape page is treated as two pages
 * printed side by side rather than one wide one.
 */
export const SPREAD_RATIO = 1.16;

/**
 * At or above this ratio, the page is too wide to have a meaningful middle,
 * so it is shown whole rather than bisected.
 */
export const PANORAMA_RATIO = 1.8;

/**
 * - `single` — an ordinary portrait (or near-square) page. Show it as-is.
 * - `spread` — two pages printed as one image. Cut it down the middle.
 * - `panorama` — wider than a spread; there is no honest middle. Show whole.
 */
export type PageLayout = 'single' | 'spread' | 'panorama';

/** Which half of a spread a view is showing, or `null` for a whole page. */
export type SpreadHalf = 'left' | 'right';

/** A page as the pages API describes it: its number, and its size if known. */
export interface PageGeometry {
  /** 1-based page number within the archive. */
  n: number;
  w: number | null;
  h: number | null;
}

/**
 * One thing the reader can put on screen.
 *
 * The distinction between a *view* and a *page* is the load-bearing idea in
 * this module, and the reason it exists at all rather than living inside the
 * component. Splitting means the reader shows more things than the archive
 * has pages, but read progress — shared between the browser, the phone and
 * the Hardcover completion sync — is a page number in that archive and
 * nothing else. If the reader ever saves a view index as a page number, two
 * devices silently disagree about where you are, and a long issue finishes
 * several pages early.
 *
 * So: views are what you look at and are never persisted; `page` is what is
 * persisted and never assumed to be unique across views.
 */
export interface PageView {
  /** 1-based page number in the archive. This is what progress stores. */
  page: number;
  /** `null` for a whole page; which half otherwise. */
  half: SpreadHalf | null;
}

/**
 * Classify a page from its dimensions alone.
 *
 * Returns `single` for anything it cannot make sense of — a missing, zero or
 * negative dimension, a page whose size could not be read out of its header.
 * That is the conservative answer: showing a spread whole is a worse reading
 * experience, but cutting an ordinary page in half is a broken one.
 */
export function classifyPage(width: number | null | undefined, height: number | null | undefined): PageLayout {
  if (typeof width !== 'number' || typeof height !== 'number') return 'single';
  if (!Number.isFinite(width) || !Number.isFinite(height)) return 'single';
  if (width <= 0 || height <= 0) return 'single';

  const ratio = width / height;
  if (ratio < SPREAD_RATIO) return 'single';
  if (ratio >= PANORAMA_RATIO) return 'panorama';
  return 'spread';
}

/**
 * Expand a list of pages into the list of views a reader steps through.
 *
 * With `split` off this is a one-to-one mapping and exists only so the
 * reader has a single code path either way. With it on, each `spread` page
 * contributes two views and every other page contributes one.
 *
 * The first page is split like any other. A wide page 1 is usually a
 * wraparound cover, which means splitting it shows the *back* cover first —
 * not obviously wrong (it is what is printed on the left) and not obviously
 * right. Left alone deliberately rather than special-cased on a guess.
 */
export function buildPageViews(pages: PageGeometry[], split: boolean): PageView[] {
  const views: PageView[] = [];
  for (const page of pages) {
    if (split && classifyPage(page.w, page.h) === 'spread') {
      views.push({ page: page.n, half: 'left' });
      views.push({ page: page.n, half: 'right' });
    } else {
      views.push({ page: page.n, half: null });
    }
  }
  return views;
}

/**
 * The index of the first view showing a given page, for restoring a saved
 * position. Returns 0 when the page is not in the list — a saved position
 * past the end of a re-downloaded, shorter file should open the issue at the
 * start rather than refuse to open it.
 */
export function firstViewIndexForPage(views: PageView[], page: number): number {
  const index = views.findIndex((view) => view.page === page);
  return index >= 0 ? index : 0;
}

/** A box of pixels; the result of fitting one rectangle inside another. */
export interface FittedBox {
  width: number;
  height: number;
}

/**
 * Scale `content` to fit inside `container` without distorting it — what
 * `object-fit: contain` does, done in JavaScript because the reader needs
 * the resulting numbers rather than just the appearance.
 *
 * Showing half a spread means clipping: a box of the half's aspect ratio,
 * with the image inside it at double that box's width, anchored left or
 * right. CSS can do the clipping (`overflow: hidden`) but it cannot size the
 * box, because `aspect-ratio` on a replaced element interacts with the
 * image's own intrinsic size in ways that differ between engines and quietly
 * distort when `max-width` clamps a definite height. Measuring the container
 * and doing the arithmetic here is duller and always right.
 *
 * Returns a zero box for a degenerate input rather than `NaN`, so a reader
 * that renders before its container has been measured shows nothing for a
 * frame instead of throwing.
 */
export function fitContain(
  contentWidth: number,
  contentHeight: number,
  containerWidth: number,
  containerHeight: number
): FittedBox {
  const valid =
    Number.isFinite(contentWidth) &&
    Number.isFinite(contentHeight) &&
    Number.isFinite(containerWidth) &&
    Number.isFinite(containerHeight) &&
    contentWidth > 0 &&
    contentHeight > 0 &&
    containerWidth > 0 &&
    containerHeight > 0;
  if (!valid) return { width: 0, height: 0 };

  const scale = Math.min(containerWidth / contentWidth, containerHeight / contentHeight);
  return { width: contentWidth * scale, height: contentHeight * scale };
}
