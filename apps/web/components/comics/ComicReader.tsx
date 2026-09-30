'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { buildPageViews, fitContain, firstViewIndexForPage, type PageGeometry } from '@/lib/comics/spread';
import {
  DEFAULT_READER_PREFERENCES,
  normaliseReaderPreferences,
  type ReaderPreferences,
} from '@/lib/reader/preferences';

interface ComicReaderProps {
  issueId: number;
  volumeTitle: string;
  issueNumber: string;
  issueTitle?: string | null;
  onClose: () => void;
}

interface ProgressResponse {
  page: number;
  completed: boolean;
  total: number | null;
}

interface PagesResponse {
  count: number;
  pages?: PageGeometry[];
}

// Mirrors EpubReader's debounce window: enough to avoid a PATCH on every
// page turn while still saving well before someone closes the tab.
const SAVE_DEBOUNCE_MS = 1500;

/**
 * The comic reader.
 *
 * Two units of navigation live here and must not be confused, which is the
 * reason `lib/comics/spread.ts` exists as a separate, tested module rather
 * than as a few lines inline:
 *
 * - a **page** is an image in the archive, and is the only thing read
 *   progress ever stores or sends;
 * - a **view** is one thing on screen, and a double-page spread contributes
 *   two of them.
 *
 * Everything in this component navigates by view index and derives the page
 * from it. Nothing persists a view index. Get that backwards and the browser
 * and the phone quietly disagree about where you are, and a long issue
 * reports itself finished several pages early.
 */
export function ComicReader({
  issueId,
  volumeTitle,
  issueNumber,
  issueTitle,
  onClose,
}: ComicReaderProps) {
  const router = useRouter();
  const [pages, setPages] = useState<PageGeometry[]>([]);
  const [viewIndex, setViewIndex] = useState(0);
  const [splitWidePages, setSplitWidePages] = useState(DEFAULT_READER_PREFERENCES.splitWidePages);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfFallback, setPdfFallback] = useState(false);

  // The whole preference object, so toggling the one setting this reader
  // owns can PUT it back without flattening the EPUB reader's settings.
  const preferencesRef = useRef<ReaderPreferences>(DEFAULT_READER_PREFERENCES);

  const pageCount = pages.length;
  const views = useMemo(() => buildPageViews(pages, splitWidePages), [pages, splitWidePages]);
  const currentView = views[viewIndex] ?? null;
  const currentPage = currentView?.page ?? 1;

  // Load the pages, this person's saved position and their reader
  // preferences, once, on open. A PDF issue makes the /pages route 400 (see
  // the doc comment on ensureIssuePagesExtracted in @shelvarr/services) —
  // that's not a failure, it's a signal to fall back to the whole-file
  // download route instead.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [pagesRes, progressRes, prefsRes] = await Promise.all([
          fetch(`/api/comics/issues/${issueId}/pages`),
          fetch(`/api/comics/issues/${issueId}/progress`),
          // A reader that can't read preferences is a reader with default
          // preferences, not a broken one.
          fetch('/api/reader/preferences').catch(() => null),
        ]);

        if (!pagesRes.ok) {
          if (pagesRes.status === 400) {
            if (!cancelled) setPdfFallback(true);
            return;
          }
          const data = await pagesRes.json().catch(() => null);
          throw new Error(data?.error || 'Failed to load issue');
        }

        const pagesData = (await pagesRes.json()) as PagesResponse;
        const progressData = progressRes.ok
          ? ((await progressRes.json().catch(() => null)) as ProgressResponse | null)
          : null;
        const prefsData = prefsRes?.ok ? await prefsRes.json().catch(() => null) : null;

        if (cancelled) return;

        const preferences = normaliseReaderPreferences(prefsData);
        preferencesRef.current = preferences;
        setSplitWidePages(preferences.splitWidePages);

        // A server from before dimensions were recorded, or one that could
        // not size a page, sends no geometry at all; synthesising nulls here
        // keeps the rest of this component on one code path, and every such
        // page classifies as an ordinary one and is shown whole.
        const count = pagesData.count;
        const geometry: PageGeometry[] =
          pagesData.pages?.length === count
            ? pagesData.pages
            : Array.from({ length: count }, (_, index) => ({ n: index + 1, w: null, h: null }));
        setPages(geometry);

        const savedPage = progressData?.page ?? 0;
        const restoreTo = count > 0 && savedPage > 0 ? Math.min(savedPage, count) : 1;
        setViewIndex(firstViewIndexForPage(buildPageViews(geometry, preferences.splitWidePages), restoreTo));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load issue');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [issueId]);

  const pageUrl = useCallback(
    (page: number) => `/api/comics/issues/${issueId}/pages/${page}`,
    [issueId]
  );

  // Warm the browser's cache for the next view's page so turning forward
  // doesn't stall on the network. When the next view is the other half of the
  // page already on screen this is a no-op the browser resolves from cache.
  // A plain Image() prefetch is enough — see the card. Guarded for
  // environments without a real Image constructor (e.g. tests).
  useEffect(() => {
    const next = views[viewIndex + 1];
    if (!next) return;
    if (typeof window === 'undefined' || typeof window.Image === 'undefined') return;
    const img = new window.Image();
    img.src = pageUrl(next.page);
  }, [viewIndex, views, pageUrl]);

  const saveProgress = useCallback(
    (page: number) => {
      fetch(`/api/comics/issues/${issueId}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page }),
      }).catch(() => {
        // Non-critical: losing one save just means resuming a little further back.
      });
    },
    [issueId]
  );

  // Reuses the same PATCH + refresh behaviour as MarkIssueReadButton: there is
  // no separate "mark the volume read" call to make because a volume's read
  // state is derived entirely from its issues' progress (isComicVolumeRead in
  // packages/db) — completing the last unread issue is enough on its own.
  const completeIssue = useCallback(() => {
    fetch(`/api/comics/issues/${issueId}/progress`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true, ...(pageCount ? { total: pageCount } : {}) }),
    })
      .then(() => router.refresh())
      .catch(() => {
        // Non-critical: the reader still shows the last page either way.
      });
  }, [issueId, pageCount, router]);

  const pendingPageRef = useRef<number | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);
  // The last page number queued or sent, so moving between the two halves of
  // one spread doesn't spend a request telling the server nothing new.
  const lastQueuedPageRef = useRef<number | null>(null);

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (pendingPageRef.current !== null) {
      const page = pendingPageRef.current;
      pendingPageRef.current = null;
      saveProgress(page);
    }
  }, [saveProgress]);

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

  const goToView = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, views.length - 1));
      const view = views[clamped];
      if (!view) return;
      setViewIndex(clamped);

      const page = view.page;
      if (page !== lastQueuedPageRef.current) {
        lastQueuedPageRef.current = page;
        pendingPageRef.current = page;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          saveTimerRef.current = null;
          const pending = pendingPageRef.current;
          pendingPageRef.current = null;
          if (pending !== null) saveProgress(pending);
        }, SAVE_DEBOUNCE_MS);
      }

      // Completion is the last *view*, not the last page: reaching the left
      // half of a final double-page spread is not finishing the issue.
      if (clamped === views.length - 1 && !completedRef.current) {
        completedRef.current = true;
        completeIssue();
      }
    },
    [views, saveProgress, completeIssue]
  );

  const goNext = useCallback(() => goToView(viewIndex + 1), [goToView, viewIndex]);
  const goPrev = useCallback(() => goToView(viewIndex - 1), [goToView, viewIndex]);

  /**
   * Turn splitting on or off, staying on the same page across the change.
   *
   * The view list is rebuilt from the new setting rather than read off the
   * next render, because the index has to be remapped in the same update —
   * otherwise switching off halfway through a spread lands you wherever that
   * index happens to point in a shorter list.
   */
  const toggleSplit = useCallback(() => {
    const next = !splitWidePages;
    const page = views[viewIndex]?.page ?? 1;
    setSplitWidePages(next);
    setViewIndex(firstViewIndexForPage(buildPageViews(pages, next), page));

    const preferences = { ...preferencesRef.current, splitWidePages: next };
    preferencesRef.current = preferences;
    fetch('/api/reader/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preferences),
    }).catch(() => {
      // Non-critical: the setting still applies for this sitting.
    });
  }, [splitWidePages, views, viewIndex, pages]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, handleClose]);

  // The area a page has to fill. Measured rather than left to CSS because
  // showing half a spread means sizing a clipping box to half the image's
  // aspect ratio, and `aspect-ratio` on a replaced element does not survive
  // a `max-width` clamp intact — see fitContain's doc comment.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = stageRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setStage({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const subtitle = issueTitle ? `#${issueNumber} — ${issueTitle}` : `#${issueNumber}`;
  const geometry = currentView ? pages[currentView.page - 1] : undefined;
  const half = currentView?.half ?? null;
  const halfLabel = half === 'left' ? 'left half' : half === 'right' ? 'right half' : null;
  const alt = halfLabel ? `Page ${currentPage}, ${halfLabel}` : `Page ${currentPage}`;

  // Only clip when everything needed is actually known. A missing
  // measurement or missing geometry falls back to the whole page, which is
  // exactly what the reader did before splitting existed.
  const clip =
    half && geometry?.w && geometry?.h && stage.width > 0 && stage.height > 0
      ? fitContain(geometry.w / 2, geometry.h, stage.width, stage.height)
      : null;

  return (
    <div className="fixed inset-0 !-mt-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-shelvarr-surface border-b border-shelvarr-border">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={handleClose}
            className="text-shelvarr-text-muted hover:text-white transition-colors flex-shrink-0"
            aria-label="Close reader"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="text-white font-medium line-clamp-1">{volumeTitle}</h1>
            <p className="text-sm text-shelvarr-text-muted line-clamp-1">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {pageCount > 0 && (
            <button
              type="button"
              onClick={toggleSplit}
              aria-pressed={splitWidePages}
              title={
                splitWidePages
                  ? 'Showing double-page spreads as two halves'
                  : 'Showing double-page spreads whole'
              }
              className={`rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
                splitWidePages
                  ? 'border-shelvarr-border bg-shelvarr-border text-white'
                  : 'border-shelvarr-border text-shelvarr-text-muted hover:text-white'
              }`}
            >
              Split spreads
            </button>
          )}
          {pageCount > 0 && (
            <span className="text-sm text-shelvarr-text-muted">
              {currentPage} / {pageCount}
              {halfLabel ? <span className="ml-1 opacity-70">({halfLabel})</span> : null}
            </span>
          )}
        </div>
      </div>

      {/* Page */}
      <div
        ref={stageRef}
        className="flex-1 bg-black flex items-center justify-center overflow-hidden"
      >
        {loading && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
            <p className="mt-4 text-shelvarr-text-muted">Loading issue…</p>
          </div>
        )}

        {!loading && pdfFallback && (
          <div className="text-center max-w-md px-6">
            <p className="text-white text-lg font-medium">This issue is a PDF</p>
            <p className="mt-2 text-shelvarr-text-muted">
              PDFs can&apos;t be paginated by the browser reader yet. Download the original file instead.
            </p>
            <a
              href={`/api/comics/issues/${issueId}/file`}
              className="mt-4 inline-block bg-shelvarr-surface hover:bg-shelvarr-border border border-shelvarr-border text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Download file
            </a>
          </div>
        )}

        {!loading && !pdfFallback && error && (
          <div className="text-center max-w-md px-6">
            <p className="text-red-400 text-lg font-medium">Failed to load issue</p>
            <p className="mt-2 text-shelvarr-text-muted">{error}</p>
          </div>
        )}

        {!loading && !pdfFallback && !error && pageCount > 0 && (
          <div className="relative w-full h-full flex items-center justify-center">
            {clip ? (
              <div
                className="relative overflow-hidden"
                style={{ width: `${clip.width}px`, height: `${clip.height}px` }}
              >
                <img
                  src={pageUrl(currentPage)}
                  alt={alt}
                  className="absolute top-0 select-none"
                  style={{
                    width: `${clip.width * 2}px`,
                    height: `${clip.height}px`,
                    maxWidth: 'none',
                    left: half === 'left' ? 0 : `${-clip.width}px`,
                  }}
                />
              </div>
            ) : (
              <img
                src={pageUrl(currentPage)}
                alt={alt}
                className="max-w-full max-h-full object-contain select-none"
              />
            )}
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous page"
              className="absolute inset-y-0 left-0 w-1/2 cursor-pointer focus:outline-none"
            />
            <button
              type="button"
              onClick={goNext}
              aria-label="Next page"
              className="absolute inset-y-0 right-0 w-1/2 cursor-pointer focus:outline-none"
            />
          </div>
        )}

        {!loading && !pdfFallback && !error && pageCount === 0 && (
          <p className="text-shelvarr-text-muted">This issue has no pages.</p>
        )}
      </div>
    </div>
  );
}
