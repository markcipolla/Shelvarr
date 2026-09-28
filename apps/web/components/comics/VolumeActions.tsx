'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  deleteComicVolumeAction,
  fixComicMatchAction,
  previewComicRename,
  runComicVolumeJob,
  searchComicVineAction,
  type ComicVineSearchResultView,
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
 * files, fix a wrong ComicVine match, rename to the naming template, and
 * remove from the library.
 *
 * Everything except the rename preview and the match fix runs as a background
 * task, so those buttons report a queued task rather than blocking.
 */
export function VolumeActions({ volumeId, title }: { volumeId: number; title: string }) {
  const router = useRouter();

  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renamePreview, setRenamePreview] = useState<RenameProposal[] | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [fixingMatch, setFixingMatch] = useState(false);
  const [matchQuery, setMatchQuery] = useState(title);
  const [matches, setMatches] = useState<ComicVineSearchResultView[] | null>(null);

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

  const handleMatchSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!matchQuery.trim()) return;

    setBusy('match-search');
    setError(null);
    setMessage(null);

    const result = await searchComicVineAction(matchQuery.trim());
    if (result.error) setError(result.error);
    else if (!result.configured) setError('Comic metadata needs a ComicVine API key.');
    setMatches(result.results);
    setBusy(null);
  };

  // The volume's URL is derived from its title, so a corrected match moves it.
  const handleApplyMatch = async (comicvineId: number) => {
    setBusy(`match-${comicvineId}`);
    setError(null);

    const result = await fixComicMatchAction(volumeId, comicvineId);
    if (result.success) {
      setFixingMatch(false);
      setMatches(null);
      router.replace(`/comics/${result.slug}`);
      router.refresh();
      return;
    }

    setError(result.error ?? 'Failed to fix the match');
    setBusy(null);
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
        <button
          type="button"
          onClick={() => {
            setFixingMatch(!fixingMatch);
            setError(null);
            setMessage(null);
          }}
          disabled={busy !== null}
          className={buttonClass}
        >
          Fix match
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

      {fixingMatch && (
        <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4 space-y-3">
          <p className="text-sm text-white">
            Matched to the wrong series? Pick the right one — the files and reading progress
            stay, the metadata and issues are replaced.
          </p>
          <form onSubmit={handleMatchSearch} className="flex gap-2">
            <input
              type="search"
              value={matchQuery}
              onChange={(event) => setMatchQuery(event.target.value)}
              placeholder="Search ComicVine — series name, or a 4050-… id"
              className="flex-1 bg-shelvarr-bg border border-shelvarr-border rounded-lg px-3 py-1.5 text-sm text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={busy !== null || !matchQuery.trim()}
              className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium"
            >
              {busy === 'match-search' ? 'Searching…' : 'Search'}
            </button>
          </form>

          {matches !== null && matches.length === 0 && (
            <p className="text-sm text-shelvarr-text-muted">Nothing on ComicVine matched that.</p>
          )}

          {matches !== null && matches.length > 0 && (
            <ul className="divide-y divide-shelvarr-border max-h-80 overflow-y-auto">
              {matches.map((match) => (
                <li key={match.comicvineId} className="flex items-center gap-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">
                      {match.title}
                      {match.year ? ` (${match.year})` : ''}
                    </p>
                    <p className="text-xs text-shelvarr-text-muted">
                      {[
                        match.publisher,
                        `Volume ${match.volumeNumber}`,
                        `${match.issueCount} issue${match.issueCount === 1 ? '' : 's'}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {match.alreadyAdded !== null && match.alreadyAdded !== volumeId ? (
                    <span className="flex-shrink-0 text-xs text-shelvarr-text-muted">
                      In library
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleApplyMatch(match.comicvineId)}
                      disabled={busy !== null}
                      className="flex-shrink-0 px-3 py-1.5 text-sm rounded-lg border border-shelvarr-border text-white hover:border-blue-500 disabled:opacity-50"
                    >
                      {busy === `match-${match.comicvineId}` ? 'Matching…' : 'Use this'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
