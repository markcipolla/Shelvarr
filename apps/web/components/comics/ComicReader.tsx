'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

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

// Mirrors EpubReader's debounce window: enough to avoid a PATCH on every
// page turn while still saving well before someone closes the tab.
const SAVE_DEBOUNCE_MS = 1500;

export function ComicReader({
  issueId,
  volumeTitle,
  issueNumber,
  issueTitle,
  onClose,
}: ComicReaderProps) {
  const router = useRouter();
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfFallback, setPdfFallback] = useState(false);

  // Load the page count and restore this person's saved position, once, on
  // open. A PDF issue makes the /pages route 400 (see the doc comment on
  // ensureIssuePagesExtracted in @shelvarr/services) — that's not a failure,
  // it's a signal to fall back to the whole-file download route instead.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [pagesRes, progressRes] = await Promise.all([
          fetch(`/api/comics/issues/${issueId}/pages`),
          fetch(`/api/comics/issues/${issueId}/progress`),
        ]);

        if (!pagesRes.ok) {
          if (pagesRes.status === 400) {
            if (!cancelled) setPdfFallback(true);
            return;
          }
          const data = await pagesRes.json().catch(() => null);
          throw new Error(data?.error || 'Failed to load issue');
        }

        const pagesData = (await pagesRes.json()) as { count: number };
        const progressData = progressRes.ok
          ? ((await progressRes.json().catch(() => null)) as ProgressResponse | null)
          : null;

        if (cancelled) return;

        const count = pagesData.count;
        setPageCount(count);
        const savedPage = progressData?.page ?? 0;
        setCurrentPage(count > 0 && savedPage > 0 ? Math.min(savedPage, count) : 1);
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

  // Warm the browser's cache for the next page so turning forward doesn't
  // stall on the network. A plain Image() prefetch is enough — see the card.
  // Guarded for environments without a real Image constructor (e.g. tests).
  useEffect(() => {
    if (!pageCount || currentPage >= pageCount) return;
    if (typeof window === 'undefined' || typeof window.Image === 'undefined') return;
    const img = new window.Image();
    img.src = pageUrl(currentPage + 1);
  }, [currentPage, pageCount, pageUrl]);

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

  const goToPage = useCallback(
    (page: number) => {
      if (!pageCount) return;
      const clamped = Math.max(1, Math.min(page, pageCount));
      setCurrentPage(clamped);

      pendingPageRef.current = clamped;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        const pending = pendingPageRef.current;
        pendingPageRef.current = null;
        if (pending !== null) saveProgress(pending);
      }, SAVE_DEBOUNCE_MS);

      if (clamped === pageCount && !completedRef.current) {
        completedRef.current = true;
        completeIssue();
      }
    },
    [pageCount, saveProgress, completeIssue]
  );

  const goNext = useCallback(() => goToPage(currentPage + 1), [goToPage, currentPage]);
  const goPrev = useCallback(() => goToPage(currentPage - 1), [goToPage, currentPage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, handleClose]);

  const subtitle = issueTitle ? `#${issueNumber} — ${issueTitle}` : `#${issueNumber}`;

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
        {pageCount !== null && pageCount > 0 && (
          <span className="text-sm text-shelvarr-text-muted flex-shrink-0">
            {currentPage} / {pageCount}
          </span>
        )}
      </div>

      {/* Page */}
      <div className="flex-1 bg-black flex items-center justify-center overflow-hidden">
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

        {!loading && !pdfFallback && !error && pageCount !== null && pageCount > 0 && (
          <div className="relative w-full h-full flex items-center justify-center">
            <img
              src={pageUrl(currentPage)}
              alt={`Page ${currentPage}`}
              className="max-w-full max-h-full object-contain select-none"
            />
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
