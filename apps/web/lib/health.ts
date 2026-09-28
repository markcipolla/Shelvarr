import { queryOne } from '@/lib/db';

/**
 * Is this process ready to serve?
 *
 * One trivial read against the open database. It is what `/up` and
 * `/api/health` both answer with, and what a deploy waits on: Docker starts
 * the new container alongside the old one and only moves traffic across once
 * this is true, so "ready" has to mean the mount is there, the file opened and
 * the schema ran — not merely that a process is listening.
 *
 * Cheap enough to run every 30 seconds forever. Never throws; the reason for a
 * false goes to the log, because both callers are public and neither should
 * hand a stranger a stack trace.
 */
export function isReady(): boolean {
  try {
    queryOne('SELECT 1 AS ok');
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[health] database probe failed: ${message}`);
    return false;
  }
}
