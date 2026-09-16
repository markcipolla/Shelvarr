'use client';

import { useRef, useState } from 'react';
import { useLiveEvents } from './LiveEvents';

/**
 * Progress is the one thing that changes too often to re-render a page for — a
 * large download reports it several times a second — but it is also the one
 * thing a page can update on its own, because a moving bar does not change
 * which list a row belongs in or which buttons it has. So these hooks patch
 * the counts in place and leave everything else to the server.
 *
 * Numbers from the server always win when they are new: a re-render is the
 * authoritative account, and a live event that arrived in the meantime should
 * not hold a finished row's bar short of the end.
 */

/**
 * React's "adjust state when props change" pattern, shared by both hooks:
 * remember what the server last said, and drop the live figure when it
 * changes.
 */
function useServerWins<T>(serverFigures: string, live: T | null, clear: () => void): T | null {
  const lastFromServer = useRef(serverFigures);
  if (lastFromServer.current !== serverFigures) {
    lastFromServer.current = serverFigures;
    clear();
    return null;
  }
  return live;
}

interface TaskProgress {
  progress: number;
  total: number | null;
}

/** A background task's progress, moved forward between server renders. */
export function useLiveTaskProgress(taskId: number, fromServer: TaskProgress): TaskProgress {
  const [live, setLive] = useState<TaskProgress | null>(null);

  const current = useServerWins(
    `${fromServer.progress}/${fromServer.total}`,
    live,
    () => setLive(null)
  );

  useLiveEvents((event) => {
    if (event.kind !== 'task' || event.id !== taskId) return;
    if (event.event !== 'progress') return;
    setLive({ progress: event.progress, total: event.total });
  });

  return current ?? fromServer;
}

interface DownloadProgress {
  progress: number;
  size: number | null;
}

/** A comic download's bytes transferred, moved forward between server renders. */
export function useLiveDownloadProgress(
  downloadId: number,
  fromServer: DownloadProgress
): DownloadProgress {
  const [live, setLive] = useState<DownloadProgress | null>(null);

  const current = useServerWins(
    `${fromServer.progress}/${fromServer.size}`,
    live,
    () => setLive(null)
  );

  useLiveEvents((event) => {
    if (event.kind !== 'download' || event.id !== downloadId) return;
    if (event.event !== 'progress') return;
    // A host that sends no Content-Length leaves `size` null on every tick,
    // but the total may have been learned on an earlier attempt and stored.
    // Keeping the last known total stops the bar vanishing mid-download.
    setLive((previous) => ({
      progress: event.progress,
      size: event.size ?? previous?.size ?? fromServer.size,
    }));
  });

  return current ?? fromServer;
}
