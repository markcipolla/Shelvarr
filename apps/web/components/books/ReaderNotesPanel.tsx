'use client';

/**
 * The reader's bookmarks, highlights and in-book search.
 *
 * Grouped into one panel because they are the same gesture — "take me to a
 * place in this book" — and because three separate drawers over a page of
 * text is three ways to lose your place.
 *
 * Like {@link ReaderSettingsPanel} this holds no state of its own beyond the
 * search box's own input value; jumping, deleting and searching are all the
 * reader's job.
 */

import { useState } from 'react';
import type { ReaderThemePalette } from '@/lib/reader/preferences';
import type { ReaderAnnotation } from '@/lib/reader/annotations';
import { annotationPreview, byKind } from '@/lib/reader/annotations';

export interface ReaderSearchResult {
  cfi: string;
  excerpt: string;
}

interface ReaderNotesPanelProps {
  annotations: ReaderAnnotation[];
  palette: ReaderThemePalette;
  searchQuery: string;
  searchResults: ReaderSearchResult[];
  searching: boolean;
  onSearch: (query: string) => void;
  onJumpTo: (cfi: string) => void;
  onDelete: (annotation: ReaderAnnotation) => void;
}

export function ReaderNotesPanel({
  annotations,
  palette,
  searchQuery,
  searchResults,
  searching,
  onSearch,
  onJumpTo,
  onDelete,
}: ReaderNotesPanelProps) {
  const [draft, setDraft] = useState(searchQuery);
  const bookmarks = byKind(annotations, 'bookmark');
  const highlights = byKind(annotations, 'highlight');

  return (
    <div className="space-y-6 text-sm" style={{ color: palette.chromeText }}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSearch(draft.trim());
        }}
      >
        <label
          className="mb-2 block text-xs font-medium uppercase tracking-wide opacity-60"
          htmlFor="reader-search"
        >
          Search this book
        </label>
        <div className="flex gap-2">
          <input
            id="reader-search"
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="A word or phrase"
            className="min-w-0 flex-1 rounded px-2 py-1.5 text-sm outline-none"
            style={{
              background: palette.background,
              color: palette.text,
              border: `1px solid ${palette.border}`,
            }}
          />
          <button
            type="submit"
            className="rounded px-3 py-1.5 text-xs"
            style={{ border: `1px solid ${palette.border}` }}
          >
            Find
          </button>
        </div>

        {searchQuery && (
          <p className="mt-2 text-xs" style={{ color: palette.chromeMuted }}>
            {searching
              ? 'Searching…'
              : searchResults.length === 0
                ? `No matches for “${searchQuery}”.`
                : `${searchResults.length} ${searchResults.length === 1 ? 'match' : 'matches'} for “${searchQuery}”.`}
          </p>
        )}
      </form>

      {searchResults.length > 0 && (
        <ul className="space-y-1">
          {searchResults.slice(0, 200).map((result) => (
            <li key={result.cfi}>
              <button
                type="button"
                onClick={() => onJumpTo(result.cfi)}
                className="w-full rounded px-2 py-2 text-left text-xs leading-snug transition-colors"
                style={{ border: `1px solid ${palette.border}` }}
              >
                …{result.excerpt.replace(/\s+/g, ' ').trim()}…
              </button>
            </li>
          ))}
        </ul>
      )}

      <Section
        title="Bookmarks"
        empty="No bookmarks yet. Press B while reading to drop one."
        items={bookmarks}
        palette={palette}
        onJumpTo={onJumpTo}
        onDelete={onDelete}
      />

      <Section
        title="Highlights"
        empty="No highlights yet. Select a passage to keep it."
        items={highlights}
        palette={palette}
        onJumpTo={onJumpTo}
        onDelete={onDelete}
      />
    </div>
  );
}

function Section({
  title,
  empty,
  items,
  palette,
  onJumpTo,
  onDelete,
}: {
  title: string;
  empty: string;
  items: ReaderAnnotation[];
  palette: ReaderThemePalette;
  onJumpTo: (cfi: string) => void;
  onDelete: (annotation: ReaderAnnotation) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide opacity-60">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs" style={{ color: palette.chromeMuted }}>
          {empty}
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((annotation) => (
            <li key={annotation.id} className="flex items-start gap-1">
              <button
                type="button"
                onClick={() => onJumpTo(annotation.cfi)}
                className="min-w-0 flex-1 rounded px-2 py-2 text-left text-xs leading-snug transition-colors"
                style={{ border: `1px solid ${palette.border}` }}
              >
                {annotationPreview(annotation)}
              </button>
              <button
                type="button"
                onClick={() => onDelete(annotation)}
                aria-label={`Remove ${annotation.kind}`}
                className="rounded px-2 py-2 text-xs"
                style={{ border: `1px solid ${palette.border}`, color: palette.chromeMuted }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
