'use client';

interface SourceStatusBadgeProps {
  status: 'up' | 'down' | 'degraded' | 'unknown';
  name?: string;
  showLabel?: boolean;
}

export function SourceStatusBadge({ status, name, showLabel = false }: SourceStatusBadgeProps) {
  const statusColors = {
    up: 'bg-green-500',
    degraded: 'bg-yellow-500',
    down: 'bg-red-500',
    unknown: 'bg-gray-500',
  };

  const statusLabels = {
    up: 'Online',
    degraded: 'Slow',
    down: 'Offline',
    unknown: 'Unknown',
  };

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`w-2 h-2 rounded-full ${statusColors[status]}`}
        title={statusLabels[status]}
      />
      {showLabel && (
        <span className="text-xs text-shelvarr-text-muted">
          {name ? `${name}: ` : ''}{statusLabels[status]}
        </span>
      )}
    </div>
  );
}

interface SourceStatusBarProps {
  statuses: Array<{
    name: string;
    displayName: string;
    status: 'up' | 'down' | 'degraded' | 'unknown';
  }>;
}

export function SourceStatusBar({ statuses }: SourceStatusBarProps) {
  // Only show the main sources we care about
  const mainSources = ['zlibrary', 'annas', 'libgen'];
  const relevantStatuses = statuses.filter((s) => mainSources.includes(s.name));

  return (
    <div className="flex items-center gap-4 text-sm">
      <span className="text-shelvarr-text-muted">Sources:</span>
      {relevantStatuses.map((s) => (
        <div key={s.name} className="flex items-center gap-1.5">
          <SourceStatusBadge status={s.status} />
          <span className="text-shelvarr-text-muted">{s.displayName}</span>
        </div>
      ))}
    </div>
  );
}
