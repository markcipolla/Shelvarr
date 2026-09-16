'use client';

import { useLiveConnection } from './LiveEvents';

/**
 * Says whether this page is being kept up to date.
 *
 * Worth showing on the tasks page in particular: it is the page people watch
 * while something runs, and a queue that has genuinely gone quiet looks
 * exactly like a stream that has dropped. The dot tells the two apart.
 */
export function LiveIndicator() {
  const connected = useLiveConnection();

  return (
    <span
      className="flex items-center gap-1.5 text-xs text-shelvarr-text-muted"
      title={
        connected
          ? 'Updating as tasks change'
          : 'Not connected — reload to see the latest'
      }
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          connected ? 'bg-green-500' : 'bg-shelvarr-text-muted'
        }`}
      />
      {connected ? 'Live' : 'Offline'}
    </span>
  );
}
