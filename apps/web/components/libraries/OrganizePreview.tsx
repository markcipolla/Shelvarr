'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { organizeLibrary } from '@/lib/actions/libraries';
import type { ReorgPreviewItem } from '@/lib/services/organizer';

interface OrganizePreviewProps {
  libraryId: number;
  preview: ReorgPreviewItem[];
}

export function OrganizePreview({ libraryId, preview }: OrganizePreviewProps) {
  const router = useRouter();
  const [applying, setApplying] = useState(false);

  const stats = useMemo(() => {
    let willMove = 0;
    let noChange = 0;
    let errors = 0;
    for (const item of preview) {
      if (item.error) errors++;
      else if (item.willMove) willMove++;
      else noChange++;
    }
    return { willMove, noChange, errors, total: preview.length };
  }, [preview]);

  const handleApply = async () => {
    setApplying(true);
    const result = await organizeLibrary(libraryId);
    setApplying(false);
    if (result.error) {
      // eslint-disable-next-line no-alert
      alert(result.error);
      return;
    }
    router.push('/tasks');
  };

  if (preview.length === 0) {
    return (
      <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center">
        <p className="text-shelvarr-text-muted">No books in this library.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-shelvarr-bg text-shelvarr-text-muted">
            <tr>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium">Current</th>
              <th className="text-left p-3 font-medium">New</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-shelvarr-border">
            {preview.map((item) => (
              <tr key={item.bookId}>
                <td className="p-3 whitespace-nowrap">
                  <StatusBadge item={item} />
                </td>
                <td className="p-3 font-mono text-xs text-shelvarr-text-muted break-all">
                  {item.currentPath}
                </td>
                <td className="p-3 font-mono text-xs text-white break-all">
                  {item.error ? (
                    <span className="text-red-400">{item.error}</span>
                  ) : (
                    item.newPath
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-shelvarr-surface border-t border-shelvarr-border p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="text-sm text-shelvarr-text-muted">
            <span className="text-white font-medium">{stats.willMove}</span> of{' '}
            <span className="text-white font-medium">{stats.total}</span> will move
            {stats.errors > 0 && (
              <span className="text-red-400 ml-2">· {stats.errors} errors</span>
            )}
            {stats.noChange > 0 && (
              <span className="ml-2">· {stats.noChange} unchanged</span>
            )}
          </div>
          <button
            onClick={handleApply}
            disabled={applying || stats.willMove === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {applying ? 'Starting...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ item }: { item: ReorgPreviewItem }) {
  if (item.error) {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-600/20 text-red-400">
        Error
      </span>
    );
  }
  if (item.willMove) {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-600/20 text-blue-400">
        Will move
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-600/20 text-gray-400">
      No change
    </span>
  );
}
