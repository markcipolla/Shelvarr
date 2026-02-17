import Link from 'next/link';

interface HardcoverNotConfiguredProps {
  description: string;
  onLinkClick?: () => void;
}

export function HardcoverNotConfigured({ description, onLinkClick }: HardcoverNotConfiguredProps) {
  return (
    <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <p className="text-yellow-500 font-medium">Hardcover API key not configured</p>
          <p className="text-sm text-shelvarr-text-muted mt-1">{description}</p>
          <Link
            href="/settings"
            className="inline-block mt-2 text-sm text-blue-400 hover:text-blue-300"
            onClick={onLinkClick}
          >
            Go to Settings →
          </Link>
        </div>
      </div>
    </div>
  );
}
