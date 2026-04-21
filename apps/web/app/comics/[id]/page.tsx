import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getComic } from '@/lib/actions/comics';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ComicDetailPage({ params }: PageProps) {
  const { id } = await params;
  const volumeId = parseInt(id, 10);
  if (!Number.isFinite(volumeId)) notFound();

  const result = await getComic(volumeId);

  if (!result.configured) {
    return (
      <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center">
        <p className="text-shelvarr-text-muted">
          Kapowarr is not configured.{' '}
          <Link href="/settings/kapowarr" className="text-shelvarr-primary hover:underline">
            Configure Kapowarr
          </Link>
        </p>
      </div>
    );
  }

  if (result.error || !result.volume) {
    return (
      <div className="space-y-4">
        <Link href="/comics" className="text-shelvarr-text-muted hover:text-white text-sm">
          ← Back to Comics
        </Link>
        <div className="bg-red-600/20 text-red-400 border border-red-500/40 rounded-lg p-4">
          {result.error || 'Comic not found'}
        </div>
      </div>
    );
  }

  const { volume, coverUrl } = result;
  const subtitle = [volume.publisher, volume.year].filter(Boolean).join(' · ');

  return (
    <div className="space-y-6">
      <Link href="/comics" className="text-shelvarr-text-muted hover:text-white text-sm inline-block">
        ← Back to Comics
      </Link>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="md:w-64 flex-shrink-0">
          <div className="aspect-[2/3] bg-shelvarr-surface border border-shelvarr-border rounded-lg overflow-hidden">
            {coverUrl && (
              <img src={coverUrl} alt={volume.title} className="w-full h-full object-cover" />
            )}
          </div>
        </div>

        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{volume.title}</h1>
            {subtitle && <p className="text-shelvarr-text-muted mt-1">{subtitle}</p>}
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <span className="bg-shelvarr-surface border border-shelvarr-border rounded px-3 py-1 text-shelvarr-text-muted">
              {volume.issues_downloaded}/{volume.issue_count} issues
            </span>
            {volume.monitored && (
              <span className="bg-green-600/20 text-green-400 border border-green-500/40 rounded px-3 py-1">
                Monitored
              </span>
            )}
            {volume.volume_number !== null && volume.volume_number !== undefined && (
              <span className="bg-shelvarr-surface border border-shelvarr-border rounded px-3 py-1 text-shelvarr-text-muted">
                Volume {volume.volume_number}
              </span>
            )}
          </div>

          {volume.description && (
            <div
              className="text-shelvarr-text-muted prose prose-invert prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: volume.description }}
            />
          )}
        </div>
      </div>

      {volume.issues && volume.issues.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Issues</h2>
          <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg divide-y divide-shelvarr-border">
            {volume.issues.map((issue) => (
              <div key={issue.id} className="flex items-center justify-between p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-shelvarr-text-muted text-sm font-mono w-10 flex-shrink-0">
                      #{issue.issue_number ?? '?'}
                    </span>
                    <span className="text-white truncate">
                      {issue.title || 'Untitled'}
                    </span>
                  </div>
                  {issue.date && (
                    <p className="text-xs text-shelvarr-text-muted mt-1 ml-13 pl-13" style={{ paddingLeft: '3.25rem' }}>
                      {issue.date}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {issue.files && issue.files.length > 0 ? (
                    <span className="bg-green-600/20 text-green-400 px-2 py-1 rounded">
                      Downloaded
                    </span>
                  ) : (
                    <span className="bg-shelvarr-bg text-shelvarr-text-muted px-2 py-1 rounded">
                      Missing
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
