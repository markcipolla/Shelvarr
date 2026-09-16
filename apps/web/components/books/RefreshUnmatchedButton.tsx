'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { refreshUnmatchedMetadata } from '@/lib/actions/libraries';
import { getTaskById } from '@/lib/actions/tasks';
import { useLiveConnection, useLiveEvents } from '@/components/live/LiveEvents';
import { useToast } from '@/components/ui/Toast';

interface Progress {
  current: number;
  total: number | null;
}

/**
 * Starts a metadata lookup for the books on the Unmatched page and reports on
 * it while it runs, so matched books drop off as they're found rather than all
 * at once when the task ends.
 *
 * This used to ask the server how the task was doing every couple of seconds,
 * which meant a full page render every two seconds whether or not anything had
 * changed. It now listens on the live event stream instead: the count comes
 * from the task's own progress reports, and the page itself is kept current by
 * the `LiveRefresh` on the Unmatched page.
 */
export function RefreshUnmatchedButton({ libraryId }: { libraryId?: number }) {
  const toast = useToast();
  const connected = useLiveConnection();
  const [starting, setStarting] = useState(false);
  const [taskId, setTaskId] = useState<number | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);

  // The toast context hands out a new object every time a toast shows, which
  // would re-run the effect below if it were a dependency.
  const toastRef = useRef(toast);
  toastRef.current = toast;

  /** Stop watching, and say how it went. */
  const finish = useCallback(
    (status: string, error: string | null, matched: number | null) => {
      if (status === 'completed') {
        toastRef.current.success(`Metadata refresh finished: ${matched ?? 0} matched`);
      } else if (status === 'failed') {
        toastRef.current.error(error ?? 'Metadata refresh failed');
      }
      setTaskId(null);
      setProgress(null);
    },
    []
  );

  /**
   * Read the result off a finished task.
   *
   * The event says the task completed but not what it found, which is a
   * deliberately small payload — the count is worth one request at the end,
   * where polling wanted one every couple of seconds throughout.
   */
  const announceResult = useCallback(
    async (id: number, status: string, error: string | null) => {
      if (status !== 'completed') {
        finish(status, error, null);
        return;
      }

      const task = await getTaskById(id).catch(() => null);
      const matched = typeof task?.data?.['matched'] === 'number' ? task.data['matched'] : 0;
      finish('completed', null, matched);
    },
    [finish]
  );

  useLiveEvents((event) => {
    if (taskId === null) return;
    if (event.kind !== 'task' || event.id !== taskId) return;

    if (event.event === 'progress') {
      setProgress({ current: event.progress, total: event.total });
      return;
    }

    if (event.status === 'completed' || event.status === 'failed' || event.status === 'cancelled') {
      void announceResult(taskId, event.status, event.error ?? null);
    }
  });

  /**
   * Catch up whenever the stream is (re)connected.
   *
   * Events that happen while the connection is down are gone — they are not
   * replayed — so a task that finished during a dropout would otherwise leave
   * this button saying "Refreshing..." for good. One read on reconnect covers
   * that, and covers the gap between starting the task and the first event.
   */
  useEffect(() => {
    if (taskId === null || !connected) return;

    let cancelled = false;

    void (async () => {
      const task = await getTaskById(taskId).catch(() => null);
      if (cancelled) return;

      // A task that has been cleaned up underneath us is nothing left to watch.
      if (!task) {
        setTaskId(null);
        setProgress(null);
        return;
      }

      if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
        const matched = typeof task.data?.['matched'] === 'number' ? task.data['matched'] : 0;
        finish(task.status, task.error, matched);
        return;
      }

      setProgress({ current: task.progress, total: task.total });
    })();

    return () => {
      cancelled = true;
    };
  }, [taskId, connected, finish]);

  const handleRefresh = async () => {
    setStarting(true);
    try {
      const result = await refreshUnmatchedMetadata(libraryId);
      if (result.error) {
        toast.error(result.error);
      } else if (result.taskId !== undefined) {
        toast.success(`Metadata refresh started (Task #${result.taskId})`);
        setTaskId(result.taskId);
      }
    } catch {
      toast.error('Failed to start metadata refresh');
    } finally {
      setStarting(false);
    }
  };

  const running = taskId !== null;

  let label = 'Refresh Metadata';
  if (starting) {
    label = 'Starting...';
  } else if (running) {
    label = progress?.total ? `Refreshing ${progress.current}/${progress.total}...` : 'Refreshing...';
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={starting || running}
      className="bg-shelvarr-surface hover:bg-shelvarr-border text-white border border-shelvarr-border px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
    >
      {label}
    </button>
  );
}
