'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InProgressComic } from '@/lib/db';
import { ComicCard } from '@/components/comics/ComicGrid';
import { useToast } from '@/components/ui/Toast';

/**
 * The home page's Currently Reading Comics shelf, with the same "×" the books
 * above it carry.
 *
 * A volume is on this shelf because of one issue the reader is partway through,
 * so finishing that issue is what takes the volume off — the volume itself
 * counts as read only once every issue is. Usually that means the volume moves
 * on to the issue after it rather than disappearing.
 */
export function InProgressComicRow({ comics }: { comics: InProgressComic[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
      {comics.map((comic) => (
        <InProgressComicCard key={comic.volume.id} comic={comic} />
      ))}
    </div>
  );
}

function InProgressComicCard({ comic }: { comic: InProgressComic }) {
  const router = useRouter();
  const toast = useToast();
  const [marking, setMarking] = useState(false);
  const label = comic.issueNumber ? `#${comic.issueNumber}` : 'this issue';

  // Inside the card's link, so the click must not also open the volume.
  const handleMarkRead = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setMarking(true);
    try {
      const res = await fetch(`/api/comics/issues/${comic.issueId}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true, ...(comic.total ? { total: comic.total } : {}) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || 'Failed to mark as read');
      } else {
        toast.success(`Marked ${comic.volume.title} ${label} as read`);
        router.refresh();
      }
    } catch {
      toast.error('Failed to reach server');
    } finally {
      setMarking(false);
    }
  };

  return (
    <ComicCard
      volume={comic.volume}
      progressLabel={comic.issueNumber ? `Reading #${comic.issueNumber}` : 'Reading'}
      overlay={
        <button
          onClick={handleMarkRead}
          disabled={marking}
          title="Finished — take it off this shelf"
          aria-label={`Finished ${comic.volume.title} ${label} — remove from Currently Reading`}
          className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 text-white text-base leading-none flex items-center justify-center transition-colors disabled:opacity-50"
        >
          {marking ? '·' : '×'}
        </button>
      }
    />
  );
}
