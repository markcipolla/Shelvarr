'use client';

import { useCallback } from 'react';
import type { LiveEvent, TaskEvent } from '@shelvarr/services';
import { useLiveRefresh } from './LiveEvents';

interface LiveRefreshProps {
  /**
   * Task types worth re-rendering for. Left out, any task will do — which is
   * what a page showing overall counts wants.
   */
  taskTypes?: TaskEvent['taskType'][];
  /** Also re-render when a comic download changes state. */
  downloads?: boolean;
}

/**
 * Keep a server-rendered page current.
 *
 * The hook it wraps takes a predicate, and a function cannot be handed from a
 * server component to a client one, so the interesting events are named as
 * plain data instead. Drop this anywhere on a page that background work
 * changes and it will re-render itself when that work moves.
 *
 * Progress is never a reason to re-render a whole page: it says a job is
 * still going, not that anything the page shows has changed. Rows that want a
 * moving bar use `useLiveProgress` instead.
 */
export function LiveRefresh({ taskTypes, downloads = false }: LiveRefreshProps) {
  useLiveRefresh(
    useCallback(
      (event: LiveEvent) => {
        if (event.event === 'progress') return false;
        if (event.kind === 'download') return downloads;
        return !taskTypes || taskTypes.includes(event.taskType);
      },
      // Compared by content: a page writing the array inline would otherwise
      // hand over a new one on every render, and re-subscribe every time.
      [downloads, taskTypes?.join(',')]
    )
  );

  return null;
}
