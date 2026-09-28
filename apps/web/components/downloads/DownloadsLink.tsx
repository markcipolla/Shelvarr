import Link from 'next/link';

interface DownloadsLinkProps {
  href: string;
  /** Downloads queued or running. Shown as a badge, and pulses while non-zero. */
  active: number;
}

/**
 * The Downloads link in a library index header, badged with what is in flight
 * so a browsing person can see work is happening without opening the queue.
 */
export function DownloadsLink({ href, active }: DownloadsLinkProps) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 text-sm rounded-lg border border-shelvarr-border text-white hover:border-blue-500 inline-flex items-center gap-2"
    >
      Downloads
      {active > 0 && (
        <span className="bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full animate-pulse">
          {active}
          <span className="sr-only"> in flight</span>
        </span>
      )}
    </Link>
  );
}
