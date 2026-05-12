'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Library } from '@/types';
import { deleteLibrary, scanLibrary, fetchLibraryMetadata } from '@/lib/actions/libraries';
import { useToast } from '@/components/ui/Toast';

interface LibraryWithCount extends Library {
  bookCount: number;
}

export function LibraryList({ libraries }: { libraries: LibraryWithCount[] }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState<Record<number, string>>({});

  const handleScan = async (id: number) => {
    setLoading((prev) => ({ ...prev, [id]: 'scanning' }));
    const result = await scanLibrary(id);
    setLoading((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Scan started (Task #${result.taskId})`);
      router.refresh();
    }
  };

  const handleMetadata = async (id: number, unmatchedOnly: boolean) => {
    setLoading((prev) => ({ ...prev, [id]: 'metadata' }));
    try {
      const result = await fetchLibraryMetadata(id, unmatchedOnly);
      setLoading((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Metadata fetch started (Task #${result.taskId})`);
        router.refresh();
      }
    } catch {
      setLoading((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast.error('Failed to start metadata fetch');
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete library "${name}"? This will remove all books from the database (files won't be deleted).`)) {
      return;
    }
    setLoading((prev) => ({ ...prev, [id]: 'deleting' }));
    const result = await deleteLibrary(id);
    if (result.error) {
      toast.error(result.error);
      setLoading((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
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
      {libraries.map((lib) => (
        <div key={lib.id} className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <div className="text-shelvarr-primary">
              <FolderIcon />
            </div>
            <div>
              <div className="font-semibold text-white">{lib.name}</div>
              <div className="text-sm text-shelvarr-text-muted">{lib.path}</div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-shelvarr-text-muted">{lib.bookCount} books</span>

            <div className="flex gap-2">
              <button
                onClick={() => handleScan(lib.id)}
                disabled={!!loading[lib.id]}
                className="bg-shelvarr-bg hover:bg-shelvarr-border text-shelvarr-text border border-shelvarr-border px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {loading[lib.id] === 'scanning' ? 'Scanning...' : 'Scan'}
              </button>

              <MetadataDropdown
                disabled={!!loading[lib.id]}
                onFindMissing={() => handleMetadata(lib.id, true)}
                onRefreshAll={() => handleMetadata(lib.id, false)}
              />

              <Link
                href={`/libraries/${lib.id}/organize`}
                className="bg-shelvarr-bg hover:bg-shelvarr-border text-shelvarr-text border border-shelvarr-border px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              >
                Organize
              </Link>

              <button
                onClick={() => handleDelete(lib.id, lib.name)}
                disabled={!!loading[lib.id]}
                className="bg-shelvarr-bg hover:bg-red-900/20 text-red-400 border border-shelvarr-border px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {loading[lib.id] === 'deleting' ? '...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MetadataDropdown({
  disabled,
  onFindMissing,
  onRefreshAll,
}: {
  disabled: boolean;
  onFindMissing: () => void;
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
                onFindMissing();
              }}
              className="w-full text-left px-3 py-2 text-sm text-shelvarr-text hover:bg-shelvarr-bg rounded-t-lg"
            >
              Find Missing
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
