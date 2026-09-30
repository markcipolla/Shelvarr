'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Library } from '@/types';
import {
  deleteLibrary,
  scanLibrary,
  fetchLibraryMetadata,
  scanComicLibrary,
  refreshComicLibraryMetadata,
} from '@/lib/actions/libraries';
import { useToast } from '@/components/ui/Toast';

interface LibraryWithCount extends Library {
  bookCount: number;
}

export function LibraryList({ libraries }: { libraries: LibraryWithCount[] }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState<Record<number, string>>({});

  const clearLoading = (id: number) =>
    setLoading((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  /** Queue a job for one library and report back, whatever kind it is. */
  const run = async (
    id: number,
    label: string,
    job: string,
    queue: () => Promise<{ error?: string; taskId?: number }>
  ) => {
    setLoading((prev) => ({ ...prev, [id]: label }));
    try {
      const result = await queue();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${job.charAt(0).toUpperCase()}${job.slice(1)} started (Task #${result.taskId})`);
        router.refresh();
      }
    } catch {
      toast.error(`Failed to start ${job}`);
    } finally {
      clearLoading(id);
    }
  };

  const handleScan = (id: number, isComic: boolean) =>
    run(id, 'scanning', 'scan', () => (isComic ? scanComicLibrary(id) : scanLibrary(id)));

  const handleMetadata = (id: number, isComic: boolean, narrow: boolean) =>
    run(id, 'metadata', 'metadata fetch', () =>
      isComic ? refreshComicLibraryMetadata(id, narrow) : fetchLibraryMetadata(id, narrow)
    );

  const handleDelete = async (id: number, name: string, isComic: boolean) => {
    const removes = isComic ? 'the library' : 'all books from the database';
    if (!confirm(`Delete library "${name}"? This will remove ${removes} (files won't be deleted).`)) {
      return;
    }
    setLoading((prev) => ({ ...prev, [id]: 'deleting' }));
    const result = await deleteLibrary(id);
    if (result.error) {
      toast.error(result.error);
      clearLoading(id);
    } else {
      toast.success(`Library "${name}" deleted`);
    }
  };

  if (libraries.length === 0) {
    return (
      <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center">
        <p className="text-shelvarr-text-muted">No libraries configured. Add a library to get started.</p>
      </div>
    );
  }

  return (
    <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg divide-y divide-shelvarr-border">
      {libraries.map((lib) => {
        const isComic = lib.type === 'comic';
        return (
        <div key={lib.id} className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <div className="text-shelvarr-primary">
              <FolderIcon />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">{lib.name}</span>
                <span className="text-xs uppercase tracking-wide text-shelvarr-text-muted border border-shelvarr-border rounded px-1.5 py-0.5">
                  {isComic ? 'Comics' : 'Books'}
                </span>
              </div>
              <div className="text-sm text-shelvarr-text-muted">{lib.path}</div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-shelvarr-text-muted">
              {lib.bookCount} {isComic ? 'volumes' : 'books'}
            </span>

            <div className="flex gap-2">
              <button
                onClick={() => handleScan(lib.id, isComic)}
                disabled={!!loading[lib.id]}
                className="bg-shelvarr-bg hover:bg-shelvarr-border text-shelvarr-text border border-shelvarr-border px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {loading[lib.id] === 'scanning' ? 'Scanning...' : 'Scan'}
              </button>

              {/* Comics have no "unmatched" state — a volume either came from
                  ComicVine or it isn't here — so the narrow option is by age. */}
              <MetadataDropdown
                disabled={!!loading[lib.id]}
                narrowLabel={isComic ? 'Refresh Stale' : 'Find Missing'}
                onNarrow={() => handleMetadata(lib.id, isComic, true)}
                onRefreshAll={() => handleMetadata(lib.id, isComic, false)}
              />

              <Link
                href={isComic ? '/comics' : `/libraries/${lib.id}/organize`}
                className="bg-shelvarr-bg hover:bg-shelvarr-border text-shelvarr-text border border-shelvarr-border px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              >
                {isComic ? 'Comics' : 'Organize'}
              </Link>

              <button
                onClick={() => handleDelete(lib.id, lib.name, isComic)}
                disabled={!!loading[lib.id]}
                className="bg-shelvarr-bg hover:bg-red-900/20 text-red-400 border border-shelvarr-border px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {loading[lib.id] === 'deleting' ? '...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
        );
      })}
    </div>
  );
}

function MetadataDropdown({
  disabled,
  narrowLabel,
  onNarrow,
  onRefreshAll,
}: {
  disabled: boolean;
  narrowLabel: string;
  onNarrow: () => void;
  onRefreshAll: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className="bg-shelvarr-bg hover:bg-shelvarr-border text-shelvarr-text border border-shelvarr-border px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
      >
        Metadata ▾
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0"
            style={{ zIndex: 9998 }}
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 mt-1 w-40 bg-shelvarr-surface border border-shelvarr-border rounded-lg shadow-lg"
            style={{ zIndex: 9999 }}
          >
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onNarrow();
              }}
              className="w-full text-left px-3 py-2 text-sm text-shelvarr-text hover:bg-shelvarr-bg rounded-t-lg"
            >
              {narrowLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onRefreshAll();
              }}
              className="w-full text-left px-3 py-2 text-sm text-shelvarr-text hover:bg-shelvarr-bg rounded-b-lg border-t border-shelvarr-border"
            >
              Refresh All
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function FolderIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  );
}
