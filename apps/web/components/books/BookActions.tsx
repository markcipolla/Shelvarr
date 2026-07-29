'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Book } from '@/types';
import { deleteBook } from '@/lib/actions/books';
import { MetadataSearchModal } from '@/components/books/MetadataSearchModal';
import { EpubReader } from '@/components/books/EpubReader';
import { AudiobookPanel } from '@/components/books/AudiobookPanel';
import { useToast } from '@/components/ui/Toast';

interface BookActionsProps {
  book: Book;
}

function getFilenameFromPath(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  const filename = parts[parts.length - 1] || filePath;
  return filename.replace(/\.[^.]+$/, '');
}

export function BookActions({ book }: BookActionsProps) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [showMetadataSearch, setShowMetadataSearch] = useState(false);
  const [showReader, setShowReader] = useState(false);

  const hasMatch = !!book.metadataSource;
  const hasHardcover = book.metadataSource === 'hardcover';
  const isEpub = book.filePath.toLowerCase().endsWith('.epub');

  const handleStatusChange = async (
    status: 'want-to-read' | 'reading' | 'read' | 'dnf'
  ) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/books/${book.id}/reading-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || 'Failed to update Hardcover status');
      } else {
        toast.success('Synced to Hardcover');
      }
    } catch {
      toast.error('Failed to reach server');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkCompleted = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/books/${book.id}/read-progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || 'Failed to mark as completed');
      } else {
        toast.success('Marked as completed');
        router.refresh();
      }
    } catch {
      toast.error('Failed to reach server');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this book from the database? The file will not be deleted.')) {
      return;
    }

    setLoading(true);
    const result = await deleteBook(book.id);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('Book deleted');
      router.push('/books');
    }
  };

  return (
    <>
      <div className="space-y-2">
        {isEpub && (
          <button
            onClick={() => setShowReader(true)}
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <ReadIcon />
            Read
          </button>
        )}

        <button
          onClick={() => setShowMetadataSearch(true)}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {hasMatch ? 'Fix Match' : 'Search Match'}
        </button>

        <button
          onClick={handleMarkCompleted}
          disabled={loading}
          className="w-full bg-shelvarr-surface hover:bg-shelvarr-border border border-shelvarr-border text-shelvarr-text px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          Mark as completed
        </button>

        {isEpub && <AudiobookPanel bookId={book.id} />}

        {hasHardcover && (
          <div className="pt-2">
            <label className="block text-sm text-shelvarr-text-muted mb-1">
              Hardcover status
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleStatusChange('want-to-read')}
                disabled={loading}
                className="bg-shelvarr-surface hover:bg-shelvarr-border border border-shelvarr-border text-shelvarr-text px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Want to Read
              </button>
              <button
                onClick={() => handleStatusChange('reading')}
                disabled={loading}
                className="bg-shelvarr-surface hover:bg-shelvarr-border border border-shelvarr-border text-shelvarr-text px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Reading
              </button>
              <button
                onClick={() => handleStatusChange('read')}
                disabled={loading}
                className="bg-shelvarr-surface hover:bg-shelvarr-border border border-shelvarr-border text-shelvarr-text px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Read
              </button>
              <button
                onClick={() => handleStatusChange('dnf')}
                disabled={loading}
                className="bg-shelvarr-surface hover:bg-shelvarr-border border border-shelvarr-border text-shelvarr-text px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Did Not Finish
              </button>
            </div>
          </div>
        )}

        <button
          onClick={handleDelete}
          disabled={loading}
          className="w-full bg-shelvarr-surface hover:bg-red-900/20 text-red-400 border border-shelvarr-border px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {loading ? 'Deleting...' : 'Delete from Database'}
        </button>
      </div>

      {showMetadataSearch && (
        <MetadataSearchModal
          book={book}
          initialQuery={hasMatch ? getFilenameFromPath(book.filePath) : undefined}
          onClose={() => setShowMetadataSearch(false)}
        />
      )}

      {showReader && (
        <EpubReader
          book={book}
          onClose={() => setShowReader(false)}
        />
      )}
    </>
  );
}

function ReadIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  );
}
