'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LiveEvent } from '@shelvarr/services';
import {
  cancelBookDownload,
  retryBookDownload,
  unblockBookLink,
  type BookDownloadQueueView,
} from '@/lib/actions/downloads';
import { formatByteProgress } from '@/lib/utils/bytes';
import { formatRelativeTime } from '@/lib/utils/dates';
import { useLiveRefresh, useLiveEvents } from '@/components/live/LiveEvents';

const STATE_STYLES: Record<string, string> = {
  queued: 'bg-shelvarr-surface text-shelvarr-text-muted border-shelvarr-border',
  downloading: 'bg-blue-600/20 text-blue-400 border-blue-500/40',
  importing: 'bg-blue-600/20 text-blue-400 border-blue-500/40',
  completed: 'bg-green-600/20 text-green-400 border-green-500/40',
  failed: 'bg-red-600/20 text-red-400 border-red-500/40',
  cancelled: 'bg-gray-600/20 text-gray-400 border-gray-500/40',
};

/**
 * A book download's bytes transferred, moved forward between server renders.
 *
 * Not the shared `useLiveDownloadProgress` from `components/live/`: that hook
 * only matches a live `download` event by `id`, but book and comic downloads
 * are separate id spaces (a `book_downloads` row and a `comic_downloads` row
 * can share an id), so a progress event for the "wrong" queue could otherwise
 * be applied to this row. Checking `mediaType === 'book'` too avoids that.
 *
 * Otherwise mirrors `useLiveDownloadProgress`'s "server wins" rule: a fresh
 * server render always overrides a held live figure, so a live event that
 * arrived just before a refresh cannot hold a finished row's bar short of
 * the end.
 */
function useLiveBookDownloadProgress(
  downloadId: number,
  fromServer: { progress: number; size: number | null }
): { progress: number; size: number | null } {
  const [live, setLive] = useState<{ progress: number; size: number | null } | null>(null);

  const serverKey = `${fromServer.progress}/${fromServer.size}`;
  const lastFromServer = useRef(serverKey);
  let current = live;
  if (lastFromServer.current !== serverKey) {
    lastFromServer.current = serverKey;
    setLive(null);
    current = null;
  }

  useLiveEvents((event: LiveEvent) => {
    if (event.kind !== 'download' || event.mediaType !== 'book' || event.id !== downloadId) return;
    if (event.event !== 'progress') return;
    setLive((previous) => ({
      progress: event.progress,
      size: event.size ?? previous?.size ?? fromServer.size,
    }));
  });

  return current ?? fromServer;
}

export function DownloadQueue({ data }: { data: BookDownloadQueueView }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);

  // A download changing state moves it between the queue and the finished
  // list, and finishing one adds a history row, so those come from the
  // server. Bytes transferred are patched into the bar below without a round
  // trip. Mirrors comics/DownloadQueue.tsx.
  useLiveRefresh(
    useCallback(
      (event: LiveEvent) =>
        event.kind === 'download' && event.mediaType === 'book' && event.event !== 'progress',
      []
    )
  );

  const handleCancel = async (id: number) => {
    setBusy(id);
    await cancelBookDownload(id);
    router.refresh();
    setBusy(null);
  };

  const handleRetry = async (id: number) => {
    setBusy(id);
    await retryBookDownload(id);
    router.refresh();
    setBusy(null);
  };

  const handleUnblock = async (id: number) => {
    setBusy(id);
    await unblockBookLink(id);
    router.refresh();
    setBusy(null);
  };

  const active = data.downloads.filter(
    (download) =>
      download.state === 'queued' ||
      download.state === 'downloading' ||
      download.state === 'importing'
  );
  const finished = data.downloads.filter((download) => !active.includes(download));

  return (
    <div className="space-y-10">
      {/* Queue ------------------------------------------------------------ */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">
          Queue {active.length > 0 && <span className="text-shelvarr-text-muted">({active.length})</span>}
        </h2>

        {active.length === 0 ? (
          <p className="text-shelvarr-text-muted text-sm">Nothing downloading.</p>
        ) : (
          <ul className="bg-shelvarr-surface border border-shelvarr-border rounded-lg divide-y divide-shelvarr-border">
            {active.map((download) => (
              <ActiveDownloadRow
                key={download.id}
                download={download}
                busy={busy === download.id}
                onCancel={() => handleCancel(download.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Recently finished ------------------------------------------------ */}
      {finished.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Recently finished</h2>
          <ul className="bg-shelvarr-surface border border-shelvarr-border rounded-lg divide-y divide-shelvarr-border">
            {finished.map((download) => (
              <li key={download.id} className="p-3 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded border ${STATE_STYLES[download.state]}`}
                    >
                      {download.state}
                    </span>
                    <span className="text-white truncate">{download.title}</span>
                  </div>
                  {download.error && (
                    <p className="text-xs text-red-400 mt-1 truncate">{download.error}</p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {(download.state === 'failed' || download.state === 'cancelled') && (
                    <button
                      type="button"
                      onClick={() => handleRetry(download.id)}
                      disabled={busy === download.id}
                      className="text-sm text-blue-400 hover:text-blue-300 disabled:opacity-40"
                    >
                      Retry
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCancel(download.id)}
                    disabled={busy === download.id}
                    className="text-sm text-shelvarr-text-muted hover:text-white disabled:opacity-40"
                  >
                    Clear
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* History ---------------------------------------------------------- */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">History</h2>
        {data.history.length === 0 ? (
          <p className="text-shelvarr-text-muted text-sm">Nothing downloaded yet.</p>
        ) : (
          <ul className="bg-shelvarr-surface border border-shelvarr-border rounded-lg divide-y divide-shelvarr-border text-sm">
            {data.history.map((entry) => (
              <li key={entry.id} className="p-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-white truncate">{entry.title ?? 'Unknown'}</p>
                  <p className="text-xs text-shelvarr-text-muted">
                    {entry.source ?? 'unknown source'} · {formatRelativeTime(entry.downloadedAt)}
                  </p>
                </div>
                <span className={entry.success ? 'text-green-400' : 'text-red-400'}>
                  {entry.success ? 'ok' : 'failed'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Blocklist -------------------------------------------------------- */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-1">Blocklist</h2>
        <p className="text-shelvarr-text-muted text-sm mb-3">
          Links that turned out to be dead. Searches skip these; unblock one to let it be tried
          again.
        </p>

        {data.blocklist.length === 0 ? (
          <p className="text-shelvarr-text-muted text-sm">Nothing blocked.</p>
        ) : (
          <ul className="bg-shelvarr-surface border border-shelvarr-border rounded-lg divide-y divide-shelvarr-border text-sm">
            {data.blocklist.map((entry) => (
              <li key={entry.id} className="p-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-white truncate">{entry.title ?? entry.downloadUrl}</p>
                  <p className="text-xs text-shelvarr-text-muted">
                    {entry.reason} · {formatRelativeTime(entry.addedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleUnblock(entry.id)}
                  disabled={busy === entry.id}
                  className="text-sm text-shelvarr-text-muted hover:text-white disabled:opacity-40 whitespace-nowrap"
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * A download still in flight.
 *
 * Its own component so the live byte count has somewhere to live: a hook
 * cannot be called inside the `map` that renders the queue, and keeping the
 * state per row means a transfer redrawing its bar does not re-render the
 * rest of the page.
 */
function ActiveDownloadRow({
  download,
  busy,
  onCancel,
}: {
  download: BookDownloadQueueView['downloads'][number];
  busy: boolean;
  onCancel: () => void;
}) {
  const { progress, size } = useLiveBookDownloadProgress(download.id, {
    progress: download.progress,
    size: download.size,
  });

  const label = formatByteProgress(progress, size);

  return (
    <li className="p-3 flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded border ${STATE_STYLES[download.state]}`}>
            {download.state}
          </span>
          <span className="text-white truncate">{download.title}</span>
        </div>
        <p className="text-xs text-shelvarr-text-muted mt-1 truncate">
          {download.author ?? ''}
          {download.author ? ' · ' : ''}
          {download.source}
          {download.libraryName && ` · ${download.libraryName}`}
          {label && ` · ${label}`}
          {download.attempts > 1 && ` · attempt ${download.attempts}`}
          {download.alternates > 0 &&
            ` · ${download.alternates} fallback${download.alternates === 1 ? '' : 's'}`}
        </p>
        {download.state === 'queued' && download.error && (
          <p className="text-xs text-amber-400 mt-1 truncate">{download.error}</p>
        )}
        {size ? (
          <div className="mt-2 h-1 bg-shelvarr-bg rounded overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${Math.min(100, (progress / size) * 100)}%` }}
            />
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="text-sm text-red-400 hover:text-red-300 disabled:opacity-40 whitespace-nowrap"
      >
        Cancel
      </button>
    </li>
  );
}
