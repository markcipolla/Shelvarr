'use client';

import { useEffect } from 'react';
import type { Book } from '@/types';
import { formatAuthors } from '@/lib/utils/authors';

interface PdfReaderProps {
  book: Book;
  onClose: () => void;
}

/**
 * Full-screen PDF reader.
 *
 * Unlike CBZ/CBR books and comics, a PDF has no per-page image to extract —
 * rendering PDF pages as images would be a materially different (and
 * heavier) feature, and browsers already render PDFs natively. So this just
 * points an iframe at `/api/books/:id/file` (which now serves PDFs with
 * `Content-Disposition: inline` — see that route) and lets the browser's own
 * viewer do the work.
 *
 * There is deliberately no page-progress tracking here: the browser's own
 * viewer already remembers scroll position within the session, and building
 * a parallel tracking mechanism on top of it would be scope creep for a
 * feature the browser already provides. A read/unread toggle is still
 * available after closing via BookActions' existing "Mark as completed"
 * button — this component doesn't need one of its own.
 */
export function PdfReader({ book, onClose }: PdfReaderProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 !-mt-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-shelvarr-surface border-b border-shelvarr-border">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
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
      </div>

      {/* PDF, rendered natively by the browser */}
      <div className="flex-1 bg-white">
        <iframe
          src={`/api/books/${book.id}/file`}
          title={book.title || 'PDF'}
          className="w-full h-full border-0"
        />
      </div>
    </div>
  );
}
