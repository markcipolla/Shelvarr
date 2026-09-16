'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Book } from '@/types';
import { formatAuthors } from '@/lib/utils/authors';

interface BookPageReaderProps {
  book: Book;
  readProgress?: { page: number; completed: boolean } | null;
  onClose: () => void;
}

// Mirrors ComicReader/EpubReader's debounce window: enough to avoid a PATCH
// on every page turn while still saving well before someone closes the tab.
const SAVE_DEBOUNCE_MS = 1500;

/**
 * Page-by-page reader for CBZ/CBR books.
 *
 * This is a sibling of ComicReader, not a generalization of it. The two
 * share the same underlying page-turning UI, but their progress plumbing
 * genuinely differs: ComicReader's completion is a PATCH to
 * `/api/comics/issues/:id/progress` with a `total` field and an issue/volume
 * relationship baked in, while a book's progress lives at
 * `/api/books/:id/read-progress` with a plain `{ page, completed }` body and
 * its own Hardcover-sync side effects (see that route). Threading both
 * shapes through one component would mean a config surface wide enough to
 * risk regressing the just-merged comic reader for a modest amount of code
 * reuse, so this stayed a separate, smaller component instead.
 *
 * Unlike ComicReader, this does not fetch progress on open — the book detail
 * page already fetches it server-side and threads it down through
 * `BookActions` as `readProgress`, so a client-side GET here would just be
 * redundant.
 */
export function BookPageReader({ book, readProgress = null, onClose }: BookPageReaderProps) {
  const router = useRouter();
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(() =>
    readProgress && readProgress.page > 0 ? readProgress.page : 1
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load the page count, once, on open, clamping the restored page (from the
  // readProgress prop) to whatever the archive actually contains.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`/api/books/${book.id}/pages`);
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || 'Failed to load book');
        }

        const data = (await res.json()) as { count: number };
        if (cancelled) return;

        const count = data.count;
        setPageCount(count);
        setCurrentPage((prev) => (count > 0 ? Math.min(prev, count) : 1));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load book');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [book.id]);

  const pageUrl = useCallback((page: number) => `/api/books/${book.id}/pages/${page}`, [book.id]);

  // Warm the browser's cache for the next page so turning forward doesn't
  // stall on the network, mirroring ComicReader. Guarded for environments
  // without a real Image constructor (e.g. tests).
  useEffect(() => {
    if (!pageCount || currentPage >= pageCount) return;
    if (typeof window === 'undefined' || typeof window.Image === 'undefined') return;
    const img = new window.Image();
    img.src = pageUrl(currentPage + 1);
  }, [currentPage, pageCount, pageUrl]);

  const saveProgress = useCallback(
    (page: number) => {
      fetch(`/api/books/${book.id}/read-progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page, completed: false }),
      }).catch(() => {
        // Non-critical: losing one save just means resuming a little further back.
      });
    },
    [book.id]
  );

  // Whatever BookActions' "Mark as completed" button already offers keeps
  // working independently of this — this just also completes the book
  // automatically on reaching the last page, the same way ComicReader does
  // for issues. Skips the PATCH entirely if the book was already marked
  // completed on open, so re-reading an already-finished book doesn't refire
  // the Hardcover "completed" sync on every visit to the last page.
  const completedRef = useRef(!!readProgress?.completed);

  const completeBook = useCallback(() => {
    fetch(`/api/books/${book.id}/read-progress`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: pageCount ?? undefined, completed: true }),
    })
      .then(() => router.refresh())
      .catch(() => {
        // Non-critical: the reader still shows the last page either way.
      });
  }, [book.id, pageCount, router]);

  const pendingPageRef = useRef<number | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        completeBook();
      }
    },
    [pageCount, saveProgress, completeBook]
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
            <h1 className="text-white font-medium line-clamp-1">{book.title || 'Unknown Title'}</h1>
            {book.authors && (
              <p className="text-sm text-shelvarr-text-muted line-clamp-1">{formatAuthors(book.authors)}</p>
            )}
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
            <p className="mt-4 text-shelvarr-text-muted">Loading book…</p>
          </div>
        )}

        {!loading && error && (
          <div className="text-center max-w-md px-6">
            <p className="text-red-400 text-lg font-medium">Failed to load book</p>
            <p className="mt-2 text-shelvarr-text-muted">{error}</p>
            <a
              href={`/api/books/${book.id}/file`}
              className="mt-4 inline-block bg-shelvarr-surface hover:bg-shelvarr-border border border-shelvarr-border text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Download file
            </a>
          </div>
        )}

        {!loading && !error && pageCount !== null && pageCount > 0 && (
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

        {!loading && !error && pageCount === 0 && (
          <p className="text-shelvarr-text-muted">This book has no pages.</p>
        )}
      </div>
    </div>
  );
}
