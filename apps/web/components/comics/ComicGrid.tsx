'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { KapowarrVolume } from '@shelvarr/types';
import { BookIcon, ComicIcon } from '@/components/ui/Icons';

interface ComicGridProps {
  volumes: KapowarrVolume[];
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
  volume: KapowarrVolume;
}

export function ComicCard({ volume }: ComicCardProps) {
  const title = volume.title;
  const subtitle = [volume.publisher, volume.year].filter(Boolean).join(' · ');
  const coverSrc = `/api/comics/${volume.id}/cover`;
  const [coverFailed, setCoverFailed] = useState(false);

  return (
    <Link
      href={`/comics/${volume.id}`}
      className="group block bg-shelvarr-surface border border-shelvarr-border rounded-lg overflow-hidden hover:border-shelvarr-primary transition-colors"
    >
      <div className="aspect-[2/3] bg-shelvarr-bg relative">
        {coverFailed ? (
          <div className="w-full h-full flex items-center justify-center p-2">
            <ComicIcon className="w-12 h-12 text-shelvarr-text-muted" />
          </div>
        ) : (
          <img
            src={coverSrc}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setCoverFailed(true)}
          />
        )}
        {volume.issue_count > 0 && (
          <div className="absolute top-2 right-2 bg-shelvarr-primary/90 text-white text-xs font-bold px-2 py-1 rounded">
            {volume.issues_downloaded}/{volume.issue_count}
          </div>
        )}
      </div>
      <div className="p-2">
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
