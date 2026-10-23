'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  startComicLibraryImport,
  type ScheduleView,
} from '@/lib/actions/settings';
import {
  findDuplicateComicFilesAction,
  removeDuplicateComicFilesAction,
  tidyComicDuplicatesAction,
  type DuplicateComicFileView,
  type UnresolvedComicDuplicate,
} from '@/lib/actions/comics';
import { RecurringJobs } from '@/components/settings/RecurringJobs';
import { FolderPicker } from '@/components/ui/FolderPicker';

interface ComicsSettings {
  /** Whether ComicVine is configured on the Metadata Sources tab. */
  hasApiKey: boolean;
}

/** How many copies the whole list would delete. */
function copyCount(groups: DuplicateComicFileView[]): number {
  return groups.reduce((total, group) => total + group.remove.length, 0);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** Just the filename: the folder is the same for every copy in a group. */
function fileName(path: string): string {
  return path.split('/').pop() ?? path;
}

const inputClass =
  'w-full bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500';

export function ComicsTab({
  settings,
  schedules,
}: {
  settings: ComicsSettings;
  schedules: ScheduleView[];
}) {
  const router = useRouter();

  const [importPath, setImportPath] = useState('');
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const [tidying, setTidying] = useState(false);
  const [duplicates, setDuplicates] = useState<{
    removed: number;
    unresolved: UnresolvedComicDuplicate[];
    error?: string;
  } | null>(null);

  const [scanningFiles, setScanningFiles] = useState(false);
  const [removingFiles, setRemovingFiles] = useState(false);
  const [duplicateFiles, setDuplicateFiles] = useState<{
    groups: DuplicateComicFileView[];
    bytes: number;
    error?: string;
  } | null>(null);
  const [removedFiles, setRemovedFiles] = useState<{
    removed: number;
    bytes: number;
    errors: Array<{ path: string; error: string }>;
    error?: string;
  } | null>(null);

  const handleFindDuplicateFiles = async () => {
    setScanningFiles(true);
    setDuplicateFiles(null);
    setRemovedFiles(null);

    const result = await findDuplicateComicFilesAction();
    setDuplicateFiles({
      groups: result.groups,
      bytes: result.bytes,
      ...(result.error ? { error: result.error } : {}),
    });
    setScanningFiles(false);
  };

  const handleRemoveDuplicateFiles = async () => {
    setRemovingFiles(true);

    const result = await removeDuplicateComicFilesAction();
    setRemovedFiles({
      removed: result.removed,
      bytes: result.bytes,
      errors: result.errors,
      ...(result.error ? { error: result.error } : {}),
    });
    setDuplicateFiles(null);
    router.refresh();
    setRemovingFiles(false);
  };

  const handleTidyDuplicates = async () => {
    setTidying(true);
    setDuplicates(null);

    const result = await tidyComicDuplicatesAction();
    setDuplicates({
      removed: result.removed,
      unresolved: result.unresolved,
      ...(result.error ? { error: result.error } : {}),
    });
    router.refresh();
    setTidying(false);
  };

  const handleImport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!importPath.trim()) return;

    const result = await startComicLibraryImport(importPath.trim());
    setImportMessage(
      result.success
        ? `Scanning ${importPath.trim()}. This makes one ComicVine search per folder, so it takes a while — the import review page shows progress.`
        : 'Could not start the import'
    );
  };

  return (
    <div className="max-w-2xl space-y-10">
      {/* Root folders ---------------------------------------------------- */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-1">Root folders</h2>
        <p className="text-shelvarr-text-muted text-sm">
          Comics live in a library of type Comics, alongside the book ones on the{' '}
          <a href="/libraries" className="text-shelvarr-primary hover:underline">
            Libraries
          </a>{' '}
          page. Each volume gets its own folder underneath one.
        </p>
      </section>

      {/* Recurring jobs --------------------------------------------------- */}
      <RecurringJobs
        schedules={schedules}
        blurb="Background jobs Shelvarr runs on a timer. The search sweep downloads things, so it starts switched off."
      />

      {/* Library import --------------------------------------------------- */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-1">Import an existing library</h2>
        <p className="text-shelvarr-text-muted mb-4 text-sm">
          Point this at a folder tree you already have, whatever organised it, and Shelvarr will
          work out which ComicVine volume each folder is. Nothing is moved or renamed; you
          confirm the matches afterwards.
        </p>

        <form onSubmit={handleImport} className="flex items-start gap-2">
          <FolderPicker
            value={importPath}
            onChange={setImportPath}
            placeholder="/libraries/comics"
            inputClassName={inputClass}
          />
          <button
            type="submit"
            disabled={!settings.hasApiKey}
            title={settings.hasApiKey ? undefined : 'Set a ComicVine API key first'}
            className="px-4 py-2 bg-shelvarr-surface border border-shelvarr-border hover:border-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium whitespace-nowrap"
          >
            Scan
          </button>
        </form>
        {importMessage && <p className="mt-2 text-sm text-shelvarr-text-muted">{importMessage}</p>}

        <p className="mt-3 text-sm text-shelvarr-text-muted">
          Once a scan finishes, confirm the matches on the{' '}
          <a href="/comics/import" className="text-shelvarr-primary hover:underline">
            import review page
          </a>
          .
        </p>
      </section>

      {/* Duplicates ------------------------------------------------------- */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-1">Duplicates</h2>
        <p className="text-shelvarr-text-muted mb-4 text-sm">
          A volume can end up listed twice: two rows holding one folder, or one ComicVine volume
          adopted under two paths. A copy holding no files is removed; where both copies hold
          files, the folders are listed for you to settle. Costs no ComicVine requests, and
          every library scan does it too.
        </p>

        <button
          type="button"
          onClick={handleTidyDuplicates}
          disabled={tidying}
          className="px-4 py-2 bg-shelvarr-surface border border-shelvarr-border hover:border-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
        >
          {tidying ? 'Checking…' : 'Find and tidy duplicates'}
        </button>

        {duplicates?.error && <p className="mt-2 text-sm text-red-400">{duplicates.error}</p>}

        {duplicates && !duplicates.error && (
          <p className="mt-2 text-sm text-shelvarr-text-muted">
            {duplicates.removed === 0
              ? 'Nothing to tidy — no volume is listed twice.'
              : `Removed ${duplicates.removed} duplicate volume${
                  duplicates.removed === 1 ? '' : 's'
                }. The files are untouched.`}
          </p>
        )}

        {duplicates && duplicates.unresolved.length > 0 && (
          <div className="mt-3 bg-amber-500/10 border border-amber-500/40 rounded-lg p-4 space-y-2">
            <p className="text-amber-300 text-sm">
              {duplicates.unresolved.length} volume
              {duplicates.unresolved.length === 1 ? ' is' : 's are'} held twice with files under
              each folder. Open each and remove the copy pointing at the folder you don&apos;t
              want — which is a choice about your files, so Shelvarr will not guess it.
            </p>
            <ul className="space-y-1 text-xs text-shelvarr-text-muted">
              {duplicates.unresolved.map((duplicate) => (
                <li key={duplicate.comicvineId}>
                  <a
                    href={`/comics?search=${encodeURIComponent(duplicate.title)}`}
                    className="text-shelvarr-primary hover:underline"
                  >
                    {duplicate.title}
                  </a>
                  {' — '}
                  <span className="font-mono">{duplicate.folders.join('  ·  ')}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Duplicate files ------------------------------------------------- */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-1">Duplicate files</h2>
        <p className="text-shelvarr-text-muted mb-4 text-sm">
          An import never overwrites, so a file arriving under a name already taken is filed as
          <span className="font-mono"> (2)</span>. Where the bytes differ that is two different
          releases and a rename settles them; where they match it is the same file twice. Every
          same-size pair in every volume folder is hashed to be sure, so this takes a while on a
          big library.
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleFindDuplicateFiles}
            disabled={scanningFiles || removingFiles}
            className="px-4 py-2 bg-shelvarr-surface border border-shelvarr-border hover:border-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
          >
            {scanningFiles ? 'Comparing files…' : 'Find duplicate files'}
          </button>

          {duplicateFiles && duplicateFiles.groups.length > 0 && (
            <button
              type="button"
              onClick={handleRemoveDuplicateFiles}
              disabled={removingFiles}
              className="px-4 py-2 bg-red-500/10 border border-red-500/40 hover:border-red-500 disabled:opacity-50 text-red-300 rounded-lg text-sm font-medium"
            >
              {removingFiles
                ? 'Deleting…'
                : `Delete ${copyCount(duplicateFiles.groups)} ${
                    copyCount(duplicateFiles.groups) === 1 ? 'copy' : 'copies'
                  }`}
            </button>
          )}
        </div>

        {duplicateFiles?.error && (
          <p className="mt-2 text-sm text-red-400">{duplicateFiles.error}</p>
        )}

        {duplicateFiles && !duplicateFiles.error && duplicateFiles.groups.length === 0 && (
          <p className="mt-2 text-sm text-shelvarr-text-muted">
            Nothing to remove — no file is held twice.
          </p>
        )}

        {duplicateFiles && duplicateFiles.groups.length > 0 && (
          <div className="mt-3 bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4 space-y-3">
            <p className="text-sm text-shelvarr-text-muted">
              {copyCount(duplicateFiles.groups)} redundant{' '}
              {copyCount(duplicateFiles.groups) === 1 ? 'copy' : 'copies'} across{' '}
              {duplicateFiles.groups.length}{' '}
              {duplicateFiles.groups.length === 1 ? 'file' : 'files'}, {formatBytes(duplicateFiles.bytes)}{' '}
              to reclaim. One copy of each stays.
            </p>
            <ul className="space-y-2 text-xs">
              {duplicateFiles.groups.map((group) => (
                <li key={group.keep}>
                  <span className="text-white">{group.volumeTitle}</span>{' '}
                  <span className="text-shelvarr-text-muted">({formatBytes(group.bytes)} each)</span>
                  <ul className="mt-1 space-y-0.5 font-mono text-shelvarr-text-muted">
                    <li className="text-green-400">keep {fileName(group.keep)}</li>
                    {group.remove.map((path) => (
                      <li key={path} className="text-red-400">
                        delete {fileName(path)}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        )}

        {removedFiles?.error && <p className="mt-2 text-sm text-red-400">{removedFiles.error}</p>}

        {removedFiles && !removedFiles.error && (
          <p className="mt-2 text-sm text-shelvarr-text-muted">
            {removedFiles.removed === 0
              ? 'Nothing was removed.'
              : `Deleted ${removedFiles.removed} ${
                  removedFiles.removed === 1 ? 'copy' : 'copies'
                }, freeing ${formatBytes(removedFiles.bytes)}. Rename a volume to tidy any ` +
                '(2) left on files that are not copies.'}
          </p>
        )}

        {removedFiles && removedFiles.errors.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-red-400">
            {removedFiles.errors.map((failure) => (
              <li key={failure.path}>
                <span className="font-mono">{fileName(failure.path)}</span> — {failure.error}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
