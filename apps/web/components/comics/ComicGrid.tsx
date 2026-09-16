'use client';

import Link from 'next/link';
import type { ComicVolumeSummary } from '@shelvarr/types';
import { BookIcon, CheckIcon } from '@/components/ui/Icons';
import { BookCover } from '@/components/ui/BookCover';

/** A volume, plus whether the reader has finished every issue of it. */
export type ComicVolumeCardData = ComicVolumeSummary & { read?: boolean };

interface ComicGridProps {
  volumes: ComicVolumeCardData[];
}

export function ComicGrid({ volumes }: ComicGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 3xl:grid-cols-7 gap-4">
      {volumes.map((volume) => (
        <ComicCard key={volume.id} volume={volume} />
      ))}
    </div>
  );
}

interface ComicCardProps {
  volume: ComicVolumeCardData;
  /** Optional badge shown at the bottom-left, e.g. resume point for in-progress comics. */
  progressLabel?: string;
}

export function ComicCard({ volume, progressLabel }: ComicCardProps) {
  const title = volume.title;
  const subtitle = [volume.publisher, volume.year].filter(Boolean).join(' · ');
  const coverSrc = `/api/comics/${volume.id}/cover`;

  return (
    <Link href={`/comics/${volume.slug}`} className="book-cover-trigger group block">
      <BookCover variant="comic" src={coverSrc} title={title} author={subtitle}>
        {volume.read && (
          <div
            className="absolute top-2 left-2 bg-green-600 text-white rounded-full p-1 shadow-md ring-1 ring-black/20"
            title="Read"
          >
            <CheckIcon className="w-4 h-4" />
            <span className="sr-only">Read</span>
          </div>
        )}
        {volume.issue_count > 0 && (
          <div className="absolute top-2 right-2 bg-shelvarr-primary/90 text-white text-xs font-bold px-2 py-1 rounded">
            {volume.issues_downloaded}/{volume.issue_count}
          </div>
        )}
        {progressLabel && (
          <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs font-semibold px-2 py-1 rounded">
            {progressLabel}
          </div>
        )}
      </BookCover>
      <div className="pt-3">
        <h3 className="text-sm font-medium text-white line-clamp-2 group-hover:text-shelvarr-primary transition-colors">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-shelvarr-text-muted line-clamp-1 mt-0.5">{subtitle}</p>
        )}
      </div>
    </Link>
  );
}

export function ComicEmptyState({ icon: Icon = BookIcon, children }: { icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center">
      <Icon className="w-12 h-12 mx-auto text-shelvarr-text-muted mb-4" />
      <p className="text-shelvarr-text-muted">{children}</p>
    </div>
  );
}
