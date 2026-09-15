'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { refreshUnmatchedMetadata } from '@/lib/actions/libraries';
import { getTaskById } from '@/lib/actions/tasks';
import { useToast } from '@/components/ui/Toast';

/** How often to check the task and re-render the list while it runs. */
const POLL_MS = 2000;

interface Progress {
  current: number;
  total: number | null;
}

/**
 * Starts a metadata lookup for the books on the Unmatched page and keeps the
 * page current while it runs, so matched books drop off as they're found
 * rather than all at once when the task ends.
 */
export function RefreshUnmatchedButton({
  libraryId,
  pollMs = POLL_MS,
}: {
  libraryId?: number;
  /** Tests shorten this so they don't sit through real polling delays. */
  pollMs?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [starting, setStarting] = useState(false);
  const [taskId, setTaskId] = useState<number | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);

  // The toast context hands out a new object every time a toast shows, which
  // would restart the poll loop if the effect depended on it.
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    if (taskId === null) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    // Chained timeouts rather than an interval, so a slow response can't
    // stack up overlapping polls.
    const poll = async () => {
      let task: Awaited<ReturnType<typeof getTaskById>>;
      try {
        task = await getTaskById(taskId);
      } catch {
        // A dropped request says nothing about the task; try again next tick.
        if (!cancelled) timer = setTimeout(poll, pollMs);
        return;
      }
      if (cancelled) return;

      router.refresh();

      // No task means it was cleaned up underneath us; nothing left to watch.
      if (!task || task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
        if (task?.status === 'completed') {
          const matched = typeof task.data?.matched === 'number' ? task.data.matched : 0;
          toastRef.current.success(`Metadata refresh finished: ${matched} matched`);
        } else if (task?.status === 'failed') {
          toastRef.current.error(task.error ?? 'Metadata refresh failed');
        }
        setTaskId(null);
        setProgress(null);
        return;
      }

      setProgress({ current: task.progress, total: task.total });
      timer = setTimeout(poll, pollMs);
    };

    timer = setTimeout(poll, pollMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [taskId, router, pollMs]);

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
