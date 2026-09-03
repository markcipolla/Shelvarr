'use client';

import { useCallback, useEffect, useState } from 'react';

interface Directory {
  name: string;
  path: string;
}

interface BrowseResult {
  current: string;
  parent: string | null;
  directories: Directory[];
}

interface FolderBrowserProps {
  /** Where to start browsing. Falls back to the server's library root. */
  initialPath?: string;
  onSelect: (path: string) => void;
  onClose?: () => void;
}

/**
 * Inline directory tree. Walks the server's filesystem through /api/browse —
 * the browser has no access to the paths the server actually stores things in.
 */
export function FolderBrowser({ initialPath, onSelect, onClose }: FolderBrowserProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BrowseResult | null>(null);

  const loadDirectory = useCallback(async (path: string = '') => {
    setLoading(true);
    setError(null);

    try {
      const params = path ? `?path=${encodeURIComponent(path)}` : '';
      const response = await fetch(`/api/browse${params}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to load directory');
      }

      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDirectory(initialPath?.trim() || '');
  }, [loadDirectory, initialPath]);

  return (
    <div className="mt-2 max-h-64 overflow-auto border border-shelvarr-border rounded-lg bg-shelvarr-bg">
      <div className="p-2">
        {loading && (
          <div className="flex items-center gap-2 text-shelvarr-text-muted text-sm p-2">
            <Spinner />
            Loading...
          </div>
        )}

        {error && <div className="text-red-400 text-sm p-2">{error}</div>}

        {!loading && !error && data && (
          <>
            <div className="flex items-center justify-between gap-2 p-2 bg-shelvarr-surface rounded mb-2 sticky top-0">
              <div className="text-sm text-shelvarr-text-muted truncate flex-1" title={data.current}>
                {data.current}
              </div>
              <button
                type="button"
                onClick={() => onSelect(data.current)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs py-1 px-2 rounded transition-colors whitespace-nowrap"
              >
                Use this folder
              </button>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close folder browser"
                  className="text-shelvarr-text-muted hover:text-white text-xs py-1 px-2 rounded transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>

            {data.parent && (
              <button
                type="button"
                onClick={() => loadDirectory(data.parent!)}
                className="flex items-center gap-2 p-2 w-full text-left hover:bg-shelvarr-surface rounded transition-colors"
              >
                <ChevronUpIcon />
                <span className="text-sm text-white">..</span>
              </button>
            )}

            {data.directories.length === 0 ? (
              <div className="text-shelvarr-text-muted text-sm p-2 text-center">
                No subdirectories
              </div>
            ) : (
              data.directories.map((dir) => (
                <button
                  key={dir.path}
                  type="button"
                  onClick={() => loadDirectory(dir.path)}
                  className="flex items-center gap-2 p-2 w-full text-left hover:bg-shelvarr-surface rounded transition-colors"
                >
                  <FolderIcon className="w-4 h-4 text-shelvarr-primary flex-shrink-0" />
                  <span className="text-sm text-white truncate">{dir.name}</span>
                </button>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface FolderPickerProps {
  value: string;
  onChange: (path: string) => void;
  id?: string;
  name?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Classes for the text input. Defaults to the standard settings input style. */
  inputClassName?: string;
}

const defaultInputClass =
  'w-full bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500';

/**
 * A path text field with a Browse button that opens {@link FolderBrowser}.
 * Typing and browsing both drive the same value, so a path can be pasted in
 * whole or clicked together a directory at a time.
 */
export function FolderPicker({
  value,
  onChange,
  id,
  name,
  placeholder,
  required,
  disabled,
  inputClassName,
}: FolderPickerProps) {
  const [browsing, setBrowsing] = useState(false);

  return (
    <div className="flex-1 min-w-0">
      <div className="flex gap-2">
        <input
          type="text"
          id={id}
          name={name}
          required={required}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={inputClassName ?? defaultInputClass}
        />
        <button
          type="button"
          onClick={() => setBrowsing((open) => !open)}
          disabled={disabled}
          aria-expanded={browsing}
          className="bg-shelvarr-surface hover:border-blue-500 text-white border border-shelvarr-border px-3 py-2 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
        >
          <FolderIcon className="w-4 h-4" />
          Browse
        </button>
      </div>

      {browsing && (
        <FolderBrowser
          initialPath={value}
          onSelect={(path) => {
            onChange(path);
            setBrowsing(false);
          }}
          onClose={() => setBrowsing(false)}
        />
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg className="w-4 h-4 text-shelvarr-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  );
}
