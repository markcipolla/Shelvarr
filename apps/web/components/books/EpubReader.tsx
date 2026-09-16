'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { ReactReader } from 'react-reader';
import type { Book } from '@/types';
import { formatAuthors } from '@/lib/utils/authors';

interface EpubReaderProps {
  book: Book;
  onClose: () => void;
}

// Progress is saved under a fixed 'web' device id rather than a persisted
// per-browser UUID — the browser isn't a "device" the way a phone is, and a
// single shared id keeps this simple while still separating web progress
// from any native devices reading the same book.
const WEB_DEVICE_ID = 'web';

// A second or two is plenty to avoid firing a PUT on every page-turn while
// still saving well before someone closes the tab.
const SAVE_DEBOUNCE_MS = 1500;

export function EpubReader({ book, onClose }: EpubReaderProps) {
  const [location, setLocation] = useState<string | number>(0);
  const [epubData, setEpubData] = useState<ArrayBuffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch epub as ArrayBuffer
  useEffect(() => {
    const fetchEpub = async () => {
      try {
        const response = await fetch(`/api/books/${book.id}/file`);
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to load book');
        }
        const arrayBuffer = await response.arrayBuffer();
        setEpubData(arrayBuffer);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load book');
      } finally {
        setLoading(false);
      }
    };

    fetchEpub();
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
        // A real percentage would require epub.js to generate book-wide
        // locations up front, which is expensive — out of scope for this
        // card. Sending 0 just means this won't trigger the Hardcover
        // "completed" auto-sync (which needs progression >= 0.98); marking a
        // book read is still available via BookActions.
        progression: 0,
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

  return (
    <div className="fixed inset-0 !-mt-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-shelvarr-surface border-b border-shelvarr-border">
        <div className="flex items-center gap-3">
          <button
            onClick={handleClose}
            className="text-shelvarr-text-muted hover:text-white transition-colors"
            aria-label="Close reader"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div>
            <h1 className="text-white font-medium line-clamp-1">{book.title || 'Unknown Title'}</h1>
            {book.authors && (
              <p className="text-sm text-shelvarr-text-muted line-clamp-1">
                {formatAuthors(book.authors)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Reader */}
      <div className="flex-1 bg-white">
        {loading && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading book...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-red-600">
              <p className="text-lg font-medium">Failed to load book</p>
              <p className="mt-2">{error}</p>
              <button
                onClick={handleClose}
                className="mt-4 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
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
            epubOptions={{
              flow: 'scrolled',
              manager: 'continuous',
            }}
          />
        )}
      </div>
    </div>
  );
}
