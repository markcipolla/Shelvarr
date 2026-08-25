'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  cancelComicDownload,
  unblockComicLink,
  type DownloadQueueView,
} from '@/lib/actions/comics';

const STATE_STYLES: Record<string, string> = {
  queued: 'bg-shelvarr-surface text-shelvarr-text-muted border-shelvarr-border',
  downloading: 'bg-blue-600/20 text-blue-400 border-blue-500/40',
  importing: 'bg-blue-600/20 text-blue-400 border-blue-500/40',
  completed: 'bg-green-600/20 text-green-400 border-green-500/40',
  failed: 'bg-red-600/20 text-red-400 border-red-500/40',
  cancelled: 'bg-gray-600/20 text-gray-400 border-gray-500/40',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

function progressLabel(progress: number, size: number | null): string {
  if (!size) return progress > 0 ? formatBytes(progress) : '';
  return `${formatBytes(progress)} of ${formatBytes(size)} (${Math.round((progress / size) * 100)}%)`;
}

export function DownloadQueue({ data }: { data: DownloadQueueView }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);

  const handleCancel = async (id: number) => {
    setBusy(id);
    await cancelComicDownload(id);
    router.refresh();
    setBusy(null);
  };

  const handleUnblock = async (id: number) => {
    setBusy(id);
    await unblockComicLink(id);
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
              <li key={download.id} className="p-3 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded border ${STATE_STYLES[download.state]}`}
                    >
                      {download.state}
                    </span>
                    <Link
                      href={`/comics/${download.volumeId}`}
                      className="text-white truncate hover:underline"
                    >
                      {download.volumeTitle ?? `Volume ${download.volumeId}`}
                    </Link>
                  </div>
                  <p className="text-xs text-shelvarr-text-muted mt-1 truncate">
                    {download.webSubTitle ?? download.webTitle ?? ''}
                    {' · '}
                    {download.host}
                    {progressLabel(download.progress, download.size) &&
                      ` · ${progressLabel(download.progress, download.size)}`}
                  </p>
                  {download.size ? (
                    <div className="mt-2 h-1 bg-shelvarr-bg rounded overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{
                          width: `${Math.min(100, (download.progress / download.size) * 100)}%`,
                        }}
                      />
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => handleCancel(download.id)}
                  disabled={busy === download.id}
                  className="text-sm text-red-400 hover:text-red-300 disabled:opacity-40 whitespace-nowrap"
                >
                  Cancel
                </button>
              </li>
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
                    <Link
                      href={`/comics/${download.volumeId}`}
                      className="text-white truncate hover:underline"
                    >
                      {download.volumeTitle ?? `Volume ${download.volumeId}`}
                    </Link>
                  </div>
                  {download.error && (
                    <p className="text-xs text-red-400 mt-1 truncate">{download.error}</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleCancel(download.id)}
                  disabled={busy === download.id}
                  className="text-sm text-shelvarr-text-muted hover:text-white disabled:opacity-40"
                >
                  Clear
                </button>
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
                  <p className="text-white truncate">
                    {entry.fileTitle ?? entry.volumeTitle ?? 'Unknown'}
                  </p>
                  <p className="text-xs text-shelvarr-text-muted">
                    {entry.host ?? 'unknown host'} · {entry.downloadedAt}
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
                  <p className="text-white truncate">{entry.webTitle ?? entry.downloadLink}</p>
                  <p className="text-xs text-shelvarr-text-muted">
                    {entry.reason} · {entry.addedAt}
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
