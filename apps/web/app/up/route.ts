import { isReady } from '@/lib/health';

export const dynamic = 'force-dynamic';

/**
 * The liveness probe, at the address load balancers and uptime monitors guess
 * first — Rails puts its own at `/up`, and Dokploy's Swarm health check points
 * here. Plain text and a status code, nothing to parse.
 *
 * `/api/health` says the same thing in JSON for clients that want a body; this
 * is deliberately the terser one, outside `/api`, because it is not part of
 * the API. It is public for the same reason that one is: the container asks
 * before anyone has signed in, and the answer says nothing about the library.
 */
export async function GET() {
  const ready = isReady();

  return new Response(ready ? 'ok\n' : 'down\n', {
    status: ready ? 200 : 503,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
