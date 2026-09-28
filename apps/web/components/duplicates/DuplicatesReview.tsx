'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  resolveBookDuplicateAction,
  type BookDuplicateGroup,
  type ComicDuplicateCandidateView,
} from '@/lib/actions/duplicates';
import { tidyComicDuplicatesAction, type UnresolvedComicDuplicate } from '@/lib/actions/comics';
import { formatBytes } from '@/lib/utils/bytes';

const cardClass = 'bg-shelvarr-surface border border-shelvarr-border rounded-lg';

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${cardClass} p-6 text-center text-shelvarr-text-muted`}>{children}</div>
  );
}

function BookGroup({ group }: { group: BookDuplicateGroup }) {
  const router = useRouter();
  const [keepId, setKeepId] = useState(group.copies[0]?.id ?? 0);
  const [deleteFiles, setDeleteFiles] = useState(group.kind === 'identical');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResolve = async () => {
    setBusy(true);
    setError(null);
    const result = await resolveBookDuplicateAction(
      keepId,
      group.copies.map((copy) => copy.id),
      deleteFiles
    );
    if (!result.success) setError(result.error ?? 'Failed to remove the other copies');
    else router.refresh();
    setBusy(false);
  };

  const heading = group.copies[0];

  return (
    <div className={`${cardClass} p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-white font-medium truncate">{heading?.title ?? 'Untitled'}</h3>
          <p className="text-sm text-shelvarr-text-muted truncate">
            {heading?.authors.join(', ') || 'Unknown author'}
          </p>
        </div>
        <span
          className={`shrink-0 px-2 py-0.5 text-xs rounded-full ${
            group.kind === 'identical'
              ? 'bg-red-500/20 text-red-300'
              : 'bg-orange-500/20 text-orange-300'
          }`}
        >
          {group.kind === 'identical'
            ? `${group.copies.length} identical files`
            : `${Math.round(group.similarity * 100)}% alike`}
        </span>
      </div>

      <ul className="space-y-1">
        {group.copies.map((copy) => (
          <li key={copy.id}>
            <label className="flex items-start gap-3 p-2 rounded-lg hover:bg-shelvarr-bg cursor-pointer">
              <input
                type="radio"
                name={`keep-${group.key}`}
                className="mt-1"
                checked={keepId === copy.id}
                onChange={() => setKeepId(copy.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-xs text-shelvarr-text-muted break-all">
                  {copy.filePath}
                </span>
                <span className="block text-xs text-shelvarr-text-muted mt-0.5">
                  {[
                    copy.extension?.toUpperCase(),
                    copy.fileSize ? formatBytes(copy.fileSize) : null,
                    copy.matched ? 'metadata matched' : 'no metadata',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <Link
                href={`/books/${copy.id}`}
                className="shrink-0 text-xs text-blue-400 hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                Open
              </Link>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-shelvarr-text-muted">
          <input
            type="checkbox"
            checked={deleteFiles}
            onChange={(event) => setDeleteFiles(event.target.checked)}
          />
          Delete the other files from disk
        </label>
        <button
          onClick={handleResolve}
          disabled={busy}
          className="px-3 py-1.5 text-sm rounded-lg bg-shelvarr-primary text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Removing…' : `Keep this one, drop ${group.copies.length - 1}`}
        </button>
        {!deleteFiles && (
          <span className="text-xs text-shelvarr-text-muted">
            Files stay on disk, so the next scan will find them again.
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

function ComicTidy() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    removed: number;
    unresolved: UnresolvedComicDuplicate[];
    error?: string;
  } | null>(null);

  const handleTidy = async () => {
    setBusy(true);
    setResult(null);
    const tidied = await tidyComicDuplicatesAction();
    setResult({
      removed: tidied.removed,
      unresolved: tidied.unresolved,
      ...(tidied.error ? { error: tidied.error } : {}),
    });
    router.refresh();
    setBusy(false);
  };

  return (
    <div className={`${cardClass} p-4 space-y-3`}>
      <div>
        <h3 className="text-white font-medium">Volumes held twice</h3>
        <p className="text-sm text-shelvarr-text-muted mt-1">
          One folder, one volume; one ComicVine volume, one row. Costs no ComicVine requests.
        </p>
      </div>
      <button
        onClick={handleTidy}
        disabled={busy}
        className="px-3 py-1.5 text-sm rounded-lg bg-shelvarr-primary text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Checking…' : 'Find and tidy duplicates'}
      </button>

      {result?.error && <p className="text-sm text-red-400">{result.error}</p>}
      {result && !result.error && (
        <p className="text-sm text-shelvarr-text-muted">
          {result.removed === 0
            ? 'Nothing to tidy.'
            : `Removed ${result.removed} duplicate volume${result.removed === 1 ? '' : 's'}.`}
        </p>
      )}
      {result && result.unresolved.length > 0 && (
        <div className="text-sm text-shelvarr-text-muted space-y-1">
          <p>
            {result.unresolved.length} volume{result.unresolved.length === 1 ? ' is' : 's are'} held
            twice with files under both folders. Remove the one you don&apos;t want.
          </p>
          <ul className="space-y-1">
            {result.unresolved.map((duplicate) => (
              <li key={duplicate.comicvineId}>
                <Link
                  href={`/comics?search=${encodeURIComponent(duplicate.title)}`}
                  className="text-blue-400 hover:underline"
                >
                  {duplicate.title}
                </Link>
                {' — '}
                <span className="font-mono text-xs">{duplicate.folders.join('  ·  ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ComicCandidate({ candidate }: { candidate: ComicDuplicateCandidateView }) {
  return (
    <div className={`${cardClass} p-4 space-y-2`}>
      <h3 className="text-white font-medium">{candidate.title}</h3>
      <ul className="space-y-1">
        {candidate.volumes.map((volume) => (
          <li key={volume.id} className="text-sm">
            <Link
              href={`/comics?search=${encodeURIComponent(volume.title)}`}
              className="text-blue-400 hover:underline"
            >
              {volume.title}
            </Link>
            <span className="text-shelvarr-text-muted">
              {' — '}
              {volume.issueCount} issue{volume.issueCount === 1 ? '' : 's'}
              {volume.holdsFiles ? ', has files' : ', no files'}
              {' · ComicVine '}
              {volume.comicvineId}
            </span>
            {volume.folder && (
              <span className="block font-mono text-xs text-shelvarr-text-muted break-all">
                {volume.folder}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DuplicatesReview({
  books,
  comics,
}: {
  books: BookDuplicateGroup[];
  comics: ComicDuplicateCandidateView[];
}) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Books</h2>
          <p className="text-sm text-shelvarr-text-muted">
            {books.length === 0
              ? 'No duplicates found.'
              : `${books.length} group${books.length === 1 ? '' : 's'} — pick the copy to keep.`}
          </p>
        </div>
        {books.length === 0 ? (
          <Empty>Every book in the library is there exactly once.</Empty>
        ) : (
          books.map((group) => <BookGroup key={group.key} group={group} />)
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Comics</h2>
          <p className="text-sm text-shelvarr-text-muted">
            Exact duplicates are tidied on request; the rest are listed for you to judge.
          </p>
        </div>
        <ComicTidy />
        {comics.length === 0 ? (
          <Empty>No volumes share a title.</Empty>
        ) : (
          <>
            <p className="text-sm text-shelvarr-text-muted">
              {comics.length} title{comics.length === 1 ? '' : 's'} appear more than once under
              different ComicVine volumes. Some of these are genuine reissues — nothing is merged
              for you.
            </p>
            {comics.map((candidate) => (
              <ComicCandidate
                key={candidate.volumes.map((volume) => volume.id).join('-')}
                candidate={candidate}
              />
            ))}
          </>
        )}
      </section>
    </div>
  );
}
