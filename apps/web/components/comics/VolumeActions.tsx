'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  deleteComicVolumeAction,
  previewComicRename,
  runComicVolumeJob,
} from '@/lib/actions/comics';

interface RenameProposal {
  fileId: number;
  from: string;
  to: string;
}

const buttonClass =
  'px-3 py-1.5 text-sm rounded-lg border border-shelvarr-border text-white hover:border-blue-500 disabled:opacity-50';

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * The per-volume jobs: search for missing issues, refresh metadata, rescan
 * files, rename to the naming template, and remove from the library.
 *
 * Everything except the rename preview runs as a background task, so these
 * buttons report a queued task rather than blocking.
 */
export function VolumeActions({ volumeId }: { volumeId: number }) {
  const router = useRouter();

  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renamePreview, setRenamePreview] = useState<RenameProposal[] | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const run = async (job: 'refresh' | 'scan' | 'search', label: string) => {
    setBusy(job);
    setError(null);
    setMessage(null);
    setRenamePreview(null);

    const result = await runComicVolumeJob(volumeId, job);
    if (result.success) setMessage(`${label} queued — follow it on the Tasks page.`);
    else setError(result.error ?? `${label} failed`);

    setBusy(null);
    router.refresh();
  };

  const handleRenamePreview = async () => {
    setBusy('rename');
    setError(null);
    setMessage(null);

    const result = await previewComicRename(volumeId);
    if (!result.success) {
      setError(result.error);
      setBusy(null);
      return;
    }

    setRenamePreview(result.preview.files);
    if (result.preview.files.length === 0) {
      setMessage('Every file already matches the naming template.');
    }
    setBusy(null);
  };

  const handleRenameApply = async () => {
    setBusy('rename-apply');
    const result = await runComicVolumeJob(volumeId, 'rename');
    if (result.success) {
      setMessage('Rename queued — follow it on the Tasks page.');
      setRenamePreview(null);
    } else {
      setError(result.error ?? 'Rename failed');
    }
    setBusy(null);
    router.refresh();
  };

  const handleDelete = async (deleteFiles: boolean) => {
    setBusy('delete');
    const result = await deleteComicVolumeAction(volumeId, deleteFiles);
    if (result.success) router.push('/comics');
    else {
      setError(result.error ?? 'Delete failed');
      setBusy(null);
      setConfirmingDelete(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run('search', 'Search')}
          disabled={busy !== null}
          className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium"
        >
          {busy === 'search' ? 'Searching…' : 'Search for missing issues'}
        </button>
        <button type="button" onClick={() => run('refresh', 'Metadata refresh')} disabled={busy !== null} className={buttonClass}>
          Refresh metadata
        </button>
        <button type="button" onClick={() => run('scan', 'File scan')} disabled={busy !== null} className={buttonClass}>
          Rescan files
        </button>
        <button type="button" onClick={handleRenamePreview} disabled={busy !== null} className={buttonClass}>
          Preview rename
        </button>
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          disabled={busy !== null}
          className="px-3 py-1.5 text-sm rounded-lg border border-red-500/40 text-red-400 hover:border-red-400 disabled:opacity-50"
        >
          Remove
        </button>
      </div>

      {message && <p className="text-sm text-green-400">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {renamePreview && renamePreview.length > 0 && (
        <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4 space-y-3">
          <p className="text-sm text-white">
            {renamePreview.length} file{renamePreview.length === 1 ? '' : 's'} would be renamed:
          </p>
          <ul className="space-y-1 text-xs font-mono max-h-64 overflow-y-auto">
            {renamePreview.map((proposal) => (
              <li key={proposal.fileId} className="text-shelvarr-text-muted">
                <span className="text-red-400">{basename(proposal.from)}</span>
                {' → '}
                <span className="text-green-400">{basename(proposal.to)}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRenameApply}
              disabled={busy !== null}
              className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium"
            >
              {busy === 'rename-apply' ? 'Queueing…' : 'Rename them'}
            </button>
            <button type="button" onClick={() => setRenamePreview(null)} className={buttonClass}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {confirmingDelete && (
        <div className="bg-shelvarr-surface border border-red-500/40 rounded-lg p-4 space-y-3">
          <p className="text-sm text-white">Remove this volume from the library?</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleDelete(false)}
              disabled={busy !== null}
              className={buttonClass}
            >
              Remove, keep the files
            </button>
            <button
              type="button"
              onClick={() => handleDelete(true)}
              disabled={busy !== null}
              className="px-3 py-1.5 text-sm rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-medium"
            >
              Remove and delete the files
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)} className={buttonClass}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
