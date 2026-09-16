'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { WantedBook } from '@/lib/db';
import {
  searchDownloads,
  getDownloadSearchLinks,
  getDownloadSourceStatuses,
  getDownloadConfigs,
  queueDownload,
} from '@/lib/actions/downloads';
import { getLibraries } from '@/lib/actions/libraries';
import type { DownloadResult, SourceStatus, BlockedSource } from '@/lib/services/downloads';
import { SourceStatusBadge } from './SourceStatusBadge';
import { useToast } from '@/components/ui/Toast';
import { LoadingSpinner } from '@/components/ui/Icons';
import { useLiveEvents } from '@/components/live/LiveEvents';

// These are external, unofficial book sources (shadow libraries) — they are
// off by default and only searched once an operator opts in from Settings.
const SHADOW_LIBRARY_SOURCES = ['zlibrary', 'annas', 'libgen'] as const;

/**
 * Whether a search result can be queued as a real download, or only opened
 * in a browser. LibGen and Anna's Archive always resolve their own direct
 * link; Z-Library's `downloadUrl` is only populated by `searchAllSources`
 * when credentials are configured (see downloads/index.ts's searchZLibrary
 * call), which is exactly when `resolveZlibraryDownload` has a session to
 * use — so its presence here doubles as the "can this be queued" check.
 */
function canQueueDownload(result: DownloadResult): boolean {
  if (result.source === 'libgen' || result.source === 'annas') return true;
  if (result.source === 'zlibrary') return Boolean(result.downloadUrl);
  return false;
}

interface Library {
  id: number;
  name: string;
  path: string;
}

interface DownloadSourcesModalProps {
  book: WantedBook;
  onClose: () => void;
}

type TabType = 'all' | 'zlibrary' | 'annas' | 'libgen' | 'manual';

interface ImportProgress {
  current: number;
  total: number | null;
}

export function DownloadSourcesModal({ book, onClose }: DownloadSourcesModalProps) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [results, setResults] = useState<DownloadResult[]>([]);
  const [blockedSources, setBlockedSources] = useState<BlockedSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchLinks, setSearchLinks] = useState<{
    zlibrary: string;
    annas: string;
    libgen: string;
  } | null>(null);
  const [statuses, setStatuses] = useState<SourceStatus[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [noSourcesEnabled, setNoSourcesEnabled] = useState(false);

  // "I already have this file" (E4-3) — a manual upload, separate from the
  // shadow-library search above. Two of those three sources can't be
  // downloaded from directly yet, and even once they can, someone will
  // occasionally grab a file by hand anyway.
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importUploading, setImportUploading] = useState(false);
  const [importTaskId, setImportTaskId] = useState<number | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      setNoSourcesEnabled(false);

      try {
        // Get libraries for download target selection
        const libs = await getLibraries();
        setLibraries(libs);
        if (libs.length > 0 && !selectedLibraryId) {
          setSelectedLibraryId(libs[0]!.id);
        }

        // Get search links immediately
        const links = await getDownloadSearchLinks(
          `${book.title} ${book.author || ''}`.trim()
        );
        setSearchLinks(links);

        // Get source statuses
        const sourceStatuses = await getDownloadSourceStatuses();
        setStatuses(sourceStatuses);

        // These sources are opt-in shadow libraries; if none are enabled
        // there's nothing to search, so ask rather than assuming.
        const configs = await getDownloadConfigs();
        const anyEnabled = SHADOW_LIBRARY_SOURCES.some(
          (source) => configs.find((c) => c.source === source)?.enabled === 1
        );

        if (!anyEnabled) {
          setNoSourcesEnabled(true);
          setResults([]);
          return;
        }

        // Search all sources
        const query = `${book.title} ${book.author || ''}`.trim();
        const response = await searchDownloads(query, { isbn: book.isbn || undefined });

        if (response.success && response.results) {
          setResults(response.results);
          setBlockedSources(response.blockedSources || []);
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
  }, [book, selectedLibraryId]);

  const filteredResults =
    activeTab === 'all'
      ? results
      : results.filter((r) => r.source === activeTab);

  const getStatusForSource = (source: string) => {
    return statuses.find((s) => s.name === source)?.status || 'unknown';
  };

  const handleDownload = async (result: DownloadResult) => {
    if (!selectedLibraryId) {
      toast.error('Please select a library to download to');
      return;
    }

    // LibGen and Anna's Archive can always be fetched directly once
    // enabled; Z-Library needs an authenticated session to resolve a real
    // file link (see resolveZlibraryDownload) — without one, its result's
    // downloadUrl is just the book's detail page, so open that in a browser
    // instead of queuing a download that can only fail.
    if (!canQueueDownload(result)) {
      window.open(result.downloadUrl || result.searchUrl, '_blank');
      return;
    }

    setDownloadingId(result.id);

    try {
      const response = await queueDownload({
        source: result.source,
        md5: result.md5 || result.id, // Use md5 for libgen, fallback to id
        title: result.title,
        author: result.author,
        extension: result.extension,
        libraryId: selectedLibraryId,
        wantedBookId: book.id,
      });

      if (response.success) {
        toast.success('Download queued!');
        onClose();
      } else {
        toast.error(`Failed to queue download: ${response.error}`);
      }
    } catch {
      toast.error('Failed to queue download');
    } finally {
      setDownloadingId(null);
    }
  };

  // Watch the import task's own progress, the same way RefreshUnmatchedButton
  // watches a metadata-refresh task: read live events for this task's id,
  // and settle on completion.
  useLiveEvents((event) => {
    if (importTaskId === null) return;
    if (event.kind !== 'task' || event.id !== importTaskId) return;

    if (event.event === 'progress') {
      setImportProgress({ current: event.progress, total: event.total });
      return;
    }

    if (event.status === 'completed') {
      toast.success('Import finished');
      setImportTaskId(null);
      setImportProgress(null);
      setImportFile(null);
    } else if (event.status === 'failed') {
      toast.error(event.error || 'Import failed');
      setImportTaskId(null);
      setImportProgress(null);
    } else if (event.status === 'cancelled') {
      setImportTaskId(null);
      setImportProgress(null);
    }
  });

  const handleImportSubmit = async () => {
    if (!importFile) {
      setImportError('Choose a file to import');
      return;
    }
    if (!selectedLibraryId) {
      setImportError('Please select a library to import into');
      return;
    }

    setImportError(null);
    setImportUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('libraryId', String(selectedLibraryId));

      const response = await fetch(`/api/wanted/${book.id}/import`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setImportError(data.error || 'Failed to import file');
        return;
      }

      toast.success(`Import started (Task #${data.taskId})`);
      setImportTaskId(data.taskId);
      setImportProgress(null);
    } catch {
      setImportError('Failed to import file');
    } finally {
      setImportUploading(false);
    }
  };

  const tabs: { id: TabType; label: string }[] = [
    { id: 'all', label: 'All Sources' },
    { id: 'zlibrary', label: 'Z-Library' },
    { id: 'annas', label: "Anna's Archive" },
    { id: 'libgen', label: 'LibGen' },
    { id: 'manual', label: 'I Have This File' },
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

        {/* Library Selector */}
        {libraries.length > 0 && (
          <div className="p-4 border-b border-shelvarr-border bg-shelvarr-bg/50">
            <label className="text-sm text-shelvarr-text-muted mb-2 block">Download to library:</label>
            <select
              value={selectedLibraryId || ''}
              onChange={(e) => setSelectedLibraryId(Number(e.target.value))}
              className="bg-shelvarr-surface border border-shelvarr-border rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              {libraries.map((lib) => (
                <option key={lib.id} value={lib.id}>
                  {lib.name}
                </option>
              ))}
            </select>
          </div>
        )}

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
              {tab.id !== 'all' && tab.id !== 'manual' && (
                <span className="ml-1.5">
                  <SourceStatusBadge status={getStatusForSource(tab.id) as SourceStatus['status']} />
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'manual' ? (
          /* Manual import (E4-3): the file already exists somewhere on this
             machine's disk — no search, just an upload. */
          <div className="overflow-y-auto max-h-[45vh] p-4">
            <p className="text-sm text-shelvarr-text-muted mb-4">
              Already downloaded this book yourself? Upload it here and Shelvarr
              will add it to the library selected above, match its metadata and
              file it the same way a normal download would be.
            </p>

            <div className="space-y-3">
              <input
                type="file"
                aria-label="Book file"
                onChange={(e) => {
                  setImportFile(e.target.files?.[0] ?? null);
                  setImportError(null);
                }}
                disabled={importUploading || importTaskId !== null}
                className="block w-full text-sm text-shelvarr-text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-shelvarr-bg file:text-white hover:file:bg-shelvarr-border"
              />

              {importError && <p className="text-sm text-red-400">{importError}</p>}

              <button
                onClick={handleImportSubmit}
                disabled={importUploading || importTaskId !== null || !importFile}
                className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-medium transition-colors inline-flex items-center gap-2"
              >
                {importUploading && <LoadingSpinner className="w-4 h-4 animate-spin" />}
                {importUploading
                  ? 'Uploading...'
                  : importTaskId !== null
                    ? importProgress?.total
                      ? `Importing ${importProgress.current}/${importProgress.total}...`
                      : 'Importing...'
                    : 'Import File'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Blocked source notices */}
            {!loading && blockedSources.length > 0 && (
              <div className="px-4 py-2 border-b border-shelvarr-border bg-shelvarr-bg/50 space-y-1">
                {blockedSources
                  .filter((b) => activeTab === 'all' || b.source === activeTab)
                  .map((b) => (
                    <p key={b.source} className="text-xs text-amber-400">
                      {b.message}
                    </p>
                  ))}
              </div>
            )}

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

              {!loading && !error && noSourcesEnabled && (
                <div className="p-8 text-center text-shelvarr-text-muted">
                  <p>
                    LibGen, Anna&apos;s Archive and Z-Library are external, unofficial
                    book sources. None are enabled yet, so nothing was searched.
                  </p>
                  <p className="mt-2">
                    Turn them on under{' '}
                    <Link
                      href="/settings/downloads"
                      className="text-shelvarr-primary hover:underline"
                      onClick={onClose}
                    >
                      Settings → Download Sources
                    </Link>
                    .
                  </p>
                </div>
              )}

              {!loading && !error && !noSourcesEnabled && filteredResults.length === 0 && (
                <div className="p-8 text-center text-shelvarr-text-muted">
                  No results found. Try the quick search links above.
                </div>
              )}

              {!loading && filteredResults.length > 0 && (
                <div className="divide-y divide-shelvarr-border">
                  {filteredResults.map((result, index) => (
                    <DownloadResultItem
                      key={`${result.source}-${result.id}-${index}`}
                      result={result}
                      onDownload={handleDownload}
                      isDownloading={downloadingId === result.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

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

function DownloadResultItem({
  result,
  onDownload,
  isDownloading,
}: {
  result: DownloadResult;
  onDownload: (result: DownloadResult) => void;
  isDownloading: boolean;
}) {
  const sourceLabels: Record<string, string> = {
    zlibrary: 'Z-Library',
    annas: "Anna's Archive",
    libgen: 'LibGen',
  };

  const canQueue = canQueueDownload(result);

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
        {canQueue ? (
          <button
            onClick={() => onDownload(result)}
            disabled={isDownloading}
            className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded text-sm font-medium transition-colors inline-flex items-center gap-1"
          >
            {isDownloading ? (
              <>
                <LoadingSpinner className="w-4 h-4 animate-spin" />
                Queuing...
              </>
            ) : (
              <>
                <DownloadIcon />
                Download
              </>
            )}
          </button>
        ) : result.downloadUrl ? (
          <a
            href={result.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors inline-flex items-center gap-1"
          >
            Download
            <ExternalLinkIcon />
          </a>
        ) : null}
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

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
      />
    </svg>
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
