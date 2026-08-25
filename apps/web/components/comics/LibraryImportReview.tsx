'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  applyLibraryImportAction,
  type LibraryImportRun,
  type ImportProposalView,
} from '@/lib/actions/comics';

interface RootFolder {
  id: number;
  path: string;
}

/** The last path segment, which is what the user recognises. */
function folderLabel(folder: string): string {
  const parts = folder.split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join('/') || folder;
}

function candidateLabel(candidate: ImportProposalView['candidates'][number]): string {
  return [
    candidate.title,
    candidate.year ? `(${candidate.year})` : null,
    candidate.publisher,
    `${candidate.issueCount} issues`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function LibraryImportReview({
  run,
  rootFolders,
}: {
  run: LibraryImportRun | null;
  rootFolders: RootFolder[];
}) {
  const router = useRouter();

  // folder -> the ComicVine id chosen for it, or null for "don't import".
  const [choices, setChoices] = useState<Record<string, number | null>>(() => {
    const initial: Record<string, number | null> = {};
    for (const proposal of run?.proposals ?? []) {
      // Pre-select the suggestion, but never one that is already in the
      // library — importing it again would be a no-op at best.
      initial[proposal.folder] =
        proposal.alreadyAdded === null ? proposal.suggestedComicvineId : null;
    }
    return initial;
  });

  const [applying, setApplying] = useState(false);
  const [rootFolderId, setRootFolderId] = useState(rootFolders[0]?.id);
  const [result, setResult] = useState<{
    imported: number;
    failed: Array<{ folder: string; error: string }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () =>
      Object.entries(choices)
        .filter(([, comicvineId]) => comicvineId !== null)
        .map(([folder, comicvineId]) => ({ folder, comicvineId: comicvineId as number })),
    [choices]
  );

  const handleApply = async () => {
    setApplying(true);
    setError(null);
    setResult(null);

    const response = await applyLibraryImportAction(selected, rootFolderId);
    if (response.success) {
      setResult({ imported: response.imported ?? 0, failed: response.failed ?? [] });
      router.refresh();
    } else {
      setError(response.error ?? 'Import failed');
    }
    setApplying(false);
  };

  if (!run) {
    return (
      <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center">
        <p className="text-shelvarr-text-muted">
          No scan has been run yet. Start one under{' '}
          <Link href="/settings/comics" className="text-shelvarr-primary hover:underline">
            Settings → Comics
          </Link>
          .
        </p>
      </div>
    );
  }

  if (run.status === 'pending' || run.status === 'running') {
    return (
      <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center space-y-2">
        <p className="text-white">Scanning {run.path ?? 'the library'}…</p>
        <p className="text-shelvarr-text-muted text-sm">
          {run.total ? `${run.progress} of ${run.total} folders` : 'Listing folders'} — one
          ComicVine search per folder, so this takes a few minutes.
        </p>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="px-3 py-1.5 text-sm rounded-lg border border-shelvarr-border text-white hover:border-blue-500"
        >
          Refresh
        </button>
      </div>
    );
  }

  if (run.status === 'failed') {
    return (
      <div className="bg-red-600/20 text-red-400 border border-red-500/40 rounded-lg p-4">
        Scan failed: {run.error ?? 'unknown error'}
      </div>
    );
  }

  if (run.proposals.length === 0) {
    return (
      <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center">
        <p className="text-shelvarr-text-muted">
          Nothing found under {run.path ?? 'that path'}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-shelvarr-text-muted text-sm">
          {run.proposals.length} folder{run.proposals.length === 1 ? '' : 's'} under{' '}
          <span className="font-mono">{run.path}</span> · {selected.length} selected
        </p>

        <div className="flex items-center gap-2">
          {rootFolders.length > 1 && (
            <select
              value={rootFolderId}
              onChange={(event) => setRootFolderId(Number(event.target.value))}
              className="bg-shelvarr-surface border border-shelvarr-border rounded-lg px-2 py-1.5 text-sm text-white"
            >
              {rootFolders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.path}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={handleApply}
            disabled={applying || selected.length === 0}
            className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium"
          >
            {applying ? 'Importing…' : `Import ${selected.length}`}
          </button>
        </div>
      </div>

      <p className="text-xs text-shelvarr-text-muted">
        Nothing is moved or renamed — each volume keeps the folder it is in.
      </p>

      {error && (
        <div className="bg-red-600/20 text-red-400 border border-red-500/40 rounded-lg p-4">
          {error}
        </div>
      )}

      {result && (
        <div className="bg-green-600/10 border border-green-500/40 rounded-lg p-4 space-y-2">
          <p className="text-green-400 text-sm">
            Imported {result.imported} volume{result.imported === 1 ? '' : 's'}.
          </p>
          {result.failed.length > 0 && (
            <div className="text-sm text-red-400">
              <p>{result.failed.length} failed:</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {result.failed.map((entry) => (
                  <li key={entry.folder}>
                    {folderLabel(entry.folder)} — {entry.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <ul className="bg-shelvarr-surface border border-shelvarr-border rounded-lg divide-y divide-shelvarr-border">
        {run.proposals.map((proposal) => {
          const chosen = choices[proposal.folder] ?? null;

          return (
            <li key={proposal.folder} className="p-3 flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1.5"
                checked={chosen !== null}
                disabled={proposal.alreadyAdded !== null || proposal.candidates.length === 0}
                onChange={(event) =>
                  setChoices((current) => ({
                    ...current,
                    [proposal.folder]: event.target.checked
                      ? proposal.suggestedComicvineId ??
                        proposal.candidates[0]?.comicvineId ??
                        null
                      : null,
                  }))
                }
              />

              <div className="min-w-0 flex-1">
                <p className="text-white text-sm truncate" title={proposal.folder}>
                  {folderLabel(proposal.folder)}
                </p>
                <p className="text-xs text-shelvarr-text-muted mt-0.5">
                  parsed as “{proposal.series}”
                  {proposal.year ? ` (${proposal.year})` : ''} · {proposal.fileCount} file
                  {proposal.fileCount === 1 ? '' : 's'}
                </p>

                {proposal.alreadyAdded !== null ? (
                  <p className="text-xs text-shelvarr-text-muted mt-2">
                    Already in the library —{' '}
                    <Link
                      href={`/comics/${proposal.alreadyAdded}`}
                      className="text-shelvarr-primary hover:underline"
                    >
                      open it
                    </Link>
                  </p>
                ) : proposal.candidates.length === 0 ? (
                  <p className="text-xs text-yellow-400 mt-2">
                    ComicVine had no match. Add this one by hand from the Add Comic page.
                  </p>
                ) : (
                  <select
                    value={chosen ?? ''}
                    onChange={(event) =>
                      setChoices((current) => ({
                        ...current,
                        [proposal.folder]: event.target.value
                          ? Number(event.target.value)
                          : null,
                      }))
                    }
                    className="mt-2 w-full bg-shelvarr-bg border border-shelvarr-border rounded-lg px-2 py-1 text-sm text-white"
                  >
                    <option value="">Don&apos;t import this folder</option>
                    {proposal.candidates.map((candidate) => (
                      <option key={candidate.comicvineId} value={candidate.comicvineId}>
                        {candidateLabel(candidate)}
                        {candidate.comicvineId === proposal.suggestedComicvineId
                          ? '  ← best guess'
                          : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
