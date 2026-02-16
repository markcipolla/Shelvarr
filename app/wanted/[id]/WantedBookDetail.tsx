'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { WantedBook } from '@/lib/db';
import {
  removeFromWanted,
  updateWantedStatus,
  updateWantedPriority,
  updateWantedNotes,
} from '@/lib/actions/wanted';
import type { SourceStatus } from '@/lib/services/downloads';
import { DownloadSourcesModal } from '@/components/wanted/DownloadSourcesModal';
import { SourceStatusBar } from '@/components/wanted/SourceStatusBadge';
import { BookIcon } from '@/components/ui/Icons';

interface WantedBookDetailProps {
  book: WantedBook;
  sourceStatuses: SourceStatus[];
}

export function WantedBookDetail({ book, sourceStatuses }: WantedBookDetailProps) {
  const router = useRouter();
  const [showDownloads, setShowDownloads] = useState(false);
  const [notes, setNotes] = useState(book.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRemove = async () => {
    if (!confirm('Remove this book from your wanted list?')) return;
    setLoading(true);
    await removeFromWanted(book.id);
    router.push('/wanted');
  };

  const handleTogglePriority = async () => {
    setLoading(true);
    await updateWantedPriority(book.id, book.priority === 1 ? 0 : 1);
    router.refresh();
    setLoading(false);
  };

  const handleStatusChange = async (status: WantedBook['status']) => {
    setLoading(true);
    await updateWantedStatus(book.id, status);
    router.refresh();
    setLoading(false);
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    await updateWantedNotes(book.id, notes);
    router.refresh();
    setSavingNotes(false);
  };

  const statusColors: Record<string, string> = {
    wanted: 'bg-blue-600',
    searching: 'bg-yellow-600',
    found: 'bg-green-600',
    acquired: 'bg-purple-600',
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cover and Actions */}
        <div className="lg:col-span-1">
          <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg overflow-hidden">
            <div className="aspect-[2/3] bg-shelvarr-bg">
              {book.cover_url ? (
                <img
                  src={book.cover_url}
                  alt={book.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <BookIcon className="w-24 h-24 text-shelvarr-text-muted" />
                </div>
              )}
            </div>

            <div className="p-4 space-y-3">
              <button
                onClick={() => setShowDownloads(true)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                disabled={loading}
              >
                Find Downloads
              </button>

              <button
                onClick={handleTogglePriority}
                className="w-full bg-shelvarr-surface border border-shelvarr-border hover:border-shelvarr-primary text-white px-4 py-2 rounded-lg font-medium transition-colors"
                disabled={loading}
              >
                {book.priority === 1 ? 'Remove Priority' : 'Set as Priority'}
              </button>

              <button
                onClick={handleRemove}
                className="w-full bg-red-600/20 border border-red-600/50 hover:bg-red-600/30 text-red-400 px-4 py-2 rounded-lg font-medium transition-colors"
                disabled={loading}
              >
                Remove from Wanted
              </button>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header */}
          <div>
            <div className="flex items-start gap-3">
              <h1 className="text-2xl font-bold text-white">{book.title}</h1>
              {book.priority === 1 && (
                <span className="bg-yellow-500 text-black text-xs font-bold px-2 py-0.5 rounded">
                  Priority
                </span>
              )}
            </div>
            {book.author && (
              <p className="text-lg text-shelvarr-text-muted mt-1">{book.author}</p>
            )}
          </div>

          {/* Status */}
          <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4">
            <h2 className="text-sm font-medium text-shelvarr-text-muted mb-3">Status</h2>
            <div className="flex flex-wrap gap-2">
              {(['wanted', 'searching', 'found', 'acquired'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => handleStatusChange(status)}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors capitalize ${
                    book.status === status
                      ? `${statusColors[status]} text-white`
                      : 'bg-shelvarr-bg text-shelvarr-text-muted hover:text-white'
                  }`}
                  disabled={loading}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Source Status */}
          <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4">
            <h2 className="text-sm font-medium text-shelvarr-text-muted mb-3">Download Sources</h2>
            <SourceStatusBar statuses={sourceStatuses} />
          </div>

          {/* Details */}
          <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4">
            <h2 className="text-sm font-medium text-shelvarr-text-muted mb-3">Details</h2>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              {book.isbn && (
                <>
                  <dt className="text-shelvarr-text-muted">ISBN</dt>
                  <dd className="text-white">{book.isbn}</dd>
                </>
              )}
              <dt className="text-shelvarr-text-muted">Added</dt>
              <dd className="text-white">
                {new Date(book.added_at).toLocaleDateString()}
              </dd>
              {book.hardcover_id && (
                <>
                  <dt className="text-shelvarr-text-muted">Hardcover ID</dt>
                  <dd className="text-white">{book.hardcover_id}</dd>
                </>
              )}
            </dl>
          </div>

          {/* Description */}
          {book.description && (
            <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4">
              <h2 className="text-sm font-medium text-shelvarr-text-muted mb-3">Description</h2>
              <p className="text-white text-sm leading-relaxed">{book.description}</p>
            </div>
          )}

          {/* Notes */}
          <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4">
            <h2 className="text-sm font-medium text-shelvarr-text-muted mb-3">Notes</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add personal notes about this book..."
              className="w-full bg-shelvarr-bg border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500 min-h-[100px]"
            />
            {notes !== (book.notes || '') && (
              <button
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50"
              >
                {savingNotes ? 'Saving...' : 'Save Notes'}
              </button>
            )}
          </div>
        </div>
      </div>

      {showDownloads && (
        <DownloadSourcesModal book={book} onClose={() => setShowDownloads(false)} />
      )}
    </>
  );
}
