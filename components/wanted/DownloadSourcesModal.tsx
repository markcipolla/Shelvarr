'use client';

import { useState, useEffect } from 'react';
import type { WantedBook } from '@/lib/db';
import {
  searchDownloads,
  getDownloadSearchLinks,
  getDownloadSourceStatuses,
} from '@/lib/actions/downloads';
import type { DownloadResult, SourceStatus } from '@/lib/services/downloads';
import { SourceStatusBadge } from './SourceStatusBadge';

interface DownloadSourcesModalProps {
  book: WantedBook;
  onClose: () => void;
}

type TabType = 'all' | 'zlibrary' | 'annas' | 'libgen';

export function DownloadSourcesModal({ book, onClose }: DownloadSourcesModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [results, setResults] = useState<DownloadResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchLinks, setSearchLinks] = useState<{
    zlibrary: string;
    annas: string;
    libgen: string;
  } | null>(null);
  const [statuses, setStatuses] = useState<SourceStatus[]>([]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Get search links immediately
        const links = await getDownloadSearchLinks(
          `${book.title} ${book.author || ''}`.trim()
        );
        setSearchLinks(links);

        // Get source statuses
        const sourceStatuses = await getDownloadSourceStatuses();
        setStatuses(sourceStatuses);

        // Search all sources
        const query = `${book.title} ${book.author || ''}`.trim();
        const response = await searchDownloads(query, { isbn: book.isbn || undefined });

        if (response.success && response.results) {
          setResults(response.results);
        } else {
          setError(response.error || 'Search failed');
        }
      } catch {
        setError('Failed to search download sources');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [book]);

  const filteredResults =
    activeTab === 'all'
      ? results
      : results.filter((r) => r.source === activeTab);

  const getStatusForSource = (source: string) => {
    return statuses.find((s) => s.name === source)?.status || 'unknown';
  };

  const tabs: { id: TabType; label: string }[] = [
    { id: 'all', label: 'All Sources' },
    { id: 'zlibrary', label: 'Z-Library' },
    { id: 'annas', label: "Anna's Archive" },
    { id: 'libgen', label: 'LibGen' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-shelvarr-surface border border-shelvarr-border rounded-lg w-full max-w-4xl max-h-[80vh] overflow-hidden z-50">
        <div className="p-4 border-b border-shelvarr-border">
          <h2 className="text-lg font-semibold text-white">Find Downloads</h2>
          <p className="text-sm text-shelvarr-text-muted mt-1">
            Searching for: <span className="text-white">{book.title}</span>
            {book.author && (
              <span className="text-shelvarr-text-muted"> by {book.author}</span>
            )}
          </p>
        </div>

        {/* Quick Links */}
        {searchLinks && (
          <div className="p-4 border-b border-shelvarr-border bg-shelvarr-bg/50">
            <p className="text-sm text-shelvarr-text-muted mb-2">Quick search links:</p>
            <div className="flex flex-wrap gap-2">
              <a
                href={searchLinks.zlibrary}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-shelvarr-surface border border-shelvarr-border rounded px-3 py-1.5 text-sm text-white hover:border-shelvarr-primary transition-colors"
              >
                <SourceStatusBadge status={getStatusForSource('zlibrary') as SourceStatus['status']} />
                Z-Library
                <ExternalLinkIcon />
              </a>
              <a
                href={searchLinks.annas}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-shelvarr-surface border border-shelvarr-border rounded px-3 py-1.5 text-sm text-white hover:border-shelvarr-primary transition-colors"
              >
                <SourceStatusBadge status={getStatusForSource('annas') as SourceStatus['status']} />
                Anna&apos;s Archive
                <ExternalLinkIcon />
              </a>
              <a
                href={searchLinks.libgen}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-shelvarr-surface border border-shelvarr-border rounded px-3 py-1.5 text-sm text-white hover:border-shelvarr-primary transition-colors"
              >
                <SourceStatusBadge status={getStatusForSource('libgen') as SourceStatus['status']} />
                LibGen
                <ExternalLinkIcon />
              </a>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-shelvarr-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-shelvarr-text-muted hover:text-white'
              }`}
            >
              {tab.label}
              {tab.id !== 'all' && (
                <span className="ml-1.5">
                  <SourceStatusBadge status={getStatusForSource(tab.id) as SourceStatus['status']} />
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="overflow-y-auto max-h-[45vh]">
          {loading && (
            <div className="p-8 text-center text-shelvarr-text-muted">
              Searching download sources...
            </div>
          )}

          {error && !loading && (
            <div className="p-8 text-center text-shelvarr-text-muted">{error}</div>
          )}

          {!loading && !error && filteredResults.length === 0 && (
            <div className="p-8 text-center text-shelvarr-text-muted">
              No results found. Try the quick search links above.
            </div>
          )}

          {!loading && filteredResults.length > 0 && (
            <div className="divide-y divide-shelvarr-border">
              {filteredResults.map((result, index) => (
                <DownloadResultItem key={`${result.source}-${result.id}-${index}`} result={result} />
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-shelvarr-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-shelvarr-text-muted hover:text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function DownloadResultItem({ result }: { result: DownloadResult }) {
  const sourceLabels: Record<string, string> = {
    zlibrary: 'Z-Library',
    annas: "Anna's Archive",
    libgen: 'LibGen',
  };

  return (
    <div className="p-4 flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-white font-medium line-clamp-1">{result.title}</h3>
          <span className="flex-shrink-0 text-xs px-2 py-0.5 bg-shelvarr-bg rounded text-shelvarr-text-muted">
            {sourceLabels[result.source] || result.source}
          </span>
          {result.sourceStatus && (
            <SourceStatusBadge status={result.sourceStatus as SourceStatus['status']} />
          )}
        </div>
        <p className="text-sm text-shelvarr-text-muted">{result.author}</p>
        <div className="mt-1 flex items-center gap-3 text-xs text-shelvarr-text-muted">
          <span className="uppercase">{result.extension}</span>
          <span>{result.size}</span>
          {result.year && <span>{result.year}</span>}
          {result.language && <span>{result.language}</span>}
        </div>
      </div>

      <div className="flex-shrink-0 flex items-center gap-2">
        {result.downloadUrl && (
          <a
            href={result.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors inline-flex items-center gap-1"
          >
            Download
            <ExternalLinkIcon />
          </a>
        )}
        <a
          href={result.searchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-shelvarr-surface border border-shelvarr-border hover:border-shelvarr-primary text-white px-3 py-1.5 rounded text-sm font-medium transition-colors inline-flex items-center gap-1"
        >
          View
          <ExternalLinkIcon />
        </a>
      </div>
    </div>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  );
}
