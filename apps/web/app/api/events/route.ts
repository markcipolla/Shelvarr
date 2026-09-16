import type { NextRequest } from 'next/server';
import '@/lib/config';
import { events, type LiveEvent } from '@shelvarr/services';
import { requireSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
/** Holds a response open for as long as the tab is; not something the edge can do. */
export const runtime = 'nodejs';

/**
 * How often a comment line is written down an idle stream.
 *
 * A Shelvarr server that is doing nothing publishes nothing, and a reverse
 * proxy in front of it will eventually close a connection that has gone quiet.
 * The comment is ignored by EventSource and is only there to keep the
 * connection demonstrably alive.
 */
const HEARTBEAT_MS = 25_000;

/**
 * The live event stream.
 *
 * Pages subscribe to this once and are told when a background task moves or a
 * download progresses, so they can redraw the row that changed rather than
 * polling for the whole list. Nothing here is fetched on demand — the response
 * is opened and then written to as things happen.
 */
export async function GET(request: NextRequest) {
  // Cookie authentication rather than an API key: EventSource cannot set
  // headers, and this is only ever opened by a page the browser already
  // rendered for a signed-in person.
  const unauthorised = await requireSessionUser();
  if (unauthorised) return unauthorised;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // The client went away between the abort firing and us noticing.
          closed = true;
        }
      };

      const unsubscribe = events.subscribe((event: LiveEvent) => {
        write(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
      });

      const heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };

      request.signal.addEventListener('abort', close);

      // An immediate write so the browser treats the connection as open, and
      // so any proxy buffering shows up now rather than the first time
      // something interesting happens.
      write(': connected\n\n');
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // `no-transform` matters as much as `no-cache`: a proxy that gzips this
      // will buffer it, and a buffered event stream arrives all at once at the
      // end, which is the same as not having one.
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
