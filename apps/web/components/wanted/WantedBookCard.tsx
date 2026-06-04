'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { WantedBook } from '@/lib/db';
import { removeFromWanted, updateWantedStatus, updateWantedPriority } from '@/lib/actions/wanted';
import { BookIcon } from '@/components/ui/Icons';

interface WantedBookCardProps {
  book: WantedBook;
  onFindDownloads?: (book: WantedBook) => void;
}

export function WantedBookCard({ book, onFindDownloads }: WantedBookCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleRemove = async () => {
    if (!confirm('Remove this book from your wanted list?')) return;
    setLoading(true);
    await removeFromWanted(book.id);
    router.refresh();
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
    setMenuOpen(false);
  };

  const statusColors: Record<string, string> = {
    wanted: 'bg-blue-600',
    searching: 'bg-yellow-600',
    found: 'bg-green-600',
    acquired: 'bg-purple-600',
  };

  return (
    <div className="group bg-shelvarr-surface border border-shelvarr-border rounded-lg hover:border-shelvarr-primary transition-colors">
      <div className="aspect-[2/3] bg-shelvarr-bg relative rounded-t-lg">
        {/* Cover image (clipped to rounded corners) */}
        <div className="absolute inset-0 overflow-hidden rounded-t-lg">
          {book.cover_url ? (
            <img
              src={book.cover_url}
              alt={book.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-2">
              <BookIcon className="w-12 h-12 text-shelvarr-text-muted" />
            </div>
          )}
        </div>

        {/* Priority badge */}
        {book.priority === 1 && (
          <div className="absolute top-2 left-2 bg-yellow-500 text-black text-xs font-bold px-2 py-0.5 rounded">
            Priority
          </div>
        )}

        {/* Status badge */}
        <div className={`absolute top-2 right-2 ${statusColors[book.status]} text-white text-xs font-medium px-2 py-0.5 rounded capitalize`}>
          {book.status}
        </div>

        {/* Hover overlay with actions */}
        <div className="absolute inset-0 rounded-t-lg bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            onClick={() => onFindDownloads?.(book)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
            disabled={loading}
          >
            Find Downloads
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="bg-shelvarr-surface hover:bg-shelvarr-border text-white p-1.5 rounded transition-colors"
            >
              <MoreIcon />
            </button>
            {menuOpen && (
              <div className="absolute right-0 bottom-full mb-1 bg-shelvarr-surface border border-shelvarr-border rounded-lg shadow-lg py-1 min-w-[140px] z-50">
                <button
                  onClick={handleTogglePriority}
                  className="w-full text-left px-3 py-1.5 text-sm text-white hover:bg-shelvarr-border"
                >
                  {book.priority === 1 ? 'Remove Priority' : 'Set Priority'}
                </button>
                <div className="border-t border-shelvarr-border my-1" />
                <button
                  onClick={() => handleStatusChange('wanted')}
                  className="w-full text-left px-3 py-1.5 text-sm text-white hover:bg-shelvarr-border"
                >
                  Mark as Wanted
                </button>
                <button
                  onClick={() => handleStatusChange('searching')}
                  className="w-full text-left px-3 py-1.5 text-sm text-white hover:bg-shelvarr-border"
                >
                  Mark as Searching
                </button>
                <button
                  onClick={() => handleStatusChange('found')}
                  className="w-full text-left px-3 py-1.5 text-sm text-white hover:bg-shelvarr-border"
                >
                  Mark as Found
                </button>
                <button
                  onClick={() => handleStatusChange('acquired')}
                  className="w-full text-left px-3 py-1.5 text-sm text-white hover:bg-shelvarr-border"
                >
                  Mark as Acquired
                </button>
                <div className="border-t border-shelvarr-border my-1" />
                <button
                  onClick={handleRemove}
                  className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-shelvarr-border"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-2">
        <h3 className="text-sm font-medium text-white line-clamp-2 group-hover:text-shelvarr-primary transition-colors">
          {book.title}
        </h3>
        {book.author && (
          <p className="text-xs text-shelvarr-text-muted line-clamp-1 mt-0.5">
            {book.author}
          </p>
        )}
      </div>
    </div>
  );
}

function MoreIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
      />
    </svg>
  );
}
