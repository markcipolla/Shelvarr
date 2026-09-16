'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import type { LiveEvent } from '@shelvarr/services';

/**
 * One event stream for the whole signed-in app.
 *
 * Every page that wants live updates subscribes through this rather than
 * opening its own connection: browsers cap how many connections they will hold
 * to one origin, and a handful of pages each with their own stream would use
 * them all up on a server that is mostly idle.
 */

type Handler = (event: LiveEvent) => void;

interface LiveEventsValue {
  subscribe: (handler: Handler) => () => void;
  /** Whether the stream is currently open, for the small status dot. */
  connected: boolean;
}

const LiveEventsContext = createContext<LiveEventsValue | null>(null);

/** Longest gap between reconnection attempts once a server stays unreachable. */
const MAX_RETRY_MS = 30_000;

export function LiveEventsProvider({ children }: { children: React.ReactNode }) {
  const handlers = useRef<Set<Handler>>(new Set());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryMs = 1_000;
    let stopped = false;

    const fanOut = (raw: string) => {
      let event: LiveEvent;
      try {
        event = JSON.parse(raw) as LiveEvent;
      } catch {
        return;
      }
      // Copied first: a handler is allowed to unsubscribe itself, which would
      // otherwise be a mutation of the set being iterated.
      for (const handler of [...handlers.current]) {
        try {
          handler(event);
        } catch {
          // A page that throws on an event must not stop the other pages'
          // handlers, nor tear down the connection.
        }
      }
    };

    const connect = () => {
      if (stopped) return;

      source = new EventSource('/api/events');

      source.onopen = () => {
        retryMs = 1_000;
        setConnected(true);
      };

      for (const kind of ['task', 'download'] as const) {
        source.addEventListener(kind, (e) => fanOut((e as MessageEvent).data));
      }

      source.onerror = () => {
        setConnected(false);
        // EventSource retries by itself, but not after the server answers an
        // error status — which is what a signed-out tab gets. Reconnecting by
        // hand covers both, with a backoff so a server that is down or a
        // session that has expired is not hammered.
        source?.close();
        source = null;
        if (stopped) return;
        retryTimer = setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, []);

  const subscribe = useCallback((handler: Handler) => {
    handlers.current.add(handler);
    return () => {
      handlers.current.delete(handler);
    };
  }, []);

  const value = useMemo(() => ({ subscribe, connected }), [subscribe, connected]);

  return (
    <LiveEventsContext.Provider value={value}>{children}</LiveEventsContext.Provider>
  );
}

/**
 * Run `handler` for every live event.
 *
 * The handler is held in a ref so a page can write it inline without
 * re-subscribing on every render.
 */
export function useLiveEvents(handler: Handler): void {
  const context = useContext(LiveEventsContext);
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (!context) return;
    return context.subscribe((event) => latest.current(event));
  }, [context]);
}

/** Whether the live stream is currently connected. */
export function useLiveConnection(): boolean {
  return useContext(LiveEventsContext)?.connected ?? false;
}

/** How long matching events are gathered before the page is re-fetched. */
const REFRESH_DEBOUNCE_MS = 500;

/**
 * Re-render this page from the server whenever a matching event arrives.
 *
 * `router.refresh()` re-fetches the server components and patches the result
 * into the page, so what is on screen is whatever the page would render now —
 * no list-merging logic per page, and open menus and scroll position survive.
 *
 * Two things stop that being expensive. Matching events are gathered for a
 * moment first, so a scan finishing fifty tasks at once costs one re-render.
 * And a tab that is not being looked at does not re-render at all; it notes
 * that it is behind and catches up when it is shown again.
 */
export function useLiveRefresh(matches: (event: LiveEvent) => boolean): void {
  const router = useRouter();
  const match = useRef(matches);
  match.current = matches;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const missed = useRef(false);

  useLiveEvents((event) => {
    if (!match.current(event)) return;

    if (typeof document !== 'undefined' && document.hidden) {
      missed.current = true;
      return;
    }

    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      router.refresh();
    }, REFRESH_DEBOUNCE_MS);
  });

  useEffect(() => {
    const onVisible = () => {
      if (document.hidden || !missed.current) return;
      missed.current = false;
      router.refresh();
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router]);
}
