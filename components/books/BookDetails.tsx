'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Book, Library } from '@/types';
import { sanitizeHtml } from '@/lib/utils/sanitize';

interface BookDetailsProps {
  book: Book;
  library: Library | null;
  authorsWithIds?: Array<{ name: string; id: number | null }>;
}

export function BookDetails({ book, library, authorsWithIds }: BookDetailsProps) {
  const [showRawData, setShowRawData] = useState(false);
  const filename = book.filePath.split(/[/\\]/).pop() || book.filePath;

  // Parse all series from JSON
  const allSeries: Array<[string, number | null]> = book.series
    ? JSON.parse(book.series)
    : book.seriesName
      ? [[book.seriesName, book.seriesNumber]]
      : [];

  return (
    <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">
          {book.title || filename.replace(/\.[^.]+$/, '')}
        </h1>
        {authorsWithIds && authorsWithIds.length > 0 && (
          <div className="text-lg mt-1 flex flex-wrap gap-1">
            {authorsWithIds.map((author, index) => (
              <span key={index}>
                {author.id ? (
                  <Link
                    href={`/authors/${author.id}`}
                    className="text-shelvarr-primary hover:text-shelvarr-primary/80 transition-colors"
                  >
                    {author.name}
                  </Link>
                ) : (
                  <span className="text-shelvarr-text-muted">{author.name}</span>
                )}
                {index < authorsWithIds.length - 1 && (
                  <span className="text-shelvarr-text-muted">, </span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {allSeries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {allSeries.map(([name, position], i) => (
            <Link
              key={i}
              href={`/series/${encodeURIComponent(name)}`}
              className="flex items-center gap-2 text-shelvarr-primary hover:text-shelvarr-primary/80 transition-colors"
            >
              <SeriesIcon />
              <span>
                {name}
                {position ? ` #${position}` : ''}
              </span>
            </Link>
          ))}
        </div>
      )}

      {book.description && (
        <div>
          <h2 className="text-sm font-semibold text-shelvarr-text-muted uppercase tracking-wide mb-2">
            Description
          </h2>
          <div
            className="text-white leading-relaxed overflow-hidden [&_br]:block [&_br]:mb-2"
            style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(book.description) }}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {book.publisher && (
          <MetadataField label="Publisher" value={book.publisher} />
        )}
        {book.publishDate && (
          <MetadataField label="Published" value={book.publishDate} />
        )}
        {book.isbn && <MetadataField label="ISBN" value={book.isbn} />}
        {library && <MetadataField label="Library" value={library.name} />}
      </div>

      <div className="pt-4 border-t border-shelvarr-border">
        <h2 className="text-sm font-semibold text-shelvarr-text-muted uppercase tracking-wide mb-3">
          File Information
        </h2>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-shelvarr-text-muted">Filename</span>
            <p className="text-white font-mono break-all mt-0.5">
              {filename}
            </p>
          </div>
          <div>
            <span className="text-shelvarr-text-muted">Path</span>
            <p className="text-white font-mono break-all mt-0.5">
              {book.filePath}
            </p>
          </div>
          {book.fileSize && (
            <div className="flex justify-between">
              <span className="text-shelvarr-text-muted">Size</span>
              <span className="text-white">{formatFileSize(book.fileSize)}</span>
            </div>
          )}
        </div>
      </div>

      {book.metadataSource && (
        <div className="pt-4 border-t border-shelvarr-border">
          <h2 className="text-sm font-semibold text-shelvarr-text-muted uppercase tracking-wide mb-3">
            Metadata Source
          </h2>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-green-600/20 text-green-400 text-sm rounded">
              {book.metadataSource}
            </span>
            {book.metadataId && (
              <span className="text-shelvarr-text-muted text-sm font-mono">
                {book.metadataId}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="pt-4 border-t border-shelvarr-border">
        <button
          onClick={() => setShowRawData(!showRawData)}
          className="flex items-center gap-2 text-sm text-shelvarr-text-muted hover:text-white transition-colors"
        >
          <ChevronIcon expanded={showRawData} />
          <span>Raw Data</span>
        </button>
        {showRawData && (
          <pre className="mt-3 p-3 bg-shelvarr-bg rounded-lg text-xs text-shelvarr-text overflow-x-auto whitespace-pre-wrap break-words">
{JSON.stringify(book, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function MetadataField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-shelvarr-text-muted uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-white mt-0.5">{value}</dd>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function SeriesIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
      />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
