'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AuthorWork } from '@/types';
import { toggleWorkWanted } from '@/lib/actions/authors';

interface AuthorBibliographyProps {
  works: AuthorWork[];
  authorName: string;
}

type FilterType = 'all' | 'owned' | 'missing' | 'wanted';

export function AuthorBibliography({ works, authorName }: AuthorBibliographyProps) {
  const [filter, setFilter] = useState<FilterType>('all');

  // Sort by year ascending (oldest first, null years at end) then by title
  const sortedWorks = [...works].sort((a, b) => {
    if (a.publishYear && b.publishYear) {
      return a.publishYear - b.publishYear;
    }
    if (a.publishYear && !b.publishYear) return -1;
    if (!a.publishYear && b.publishYear) return 1;
    return a.title.localeCompare(b.title);
  });

  const filteredWorks = sortedWorks.filter(work => {
    switch (filter) {
      case 'owned':
        return work.owned;
      case 'missing':
        return !work.owned;
      case 'wanted':
        return work.wanted;
      default:
        return true;
    }
  });

  const ownedCount = works.filter(w => w.owned).length;
  const missingCount = works.filter(w => !w.owned).length;
  const wantedCount = works.filter(w => w.wanted).length;

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <FilterButton
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          label={`All (${works.length})`}
        />
        <FilterButton
          active={filter === 'owned'}
          onClick={() => setFilter('owned')}
          label={`Owned (${ownedCount})`}
          variant="green"
        />
        <FilterButton
          active={filter === 'missing'}
          onClick={() => setFilter('missing')}
          label={`Missing (${missingCount})`}
          variant="red"
        />
        <FilterButton
          active={filter === 'wanted'}
          onClick={() => setFilter('wanted')}
          label={`Wanted (${wantedCount})`}
          variant="yellow"
        />
      </div>

      {filteredWorks.length === 0 ? (
        <p className="text-shelvarr-text-muted text-center py-4">
          No works match this filter
        </p>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {filteredWorks.map(work => (
            <WorkRow key={work.id} work={work} authorName={authorName} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  label,
  variant = 'default',
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  variant?: 'default' | 'green' | 'red' | 'yellow';
}) {
  const baseClasses = 'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors';

  const variantClasses = {
    default: active
      ? 'bg-shelvarr-primary text-white'
      : 'bg-shelvarr-bg text-shelvarr-text-muted hover:text-white',
    green: active
      ? 'bg-green-600 text-white'
      : 'bg-shelvarr-bg text-shelvarr-text-muted hover:text-green-400',
    red: active
      ? 'bg-red-600 text-white'
      : 'bg-shelvarr-bg text-shelvarr-text-muted hover:text-red-400',
    yellow: active
      ? 'bg-yellow-600 text-white'
      : 'bg-shelvarr-bg text-shelvarr-text-muted hover:text-yellow-400',
  };

  return (
    <button onClick={onClick} className={`${baseClasses} ${variantClasses[variant]}`}>
      {label}
    </button>
  );
}

function WorkRow({ work, authorName }: { work: AuthorWork; authorName: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleToggleWanted = async () => {
    setLoading(true);
    await toggleWorkWanted(work.id);
    setLoading(false);
    router.refresh();
  };

  // Build Hardcover search URL for unowned books
  const hardcoverSearchUrl = `https://hardcover.app/search?q=${encodeURIComponent(`${work.title} ${authorName}`)}`;

  return (
    <div className="flex items-center gap-3 p-3 bg-shelvarr-bg rounded-lg">
      <div className="flex-shrink-0">
        {work.owned ? (
          <div className="w-6 h-6 rounded-full bg-green-600/20 flex items-center justify-center">
            <CheckIcon className="w-4 h-4 text-green-400" />
          </div>
        ) : (
          <div className="w-6 h-6 rounded-full bg-shelvarr-surface flex items-center justify-center">
            <XIcon className="w-4 h-4 text-shelvarr-text-muted" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {work.bookId ? (
          <Link
            href={`/books/${work.bookId}`}
            className="font-medium text-white hover:text-shelvarr-primary transition-colors line-clamp-1"
          >
            {work.title}
          </Link>
        ) : (
          <a
            href={hardcoverSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-white hover:text-orange-400 transition-colors line-clamp-1"
            title="Search on Hardcover"
          >
            {work.title}
          </a>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {!work.owned && (
          <button
            onClick={handleToggleWanted}
            disabled={loading}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              work.wanted
                ? 'bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30'
                : 'bg-shelvarr-surface text-shelvarr-text-muted hover:text-yellow-400'
            }`}
          >
            {work.wanted ? 'Wanted' : 'Want'}
          </button>
        )}

        {work.language && (
          <span className="px-2 py-0.5 bg-shelvarr-surface text-shelvarr-text-muted text-xs rounded min-w-[60px] text-center">
            {work.language}
          </span>
        )}

        <span className="px-2 py-0.5 bg-shelvarr-surface text-shelvarr-text-muted text-xs rounded min-w-[45px] text-center">
          {work.publishYear || '—'}
        </span>
      </div>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
