/**
 * Tests for the spread classifier ported from Kindle Comic Converter.
 *
 * The two ratios are the whole point of the module, so most of what is
 * asserted here is where the boundaries sit — a page just under 1.16 must
 * not be cut, a page at 1.8 must not be cut either, and the band between
 * them must be. Those are the cases a careless refactor breaks.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PANORAMA_RATIO,
  SPREAD_RATIO,
  buildPageViews,
  classifyPage,
  firstViewIndexForPage,
  fitContain,
  type PageGeometry,
} from '../../lib/comics/spread';

/** A portrait page at the usual comic proportions. */
const portrait = (n: number): PageGeometry => ({ n, w: 1200, h: 1800 });
/** Two of those side by side: ratio 1.33, comfortably a spread. */
const spread = (n: number): PageGeometry => ({ n, w: 2400, h: 1800 });
/** Unmeasurable — a corrupt page, or a header this build cannot read. */
const unknown = (n: number): PageGeometry => ({ n, w: null, h: null });

describe('classifyPage', () => {
  it('treats an ordinary portrait page as a single page', () => {
    assert.equal(classifyPage(1200, 1800), 'single');
  });

  it('treats a square page as a single page', () => {
    assert.equal(classifyPage(1500, 1500), 'single');
  });

  it('treats two portrait pages side by side as a spread', () => {
    assert.equal(classifyPage(2400, 1800), 'spread');
  });

  it('does not split a page just below the spread ratio', () => {
    assert.equal(classifyPage(SPREAD_RATIO * 1000 - 1, 1000), 'single');
  });

  it('splits a page exactly at the spread ratio', () => {
    assert.equal(classifyPage(SPREAD_RATIO * 1000, 1000), 'spread');
  });

  it('stops splitting exactly at the panorama ratio', () => {
    assert.equal(classifyPage(PANORAMA_RATIO * 1000, 1000), 'panorama');
  });

  it('splits a page just below the panorama ratio', () => {
    assert.equal(classifyPage(PANORAMA_RATIO * 1000 - 1, 1000), 'spread');
  });

  it('treats a very wide foldout as a panorama, not a spread', () => {
    assert.equal(classifyPage(6000, 1800), 'panorama');
  });

  it('falls back to single when a dimension is missing', () => {
    assert.equal(classifyPage(null, 1800), 'single');
    assert.equal(classifyPage(2400, null), 'single');
    assert.equal(classifyPage(undefined, undefined), 'single');
  });

  it('falls back to single for nonsense dimensions', () => {
    assert.equal(classifyPage(0, 1800), 'single');
    assert.equal(classifyPage(-2400, 1800), 'single');
    assert.equal(classifyPage(Number.NaN, 1800), 'single');
    assert.equal(classifyPage(Number.POSITIVE_INFINITY, 1800), 'single');
  });
});

describe('buildPageViews', () => {
  it('maps one view per page when splitting is off', () => {
    const views = buildPageViews([portrait(1), spread(2), portrait(3)], false);
    assert.deepEqual(views, [
      { page: 1, half: null },
      { page: 2, half: null },
      { page: 3, half: null },
    ]);
  });

  it('gives a spread two views, left half first', () => {
    const views = buildPageViews([portrait(1), spread(2), portrait(3)], true);
    assert.deepEqual(views, [
      { page: 1, half: null },
      { page: 2, half: 'left' },
      { page: 2, half: 'right' },
      { page: 3, half: null },
    ]);
  });

  it('leaves a panorama whole even with splitting on', () => {
    const views = buildPageViews([{ n: 1, w: 6000, h: 1800 }], true);
    assert.deepEqual(views, [{ page: 1, half: null }]);
  });

  it('leaves an unmeasured page whole rather than guessing', () => {
    const views = buildPageViews([unknown(1)], true);
    assert.deepEqual(views, [{ page: 1, half: null }]);
  });

  it('splits a wide first page like any other', () => {
    const views = buildPageViews([spread(1)], true);
    assert.equal(views.length, 2);
    assert.equal(views[0].page, 1);
    assert.equal(views[1].page, 1);
  });

  it('never invents a page number', () => {
    const pages = [portrait(1), spread(2), spread(3), portrait(4)];
    const views = buildPageViews(pages, true);
    const seen = new Set(views.map((view) => view.page));
    assert.deepEqual([...seen].sort((a, b) => a - b), [1, 2, 3, 4]);
  });

  it('returns nothing for an empty issue', () => {
    assert.deepEqual(buildPageViews([], true), []);
  });
});

describe('firstViewIndexForPage', () => {
  const views = buildPageViews([portrait(1), spread(2), portrait(3)], true);

  it('finds an unsplit page', () => {
    assert.equal(firstViewIndexForPage(views, 1), 0);
    assert.equal(firstViewIndexForPage(views, 3), 3);
  });

  it('restores a spread to its left half, not its right', () => {
    assert.equal(firstViewIndexForPage(views, 2), 1);
  });

  it('opens at the start when the saved page no longer exists', () => {
    assert.equal(firstViewIndexForPage(views, 99), 0);
  });

  it('survives an empty view list', () => {
    assert.equal(firstViewIndexForPage([], 5), 0);
  });

  it('round-trips every page through the view list', () => {
    for (const page of [1, 2, 3]) {
      assert.equal(views[firstViewIndexForPage(views, page)].page, page);
    }
  });
});

describe('fitContain', () => {
  it('scales down to fit a narrower container', () => {
    assert.deepEqual(fitContain(1000, 500, 500, 500), { width: 500, height: 250 });
  });

  it('scales down to fit a shorter container', () => {
    assert.deepEqual(fitContain(500, 1000, 500, 500), { width: 250, height: 500 });
  });

  it('scales up to fill a larger container', () => {
    assert.deepEqual(fitContain(100, 50, 400, 400), { width: 400, height: 200 });
  });

  it('preserves the aspect ratio of half a spread', () => {
    // 2400x1800 split in half is 1200x1800, so doubling the fitted width
    // must reproduce the original 4:3 spread.
    const box = fitContain(1200, 1800, 900, 900);
    assert.ok(Math.abs((box.width * 2) / box.height - 2400 / 1800) < 1e-9);
  });

  it('returns a zero box before the container has been measured', () => {
    assert.deepEqual(fitContain(1200, 1800, 0, 0), { width: 0, height: 0 });
  });

  it('returns a zero box rather than NaN for nonsense input', () => {
    assert.deepEqual(fitContain(0, 1800, 900, 900), { width: 0, height: 0 });
    assert.deepEqual(fitContain(Number.NaN, 1800, 900, 900), { width: 0, height: 0 });
  });
});
