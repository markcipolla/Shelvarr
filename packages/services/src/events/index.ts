/**
 * Live Event Bus
 *
 * Background work changes rows in SQLite; pages that are already open have no
 * way to notice. This is the in-process bus those changes are announced on, so
 * an SSE endpoint can forward them to the browser and a page can update the
 * one row that moved instead of waiting for someone to press reload.
 *
 * It is deliberately in-process and unpersisted. Shelvarr runs as a single
 * Node server that owns both the queue and the web requests, so a plain set of
 * callbacks is the whole mechanism — no broker, and nothing to clean up if a
 * listener goes away. An event missed while nobody was listening is not worth
 * recovering: the page renders from the database when it loads, and the events
 * only carry it forward from there.
 */

import type { ComicDownloadState } from '@shelvarr/types';
import type { TaskStatus, TaskType } from '../queue/index';

/** Something happened to a background task. */
export interface TaskEvent {
  kind: 'task';
  /**
   * `progress` is the only one that fires repeatedly for the same task, and is
   * the only one a page can apply without re-rendering: everything else
   * changes which list the task belongs in, so the page has to go back to the
   * server for it.
   */
  event: 'created' | 'started' | 'progress' | 'completed' | 'failed' | 'cancelled' | 'deferred';
  id: number;
  taskType: TaskType;
  status: TaskStatus;
  progress: number;
  total: number | null;
  error?: string | null;
}

/** Something happened to a comic download. */
export interface DownloadEvent {
  kind: 'download';
  /** `removed` is the one where the row is gone and the page must drop it. */
  event: 'progress' | 'state' | 'removed';
  id: number;
  volumeId: number | null;
  state: ComicDownloadState;
  progress: number;
  size: number | null;
  error?: string | null;
}

export type LiveEvent = TaskEvent | DownloadEvent;

export type LiveEventListener = (event: LiveEvent) => void;

/**
 * How long a `progress` event is held back so later ones can overwrite it.
 *
 * A file download reports progress per chunk — thousands of times for a large
 * file — and every one of those would otherwise become a network write per
 * open tab. Holding the newest for a moment turns that back into a readable
 * couple of updates a second, which is as fast as a progress bar can be read
 * anyway.
 */
const PROGRESS_COALESCE_MS = 400;

interface Bus {
  listeners: Set<LiveEventListener>;
  /** The newest un-sent `progress` event per subject, keyed by kind and id. */
  pending: Map<string, LiveEvent>;
  flushTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * Held on `globalThis` rather than in a module variable. Next.js can evaluate
 * the same module more than once — across the dev server's hot reloads, and
 * across its separate server bundles — and a second copy of this module would
 * mean the queue publishing into a bus that the SSE route is not listening to.
 */
const BUS_KEY = Symbol.for('shelvarr.events.bus');

type BusHolder = { [BUS_KEY]?: Bus };

function bus(): Bus {
  const holder = globalThis as BusHolder;
  if (!holder[BUS_KEY]) {
    holder[BUS_KEY] = { listeners: new Set(), pending: new Map(), flushTimer: null };
  }
  return holder[BUS_KEY];
}

function subjectKey(event: LiveEvent): string {
  return `${event.kind}:${event.id}`;
}

function deliver(event: LiveEvent): void {
  for (const listener of bus().listeners) {
    try {
      listener(event);
    } catch {
      // One broken subscriber must not stop the others from being told, and
      // must not fail the background job that published the event.
    }
  }
}

function flushPending(): void {
  const b = bus();
  b.flushTimer = null;
  if (b.pending.size === 0) return;

  const events = [...b.pending.values()];
  b.pending.clear();
  for (const event of events) deliver(event);
}

/**
 * Announce a change. Safe to call from anywhere, including a task handler mid
 * download: it never throws and never blocks on a subscriber.
 */
export function publish(event: LiveEvent): void {
  const b = bus();
  if (b.listeners.size === 0) {
    // Nobody is watching. Drop anything held for later too, so a long stretch
    // with no open tabs cannot leave a stale event to be delivered to the next
    // one that connects.
    b.pending.clear();
    return;
  }

  const key = subjectKey(event);

  if (event.event === 'progress') {
    b.pending.set(key, event);
    if (!b.flushTimer) {
      b.flushTimer = setTimeout(flushPending, PROGRESS_COALESCE_MS);
      // Only Node's timers can be unreferenced, and the web tsconfig types
      // these as DOM numbers; the bus must never be the reason the process
      // stays alive, so ask for it where it exists.
      (b.flushTimer as { unref?: () => void }).unref?.();
    }
    return;
  }

  // A status change supersedes any progress still waiting for this subject —
  // it carries the final numbers, and letting the stale one out afterwards
  // would redraw a finished task as if it were still running.
  b.pending.delete(key);
  deliver(event);
}

/** Listen for changes. Call the returned function to stop. */
export function subscribe(listener: LiveEventListener): () => void {
  const b = bus();
  b.listeners.add(listener);

  return () => {
    b.listeners.delete(listener);
    if (b.listeners.size === 0 && b.flushTimer) {
      clearTimeout(b.flushTimer);
      b.flushTimer = null;
      b.pending.clear();
    }
  };
}

/** How many listeners are attached. Exposed for diagnostics and tests. */
export function listenerCount(): number {
  return bus().listeners.size;
}
