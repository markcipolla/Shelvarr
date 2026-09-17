'use client';

/**
 * The EPUB reader.
 *
 * Three things live here that are easy to break and worth knowing about
 * before editing:
 *
 * - **Offline caching (E3-6).** The book's bytes are read from IndexedDB
 *   before the network is touched, and a network fetch still runs afterwards
 *   to refresh the cached copy. Do not turn that back into a plain fetch.
 * - **Progression (E3-1).** The reading position round-trips through
 *   `/api/books/[id]/progression`, debounced while turning pages and flushed
 *   on close and unmount.
 * - **Preferences (E3-5).** Type size, typeface, line height, margins and
 *   theme come from `/api/reader/preferences`, which is per *user* and not
 *   per device — that is what makes them follow you between machines, and it
 *   is the one meaningful difference from progression above.
 *
 * Nearly everything visual is epub.js configuration rather than new
 * machinery: a stylesheet injected into the book's iframe
 * ({@link readerStylesheet}), a re-themed copy of react-reader's own chrome
 * ({@link buildReaderStyles}), and arithmetic over epub.js's generated
 * locations for progress and time remaining ({@link estimateReading}).
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ReactReader } from 'react-reader';
import type { IEpubViewProps } from 'react-reader';
import type { Book } from '@/types';
import { formatAuthors } from '@/lib/utils/authors';
import { getCachedBlob, putCachedBlob, epubCacheKey, isOffline } from '@/lib/offline/bookCache';
import {
  DEFAULT_READER_PREFERENCES,
  READER_THEME_PALETTES,
  normaliseReaderPreferences,
  readerStylesheet,
  type ReaderPreferences,
  type ReaderThemePalette,
} from '@/lib/reader/preferences';
import { buildReaderStyles } from '@/lib/reader/readerStyles';
import { CHARS_PER_LOCATION, describeMinutes, estimateReading } from '@/lib/reader/progress';
import { findBookmarkAt, type ReaderAnnotation } from '@/lib/reader/annotations';
import { ReaderSettingsPanel } from './ReaderSettingsPanel';
import { ReaderNotesPanel, type ReaderSearchResult } from './ReaderNotesPanel';

interface EpubReaderProps {
  book: Book;
  onClose: () => void;
}

// epub.js types reached through react-reader's own prop types rather than a
// direct `epubjs` import: epub.js is react-reader's dependency, not ours, and
// adding it to package.json purely to name two types would be a lie about
// what this app depends on.
type Rendition = Parameters<NonNullable<IEpubViewProps['getRendition']>>[0];
type NavItem = Parameters<NonNullable<IEpubViewProps['tocChanged']>>[0][number];

// Progress is saved under a fixed 'web' device id rather than a persisted
// per-browser UUID — the browser isn't a "device" the way a phone is, and a
// single shared id keeps this simple while still separating web progress
// from any native devices reading the same book.
const WEB_DEVICE_ID = 'web';

// A second or two is plenty to avoid firing a PUT on every page-turn while
// still saving well before someone closes the tab.
const SAVE_DEBOUNCE_MS = 1500;

// Preferences change in bursts — nobody presses "bigger" once — so this is
// shorter than the progression debounce but still collapses a run of clicks
// into one write.
const PREFERENCES_DEBOUNCE_MS = 600;

type PanelKind = 'none' | 'display' | 'notes';

export function EpubReader({ book, onClose }: EpubReaderProps) {
  const [location, setLocation] = useState<string | number>(0);
  const [epubData, setEpubData] = useState<ArrayBuffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [preferences, setPreferences] = useState<ReaderPreferences>(DEFAULT_READER_PREFERENCES);
  const [panel, setPanel] = useState<PanelKind>('none');

  const [toc, setToc] = useState<NavItem[]>([]);
  const [chapterHref, setChapterHref] = useState<string | null>(null);
  const [locationList, setLocationList] = useState<string[]>([]);

  const [annotations, setAnnotations] = useState<ReaderAnnotation[]>([]);
  const [selection, setSelection] = useState<{ cfiRange: string; text: string } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ReaderSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const renditionRef = useRef<Rendition | null>(null);

  const palette = READER_THEME_PALETTES[preferences.theme];
  const readerStyles = useMemo(() => buildReaderStyles(palette), [palette]);

  // Fetch epub as ArrayBuffer, checking the offline cache first so a book
  // that's already been opened once opens instantly and works with no
  // network at all. Whether or not there's a cache hit, a network fetch
  // still runs in the background (unless we're offline) so a re-download or
  // re-scan on the server doesn't leave the cached copy stale forever — it
  // just doesn't block the initial render when a cached copy exists.
  useEffect(() => {
    let cancelled = false;
    const cacheKey = epubCacheKey(book.id);

    const loadFromCache = async () => {
      const cached = await getCachedBlob(cacheKey);
      if (cancelled || !cached) return false;
      const buffer = await cached.arrayBuffer();
      if (cancelled) return false;
      setEpubData(buffer);
      setLoading(false);
      return true;
    };

    const fetchAndCache = async (hadCache: boolean) => {
      try {
        const response = await fetch(`/api/books/${book.id}/file`);
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error || 'Failed to load book');
        }
        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;
        setEpubData(arrayBuffer);
        setError(null);
        putCachedBlob(cacheKey, new Blob([arrayBuffer])).catch(() => {
          // Non-critical: see bookCache.ts.
        });
      } catch (err) {
        if (cancelled) return;
        // A cached copy is already on screen — a failed background refresh
        // (offline or otherwise) shouldn't interrupt that with an error.
        if (!hadCache) {
          setError(err instanceof Error ? err.message : 'Failed to load book');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    (async () => {
      const hadCache = await loadFromCache();

      if (isOffline()) {
        if (!hadCache && !cancelled) {
          setError('This book isn’t available offline yet. Connect to the internet to open it once, and it will be available offline after that.');
          setLoading(false);
        }
        return;
      }

      await fetchAndCache(hadCache);
    })();

    return () => {
      cancelled = true;
    };
  }, [book.id]);

  // Restore reading position from the last-saved progression across this
  // person's devices (e.g. picking up where they left off on their phone),
  // falling back to the start of the book if there is none.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/books/${book.id}/progression`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.locator) {
          setLocation(data.locator);
        }
      })
      .catch(() => {
        // Non-critical: worst case the book opens at the cover.
      });
    return () => {
      cancelled = true;
    };
  }, [book.id]);

  // Reader preferences: per user, so this is fetched once per reader session
  // rather than per book. Defaults stay on screen while it's in flight —
  // waiting for a font size before showing words would be silly.
  const preferencesLoadedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/reader/preferences')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setPreferences(normaliseReaderPreferences(data));
      })
      .catch(() => {
        // Non-critical: the defaults are perfectly readable.
      })
      .finally(() => {
        if (!cancelled) preferencesLoadedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Bookmarks and highlights for this book.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/books/${book.id}/annotations`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setAnnotations(data as ReaderAnnotation[]);
      })
      .catch(() => {
        // Non-critical: reading still works without them.
      });
    return () => {
      cancelled = true;
    };
  }, [book.id]);

  // Fire-and-forget: mark as "currently reading" on Hardcover when the reader opens
  useEffect(() => {
    if (book.metadataSource !== 'hardcover') return;
    fetch(`/api/books/${book.id}/reading-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'reading' }),
    }).catch(() => {
      // Non-critical: don't interrupt reading if the sync fails
    });
  }, [book.id, book.metadataSource]);

  // ---- Progress and time remaining -------------------------------------

  const estimate = useMemo(() => {
    const rendition = renditionRef.current;
    if (!rendition || locationList.length === 0 || typeof location !== 'string') return null;
    let index = -1;
    try {
      // epub.js types this as a `Location`; it returns a plain index.
      index = rendition.book.locations.locationFromCfi(location) as unknown as number;
    } catch {
      return null;
    }
    if (typeof index !== 'number' || !Number.isFinite(index)) return null;
    return estimateReading({
      locations: locationList,
      currentIndex: index,
      wordsPerMinute: preferences.wordsPerMinute,
    });
  }, [locationList, location, preferences.wordsPerMinute]);

  // Held in a ref so the (debounced, stable-identity) save callback can read
  // the latest percentage without being rebuilt on every page turn.
  const bookProgressionRef = useRef(0);
  bookProgressionRef.current = estimate ? estimate.bookPercent / 100 : 0;

  /**
   * The chapter name for the page on screen, matched by filename.
   *
   * The table of contents and the spine spell the same document differently
   * — `Text/chapter-3.xhtml` against `chapter-3.xhtml#start` — so only the
   * last path segment, minus any fragment, is comparable. Returns null rather
   * than guessing when nothing matches; a bookmark with no chapter name is
   * better than one with the wrong chapter name.
   */
  const chapterLabel = useMemo(() => {
    if (!chapterHref) return null;
    const fileName = (href: string) => href.split('#')[0]?.split('/').pop() ?? '';
    const target = fileName(chapterHref);
    if (!target) return null;

    const walk = (items: NavItem[]): string | null => {
      for (const item of items) {
        if (item.href && fileName(item.href) === target) return item.label?.trim() || null;
        const nested = item.subitems ? walk(item.subitems) : null;
        if (nested) return nested;
      }
      return null;
    };
    return walk(toc);
  }, [chapterHref, toc]);

  // ---- Saving progression ----------------------------------------------

  // Saves the current position to the progression store. The route stores a
  // string `locator` as-is (it only JSON.stringifies non-string bodies), so
  // the epubcfi is pre-encoded here to keep it round-trippable through the
  // GET route's `JSON.parse(row.locator)`.
  const saveProgression = useCallback((epubcfi: string) => {
    fetch(`/api/books/${book.id}/progression`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: WEB_DEVICE_ID,
        // A real 0–1 figure now that locations are generated for the
        // progress bar anyway (they weren't when E3-1 shipped, which is why
        // this used to be a hard-coded 0). Still 0 in the window before
        // generation finishes, which only means the Hardcover "completed"
        // auto-sync waits for the numbers it needs.
        progression: bookProgressionRef.current,
        locator: JSON.stringify(epubcfi),
      }),
    }).catch(() => {
      // Non-critical: losing one save just means resuming a little further back.
    });
  }, [book.id]);

  const pendingLocationRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (pendingLocationRef.current) {
      const epubcfi = pendingLocationRef.current;
      pendingLocationRef.current = null;
      saveProgression(epubcfi);
    }
  }, [saveProgression]);

  // Flush any pending save on unmount, so navigating away right after
  // turning a page doesn't lose it to the debounce window.
  useEffect(() => {
    return () => {
      flushSave();
    };
  }, [flushSave]);

  const handleClose = useCallback(() => {
    flushSave();
    onClose();
  }, [flushSave, onClose]);

  const locationChanged = useCallback((epubcfi: string) => {
    setLocation(epubcfi);
    pendingLocationRef.current = epubcfi;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const pending = pendingLocationRef.current;
      pendingLocationRef.current = null;
      if (pending) saveProgression(pending);
    }, SAVE_DEBOUNCE_MS);
  }, [saveProgression]);

  // ---- Saving preferences ----------------------------------------------

  const prefsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePreferences = useCallback((patch: Partial<ReaderPreferences>) => {
    setPreferences((current) => {
      const next = normaliseReaderPreferences({ ...current, ...patch });
      if (prefsTimerRef.current) clearTimeout(prefsTimerRef.current);
      prefsTimerRef.current = setTimeout(() => {
        prefsTimerRef.current = null;
        // Skipped until the initial GET has settled: otherwise a fast click
        // could write defaults over preferences still in flight.
        if (!preferencesLoadedRef.current) return;
        fetch('/api/reader/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        }).catch(() => {
          // Non-critical: the setting still applies for this session.
        });
      }, PREFERENCES_DEBOUNCE_MS);
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (prefsTimerRef.current) clearTimeout(prefsTimerRef.current);
    };
  }, []);

  // ---- epub.js wiring ---------------------------------------------------

  const applyStylesheet = useCallback((rendition: Rendition, prefs: ReaderPreferences) => {
    try {
      // 'default' specifically: epub.js only re-injects a theme into the
      // already-rendered pages when the registered name is 'default', and
      // registerCss replaces the injected <style> wholesale where
      // registerRules would append a fresh copy of every rule each time.
      rendition.themes.registerCss('default', readerStylesheet(prefs));
    } catch {
      // A rendition torn down mid-update is not worth an error.
    }
  }, []);

  // react-reader hands the rendition over exactly once, at init, so this must
  // not depend on anything that changes: it reads the current preferences
  // through a ref, and the effect below keeps them applied afterwards.
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;

  const handleRendition = useCallback((rendition: Rendition) => {
    renditionRef.current = rendition;
    applyStylesheet(rendition, preferencesRef.current);

    rendition.on('relocated', (loc: { start?: { href?: string } }) => {
      setChapterHref(loc?.start?.href ?? null);
    });

    // Locations are what make a progress bar and a time estimate possible at
    // all; generating them walks the whole book, so it happens once, off the
    // critical path, and the reader shows no numbers until it lands.
    rendition.book.ready
      .then(() => rendition.book.locations.generate(CHARS_PER_LOCATION))
      .then((generated) => {
        if (Array.isArray(generated)) setLocationList(generated);
      })
      .catch(() => {
        // Non-critical: without locations the reader simply omits progress.
      });
  }, [applyStylesheet]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (rendition) applyStylesheet(rendition, preferences);
  }, [applyStylesheet, preferences]);

  // Re-draw highlights whenever the set changes or the theme does — epub.js
  // keeps them per rendition, not per book, so nothing carries over a reopen.
  const drawnHighlightsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    const wanted = new Set(annotations.filter((a) => a.kind === 'highlight').map((a) => a.cfi));

    for (const cfi of drawnHighlightsRef.current) {
      if (!wanted.has(cfi)) {
        try {
          rendition.annotations.remove(cfi, 'highlight');
        } catch {
          // Already gone with the view it was attached to.
        }
        drawnHighlightsRef.current.delete(cfi);
      }
    }
    for (const cfi of wanted) {
      if (drawnHighlightsRef.current.has(cfi)) continue;
      try {
        rendition.annotations.highlight(cfi, {}, undefined, undefined, {
          fill: palette.highlight,
          'fill-opacity': '1',
          'mix-blend-mode': 'multiply',
        });
        drawnHighlightsRef.current.add(cfi);
      } catch {
        // A CFI from a different edition of the file won't resolve; skip it.
      }
    }
  }, [annotations, palette.highlight, locationList]);

  // ---- Bookmarks and highlights ----------------------------------------

  const currentCfi = typeof location === 'string' ? location : null;
  const bookmarkHere = findBookmarkAt(annotations, currentCfi);

  const addAnnotation = useCallback(
    async (kind: 'bookmark' | 'highlight', cfi: string, text: string | null) => {
      try {
        const response = await fetch(`/api/books/${book.id}/annotations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, cfi, text }),
        });
        if (!response.ok) return;
        const saved = (await response.json()) as ReaderAnnotation;
        setAnnotations((current) =>
          current.some((a) => a.id === saved.id) ? current : [...current, saved]
        );
      } catch {
        // Non-critical: the reader stays usable, the mark just isn't kept.
      }
    },
    [book.id]
  );

  const removeAnnotation = useCallback(
    async (annotation: ReaderAnnotation) => {
      // Removed from the list first: a bookmark that lingers until a round
      // trip finishes reads as a broken button.
      setAnnotations((current) => current.filter((a) => a.id !== annotation.id));
      try {
        await fetch(`/api/books/${book.id}/annotations?annotationId=${annotation.id}`, {
          method: 'DELETE',
        });
      } catch {
        // Non-critical: it will come back on the next open, not be lost.
      }
    },
    [book.id]
  );

  const toggleBookmark = useCallback(() => {
    if (!currentCfi) return;
    if (bookmarkHere) {
      void removeAnnotation(bookmarkHere);
    } else {
      void addAnnotation('bookmark', currentCfi, chapterLabel);
    }
  }, [addAnnotation, bookmarkHere, chapterLabel, currentCfi, removeAnnotation]);

  const handleTextSelected = useCallback((cfiRange: string) => {
    const rendition = renditionRef.current;
    let text = '';
    try {
      text = rendition?.getRange(cfiRange)?.toString() ?? '';
    } catch {
      text = '';
    }
    setSelection({ cfiRange, text: text.trim() });
  }, []);

  // ---- Navigation and keyboard -----------------------------------------

  const goNext = useCallback(() => {
    void renditionRef.current?.next();
  }, []);
  const goPrev = useCallback(() => {
    void renditionRef.current?.prev();
  }, []);

  const jumpTo = useCallback((cfi: string) => {
    setLocation(cfi);
    setPanel('none');
  }, []);

  const closePanelOrReader = useCallback(() => {
    if (selection) {
      setSelection(null);
      return;
    }
    if (panel !== 'none') {
      setPanel('none');
      return;
    }
    handleClose();
  }, [handleClose, panel, selection]);

  /**
   * One handler for keys pressed anywhere in the reader, including inside the
   * book's own iframe — react-reader forwards those through its
   * `handleKeyPress` prop, and passing that prop also switches off its own
   * arrow-key handling, so there is exactly one place page turns happen.
   */
  const handleReaderKey = useCallback(
    (event?: KeyboardEvent) => {
      if (!event) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key) {
        case 'ArrowRight':
        case 'PageDown':
          event.preventDefault();
          goNext();
          break;
        case 'ArrowLeft':
        case 'PageUp':
          event.preventDefault();
          goPrev();
          break;
        case ' ':
          event.preventDefault();
          if (event.shiftKey) goPrev();
          else goNext();
          break;
        case 'Escape':
          event.preventDefault();
          closePanelOrReader();
          break;
        case 'b':
        case 'B':
          event.preventDefault();
          toggleBookmark();
          break;
        case 'd':
        case 'D':
          event.preventDefault();
          setPanel((current) => (current === 'display' ? 'none' : 'display'));
          break;
        case '/':
        case 'f':
        case 'F':
          event.preventDefault();
          setPanel('notes');
          break;
        case 'h':
        case 'H':
          event.preventDefault();
          updatePreferences({ hideHeader: !preferences.hideHeader });
          break;
        default:
          break;
      }
    },
    [closePanelOrReader, goNext, goPrev, preferences.hideHeader, toggleBookmark, updatePreferences]
  );

  /**
   * A stable front door to the handler above.
   *
   * react-reader registers `handleKeyPress` on the rendition exactly once,
   * when the book is first rendered, and never looks at the prop again — so
   * handing it a `useCallback` that changes identity would leave the book's
   * iframe talking to a closure from the first render, with the wrong
   * bookmark state and the wrong preferences. The indirection through a ref
   * is what keeps iframe keys and window keys behaving identically.
   */
  const keyHandlerRef = useRef(handleReaderKey);
  keyHandlerRef.current = handleReaderKey;
  const stableKeyHandler = useCallback((event?: KeyboardEvent) => {
    keyHandlerRef.current(event);
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', stableKeyHandler as EventListener);
    return () => document.removeEventListener('keydown', stableKeyHandler as EventListener);
  }, [stableKeyHandler]);

  // ---- Search -----------------------------------------------------------

  const runSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setSearchResults([]);
    setSearching(query.length > 0);
  }, []);

  const handleSearchResults = useCallback((results: ReaderSearchResult[]) => {
    setSearchResults(results);
    setSearching(false);
  }, []);

  // ---- Render -----------------------------------------------------------

  const progressLabel = estimate
    ? `${Math.round(estimate.bookPercent)}% through the book`
    : 'Working out where you are…';
  const chapterRemaining = estimate
    ? `${describeMinutes(estimate.minutesLeftInChapter)} left in this chapter`
    : null;

  return (
    <div
      className="fixed inset-0 !-mt-0 z-50 flex flex-col"
      style={{ background: palette.chrome }}
    >
      {preferences.hideHeader ? (
        <ImmersiveControls
          palette={palette}
          onShowHeader={() => updatePreferences({ hideHeader: false })}
          onClose={handleClose}
        />
      ) : (
        <div
          className="flex items-center justify-between gap-3 px-4 py-3"
          style={{ background: palette.chrome, borderBottom: `1px solid ${palette.border}` }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <IconButton label="Close reader" palette={palette} onClick={handleClose}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </IconButton>
            <div className="min-w-0">
              <h1 className="line-clamp-1 font-medium" style={{ color: palette.chromeText }}>
                {book.title || 'Unknown Title'}
              </h1>
              {book.authors && (
                <p className="line-clamp-1 text-sm" style={{ color: palette.chromeMuted }}>
                  {formatAuthors(book.authors)}
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <IconButton
              label={bookmarkHere ? 'Remove bookmark' : 'Bookmark this spot'}
              palette={palette}
              active={Boolean(bookmarkHere)}
              onClick={toggleBookmark}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z"
              />
            </IconButton>
            <IconButton
              label="Bookmarks, highlights and search"
              palette={palette}
              active={panel === 'notes'}
              onClick={() => setPanel((p) => (p === 'notes' ? 'none' : 'notes'))}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"
              />
            </IconButton>
            <IconButton
              label="Display settings"
              palette={palette}
              active={panel === 'display'}
              onClick={() => setPanel((p) => (p === 'display' ? 'none' : 'display'))}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h8M16 17h4"
              />
              <circle cx="16" cy="7" r="2" strokeWidth={2} />
              <circle cx="10" cy="12" r="2" strokeWidth={2} />
              <circle cx="14" cy="17" r="2" strokeWidth={2} />
            </IconButton>
            <IconButton
              label="Hide the header"
              palette={palette}
              onClick={() => updatePreferences({ hideHeader: true })}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3"
              />
            </IconButton>
          </div>
        </div>
      )}

      {/* Reader */}
      <div className="relative flex-1" style={{ background: palette.background }}>
        {loading && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
              <p className="mt-4" style={{ color: palette.chromeMuted }}>Loading book...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-red-600">
              <p className="text-lg font-medium">Failed to load book</p>
              <p className="mt-2">{error}</p>
              <button
                onClick={handleClose}
                className="mt-4 rounded bg-gray-200 px-4 py-2 hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {epubData && (
          <ReactReader
            url={epubData}
            location={location}
            locationChanged={locationChanged}
            showToc={true}
            readerStyles={readerStyles}
            getRendition={handleRendition}
            tocChanged={setToc}
            handleKeyPress={stableKeyHandler}
            handleTextSelected={handleTextSelected}
            searchQuery={searchQuery}
            onSearchResults={handleSearchResults}
            epubOptions={{
              flow: 'scrolled',
              manager: 'continuous',
            }}
          />
        )}

        {selection && (
          <SelectionBar
            palette={palette}
            text={selection.text}
            onHighlight={() => {
              void addAnnotation('highlight', selection.cfiRange, selection.text || null);
              setSelection(null);
            }}
            onDismiss={() => setSelection(null)}
          />
        )}

        {panel !== 'none' && (
          <aside
            className="absolute bottom-0 right-0 top-0 z-30 w-full max-w-sm overflow-y-auto p-4 shadow-2xl"
            style={{ background: palette.chrome, borderLeft: `1px solid ${palette.border}` }}
            // Not the same wording as the button that opens it: two things
            // with the same accessible name is two things a screen reader
            // cannot tell apart.
            aria-label={panel === 'display' ? 'Display settings panel' : 'Marks and search panel'}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold" style={{ color: palette.chromeText }}>
                {panel === 'display' ? 'Display' : 'Marks & search'}
              </h2>
              <IconButton label="Close panel" palette={palette} onClick={() => setPanel('none')}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </IconButton>
            </div>

            {panel === 'display' ? (
              <ReaderSettingsPanel
                preferences={preferences}
                palette={palette}
                onChange={updatePreferences}
              />
            ) : (
              <ReaderNotesPanel
                annotations={annotations}
                palette={palette}
                searchQuery={searchQuery}
                searchResults={searchResults}
                searching={searching}
                onSearch={runSearch}
                onJumpTo={jumpTo}
                onDelete={(annotation) => void removeAnnotation(annotation)}
              />
            )}
          </aside>
        )}
      </div>

      {/* Progress strip. In immersive mode it shrinks to a hairline with no
          text: still tells you where you are, stops being furniture. */}
      <div
        className={preferences.hideHeader ? '' : 'flex items-center gap-3 px-4 py-2 text-xs'}
        style={
          preferences.hideHeader
            ? { background: palette.chrome }
            : { background: palette.chrome, borderTop: `1px solid ${palette.border}` }
        }
      >
        <div
          className={`flex-1 overflow-hidden ${preferences.hideHeader ? 'h-0.5' : 'h-1 rounded-full'}`}
          style={{ background: palette.border }}
          role="progressbar"
          aria-label="Progress through the book"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={estimate ? Math.round(estimate.bookPercent) : undefined}
        >
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${estimate ? estimate.bookPercent : 0}%`, background: palette.link }}
          />
        </div>
        {!preferences.hideHeader && (
          <>
            <span className="shrink-0 tabular-nums" style={{ color: palette.chromeMuted }}>
              {progressLabel}
            </span>
            {chapterRemaining && (
              <span className="hidden shrink-0 sm:inline" style={{ color: palette.chromeMuted }}>
                · {chapterRemaining}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * What's left of the chrome once the header is hidden: a way back, and a way
 * out. Anything more and it isn't hidden.
 */
function ImmersiveControls({
  palette,
  onShowHeader,
  onClose,
}: {
  palette: ReaderThemePalette;
  onShowHeader: () => void;
  onClose: () => void;
}) {
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-40 flex gap-1">
      <div
        className="pointer-events-auto flex gap-1 rounded-full px-1 py-1 opacity-40 shadow transition-opacity hover:opacity-100 focus-within:opacity-100"
        style={{ background: palette.chrome }}
      >
        <IconButton label="Show the header" palette={palette} onClick={onShowHeader}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 9L4 4m0 0v4m0-4h4M15 9l5-5m0 0v4m0-4h-4M9 15l-5 5m0 0v-4m0 4h4M15 15l5 5m0 0v-4m0 4h-4"
          />
        </IconButton>
        <IconButton label="Close reader" palette={palette} onClick={onClose}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </IconButton>
      </div>
    </div>
  );
}

function SelectionBar({
  palette,
  text,
  onHighlight,
  onDismiss,
}: {
  palette: ReaderThemePalette;
  text: string;
  onHighlight: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="absolute bottom-4 left-1/2 z-40 flex max-w-[min(32rem,90%)] -translate-x-1/2 items-center gap-3 rounded-lg px-3 py-2 text-sm shadow-xl"
      style={{ background: palette.chrome, border: `1px solid ${palette.border}`, color: palette.chromeText }}
    >
      <span className="line-clamp-1 min-w-0 flex-1 italic" style={{ color: palette.chromeMuted }}>
        {text || 'Selected passage'}
      </span>
      <button
        type="button"
        onClick={onHighlight}
        className="shrink-0 rounded px-2 py-1 text-xs"
        style={{ border: `1px solid ${palette.link}`, color: palette.link }}
      >
        Highlight
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss selection"
        className="shrink-0 rounded px-2 py-1 text-xs"
        style={{ border: `1px solid ${palette.border}` }}
      >
        ✕
      </button>
    </div>
  );
}

function IconButton({
  label,
  palette,
  onClick,
  active,
  children,
}: {
  label: string;
  palette: ReaderThemePalette;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className="rounded p-1.5 transition-colors"
      style={{
        color: active ? palette.link : palette.chromeMuted,
        background: active ? palette.background : 'transparent',
      }}
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        {children}
      </svg>
    </button>
  );
}
