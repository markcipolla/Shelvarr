/**
 * The reader's settings maths, with no reader attached.
 *
 * Three things are worth pinning down away from epub.js. Normalisation,
 * because these values arrive from a database row that an older build wrote
 * and a reader must never be handed a line height of "banana". The generated
 * stylesheet, because a publisher's own CSS will win any fight it is allowed
 * to have — the `!important`s are load-bearing, not habit. And the time
 * estimate, because "about 12 minutes left in this chapter" is the one number
 * in the reader that a person will actually plan their evening around.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  DEFAULT_READER_PREFERENCES,
  READER_PREFERENCE_RANGES,
  normaliseReaderPreferences,
  readerStylesheet,
  stepPreference,
} from '../../lib/reader/preferences.js';
import {
  CHARS_PER_LOCATION,
  cfiSpineBase,
  describeMinutes,
  estimateReading,
} from '../../lib/reader/progress.js';
import {
  annotationPreview,
  byKind,
  findBookmarkAt,
  type ReaderAnnotation,
} from '../../lib/reader/annotations.js';

describe('normaliseReaderPreferences', () => {
  it('returns the defaults for nothing at all', () => {
    assert.deepStrictEqual(normaliseReaderPreferences(null), DEFAULT_READER_PREFERENCES);
    assert.deepStrictEqual(normaliseReaderPreferences(undefined), DEFAULT_READER_PREFERENCES);
    assert.deepStrictEqual(normaliseReaderPreferences('sepia'), DEFAULT_READER_PREFERENCES);
  });

  it('keeps the values it recognises', () => {
    const prefs = normaliseReaderPreferences({
      theme: 'sepia',
      typeface: 'serif',
      fontSizePercent: 130,
      lineHeight: 1.8,
      marginPercent: 12,
      textAlign: 'justify',
      hideHeader: true,
      wordsPerMinute: 320,
    });
    assert.strictEqual(prefs.theme, 'sepia');
    assert.strictEqual(prefs.typeface, 'serif');
    assert.strictEqual(prefs.fontSizePercent, 130);
    assert.strictEqual(prefs.lineHeight, 1.8);
    assert.strictEqual(prefs.marginPercent, 12);
    assert.strictEqual(prefs.textAlign, 'justify');
    assert.strictEqual(prefs.hideHeader, true);
    assert.strictEqual(prefs.wordsPerMinute, 320);
  });

  it('falls back rather than failing on a value it does not know', () => {
    const prefs = normaliseReaderPreferences({ theme: 'neon', typeface: 'comic', textAlign: 5 });
    assert.strictEqual(prefs.theme, DEFAULT_READER_PREFERENCES.theme);
    assert.strictEqual(prefs.typeface, DEFAULT_READER_PREFERENCES.typeface);
    assert.strictEqual(prefs.textAlign, DEFAULT_READER_PREFERENCES.textAlign);
  });

  it('clamps numbers into range instead of trusting them', () => {
    const huge = normaliseReaderPreferences({ fontSizePercent: 100000, lineHeight: 99 });
    assert.strictEqual(huge.fontSizePercent, READER_PREFERENCE_RANGES.fontSizePercent.max);
    assert.strictEqual(huge.lineHeight, READER_PREFERENCE_RANGES.lineHeight.max);

    const tiny = normaliseReaderPreferences({ fontSizePercent: -4, marginPercent: -100 });
    assert.strictEqual(tiny.fontSizePercent, READER_PREFERENCE_RANGES.fontSizePercent.min);
    assert.strictEqual(tiny.marginPercent, READER_PREFERENCE_RANGES.marginPercent.min);
  });

  it('treats an unparseable number as absent', () => {
    const prefs = normaliseReaderPreferences({ lineHeight: 'banana', wordsPerMinute: NaN });
    assert.strictEqual(prefs.lineHeight, DEFAULT_READER_PREFERENCES.lineHeight);
    assert.strictEqual(prefs.wordsPerMinute, DEFAULT_READER_PREFERENCES.wordsPerMinute);
  });

  it('ignores keys it has never heard of', () => {
    const prefs = normaliseReaderPreferences({ theme: 'dark', pageCurlSound: true });
    assert.strictEqual(prefs.theme, 'dark');
    assert.ok(!('pageCurlSound' in prefs));
  });
});

describe('stepPreference', () => {
  it('moves by one step and stops at the ends', () => {
    const range = READER_PREFERENCE_RANGES.fontSizePercent;
    assert.strictEqual(stepPreference(100, range, 1), 110);
    assert.strictEqual(stepPreference(100, range, -1), 90);
    assert.strictEqual(stepPreference(range.max, range, 1), range.max);
    assert.strictEqual(stepPreference(range.min, range, -1), range.min);
  });

  it('does not accumulate floating point crumbs on line height', () => {
    const range = READER_PREFERENCE_RANGES.lineHeight;
    let value = 1.5;
    for (let i = 0; i < 5; i++) value = stepPreference(value, range, 1);
    assert.strictEqual(value, 2);
  });
});

describe('readerStylesheet', () => {
  it('overrides the publisher, because a setting a book can veto is not a setting', () => {
    const css = readerStylesheet({ ...DEFAULT_READER_PREFERENCES, theme: 'dark' });
    assert.match(css, /background: #15171c !important/);
    assert.match(css, /color: #c9ced8 !important/);
  });

  it('carries the type size, line height and margins through', () => {
    const css = readerStylesheet({
      ...DEFAULT_READER_PREFERENCES,
      fontSizePercent: 140,
      lineHeight: 1.9,
      marginPercent: 10,
    });
    assert.match(css, /font-size: 140% !important/);
    assert.match(css, /line-height: 1\.9 !important/);
    assert.match(css, /padding-left: 10% !important/);
    assert.match(css, /padding-right: 10% !important/);
  });

  it('offers the book a serif even though the chrome never gets one', () => {
    const serif = readerStylesheet({ ...DEFAULT_READER_PREFERENCES, typeface: 'serif' });
    assert.match(serif, /font-family: .*Georgia.*serif !important/);
  });

  it('says nothing about the typeface when the publisher is left in charge', () => {
    const original = readerStylesheet({ ...DEFAULT_READER_PREFERENCES, typeface: 'original' });
    assert.ok(!original.includes('font-family'));
  });

  it('leaves alignment alone unless asked', () => {
    assert.ok(!readerStylesheet(DEFAULT_READER_PREFERENCES).includes('text-align'));
    assert.match(
      readerStylesheet({ ...DEFAULT_READER_PREFERENCES, textAlign: 'justify' }),
      /text-align: justify !important/
    );
  });

  it('normalises before generating, so a bad row cannot produce bad CSS', () => {
    const css = readerStylesheet({ ...DEFAULT_READER_PREFERENCES, fontSizePercent: 1e9 });
    assert.match(css, /font-size: 250% !important/);
  });
});

describe('cfiSpineBase', () => {
  it('is the part before the bang', () => {
    assert.strictEqual(cfiSpineBase('epubcfi(/6/14!/4/2/1:0)'), 'epubcfi(/6/14');
  });

  it('treats a CFI with no bang as its own chapter', () => {
    assert.strictEqual(cfiSpineBase('epubcfi(/6/14)'), 'epubcfi(/6/14)');
  });
});

/** Six locations across three chapters: two, three, one. */
const LOCATIONS = [
  'epubcfi(/6/2!/4/2/1:0)',
  'epubcfi(/6/2!/4/8/1:0)',
  'epubcfi(/6/4!/4/2/1:0)',
  'epubcfi(/6/4!/4/6/1:0)',
  'epubcfi(/6/4!/4/9/1:0)',
  'epubcfi(/6/6!/4/2/1:0)',
];

describe('estimateReading', () => {
  it('reports nothing rather than guessing before locations exist', () => {
    const estimate = estimateReading({ locations: [], currentIndex: 0, wordsPerMinute: 240 });
    assert.deepStrictEqual(estimate, {
      bookPercent: 0,
      chapterPercent: 0,
      minutesLeftInBook: 0,
      minutesLeftInChapter: 0,
    });
  });

  it('puts the start at 0% and the end at 100%', () => {
    assert.strictEqual(
      estimateReading({ locations: LOCATIONS, currentIndex: 0, wordsPerMinute: 240 }).bookPercent,
      0
    );
    const end = estimateReading({ locations: LOCATIONS, currentIndex: 5, wordsPerMinute: 240 });
    assert.strictEqual(end.bookPercent, 100);
    assert.strictEqual(end.minutesLeftInBook, 0);
  });

  it('finds the chapter around the current spot from the CFIs alone', () => {
    // Index 3 is the second of the middle chapter's three locations.
    const estimate = estimateReading({ locations: LOCATIONS, currentIndex: 3, wordsPerMinute: 240 });
    assert.strictEqual(estimate.chapterPercent, 50);
  });

  it('counts only what is left in the chapter, not what is left in the book', () => {
    const estimate = estimateReading({ locations: LOCATIONS, currentIndex: 2, wordsPerMinute: 240 });
    // Two locations left in the chapter; three left in the book.
    assert.ok(estimate.minutesLeftInChapter < estimate.minutesLeftInBook);
    assert.strictEqual(
      Math.round((estimate.minutesLeftInBook / estimate.minutesLeftInChapter) * 100) / 100,
      1.5
    );
  });

  it('takes longer for a slower reader', () => {
    const quick = estimateReading({ locations: LOCATIONS, currentIndex: 0, wordsPerMinute: 400 });
    const slow = estimateReading({ locations: LOCATIONS, currentIndex: 0, wordsPerMinute: 200 });
    assert.ok(slow.minutesLeftInBook > quick.minutesLeftInBook);
  });

  it('lands in the right ballpark for a paperback-sized chunk', () => {
    // 60 locations at ~1024 characters is roughly 10,600 words, which is a
    // shade under three-quarters of an hour at 240 wpm.
    const locations = Array.from({ length: 61 }, (_, i) => `epubcfi(/6/2!/4/${i}/1:0)`);
    const estimate = estimateReading({
      locations,
      currentIndex: 0,
      charsPerLocation: CHARS_PER_LOCATION,
      wordsPerMinute: 240,
    });
    assert.ok(estimate.minutesLeftInBook > 40, `got ${estimate.minutesLeftInBook}`);
    assert.ok(estimate.minutesLeftInBook < 50, `got ${estimate.minutesLeftInBook}`);
  });

  it('copes with an index past the end rather than reporting nonsense', () => {
    const estimate = estimateReading({ locations: LOCATIONS, currentIndex: 99, wordsPerMinute: 240 });
    assert.strictEqual(estimate.bookPercent, 100);
    assert.strictEqual(estimate.minutesLeftInBook, 0);
  });
});

describe('describeMinutes', () => {
  it('is vague on purpose', () => {
    assert.strictEqual(describeMinutes(11.7), 'about 12 minutes');
    assert.strictEqual(describeMinutes(1.2), 'about a minute');
  });

  it('never says "about 0 minutes"', () => {
    assert.strictEqual(describeMinutes(0), 'less than a minute');
    assert.strictEqual(describeMinutes(0.3), 'less than a minute');
    assert.strictEqual(describeMinutes(-5), 'less than a minute');
    assert.strictEqual(describeMinutes(NaN), 'less than a minute');
  });

  it('switches to hours for a long haul', () => {
    assert.strictEqual(describeMinutes(60), 'about an hour');
    assert.strictEqual(describeMinutes(65), 'about an hour 5 min');
    assert.strictEqual(describeMinutes(150), 'about 2 hours 30 min');
  });
});

function annotation(over: Partial<ReaderAnnotation>): ReaderAnnotation {
  return {
    id: 1,
    bookId: 7,
    kind: 'bookmark',
    cfi: 'epubcfi(/6/2!/4/2/1:0)',
    text: null,
    colour: null,
    created: '2026-09-17T00:00:00.000Z',
    ...over,
  };
}

describe('annotation helpers', () => {
  it('finds a bookmark only at the exact spot, and only a bookmark', () => {
    const marks = [
      annotation({ id: 1, cfi: 'a' }),
      annotation({ id: 2, kind: 'highlight', cfi: 'b' }),
    ];
    assert.strictEqual(findBookmarkAt(marks, 'a')?.id, 1);
    assert.strictEqual(findBookmarkAt(marks, 'b'), undefined);
    assert.strictEqual(findBookmarkAt(marks, null), undefined);
  });

  it('splits by kind', () => {
    const marks = [annotation({ id: 1 }), annotation({ id: 2, kind: 'highlight' })];
    assert.deepStrictEqual(byKind(marks, 'bookmark').map((a) => a.id), [1]);
    assert.deepStrictEqual(byKind(marks, 'highlight').map((a) => a.id), [2]);
  });

  it('describes a mark with no text rather than showing an empty row', () => {
    assert.strictEqual(annotationPreview(annotation({})), 'Bookmarked position');
    assert.strictEqual(
      annotationPreview(annotation({ kind: 'highlight', text: '   ' })),
      'Highlighted passage'
    );
  });

  it('cuts a long excerpt at a word boundary', () => {
    const text = 'There is no greater agony than bearing an untold story inside you, she wrote once';
    const preview = annotationPreview(annotation({ text }), 40);
    assert.ok(preview.endsWith('…'));
    assert.ok(!preview.slice(0, -1).endsWith(' '));
    assert.ok(text.startsWith(preview.slice(0, -1)));
  });

  it('collapses the whitespace an EPUB selection drags along', () => {
    assert.strictEqual(annotationPreview(annotation({ text: '  a\n  b  ' })), 'a b');
  });
});
