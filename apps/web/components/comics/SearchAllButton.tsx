'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { searchAllComicsAction } from '@/lib/actions/comics';

/**
 * Kick off the library-wide sweep from the volume list: search every volume
 * still missing issues, and queue a download for whatever is found.
 *
 * The work happens in a background task, so this reports what it queued
 * rather than waiting for it.
 */
export function SearchAllButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);

    const result = await searchAllComicsAction();
    if (!result.success) setError(result.error ?? 'Search failed');
    else if (result.alreadyRunning) setMessage('A search is already running — follow it on the Tasks page.');
    else setMessage('Search queued — anything found will show up under Downloads.');

    setBusy(false);
    router.refresh();
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="px-3 py-1.5 text-sm rounded-lg border border-shelvarr-border text-white hover:border-blue-500 disabled:opacity-50"
      >
        {busy ? 'Searching…' : 'Search for missing issues'}
      </button>
      {message && <p className="text-xs text-green-400">{message}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
