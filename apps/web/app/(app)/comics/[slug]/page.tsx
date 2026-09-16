import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getComic, getComicProgress, isComicRead, resolveComicRef } from '@/lib/actions/comics';
import { ComicIssueRow } from '@/components/comics/ComicIssueRow';
import { VolumeActions } from '@/components/comics/VolumeActions';
import { BookCover } from '@/components/ui/BookCover';
import { CheckIcon } from '@/components/ui/Icons';
import { LiveRefresh } from '@/components/live/LiveRefresh';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ComicDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const ref = decodeURIComponent(slug);

  const resolved = await resolveComicRef(ref);
  if (!resolved) notFound();
  // A bare id, or a stale slug: send the reader to the volume's real URL.
  if (resolved.slug !== ref) redirect(`/comics/${resolved.slug}`);

  const volumeId = resolved.id;
  const [result, progressRows, read] = await Promise.all([
    getComic(volumeId),
    getComicProgress(volumeId),
    isComicRead(volumeId),
  ]);
  const progressByIssue = new Map(progressRows.map((p) => [p.issueId, p]));

  if (!result.volume) notFound();

  const { volume, coverUrl } = result;
  const subtitle = [volume.publisher, volume.year].filter(Boolean).join(' · ');

  return (
    <div className="space-y-6">
      {/* This is the page someone sits on while a volume fills up, so it
          follows downloads as well as the tasks behind them: an issue turns
          from wanted to owned here without a reload. */}
      <LiveRefresh
        downloads
        taskTypes={[
          'comic_search',
          'comic_download',
          'comic_refresh',
          'comic_scan',
          'comic_rename',
        ]}
      />
      <Link href="/comics" className="text-shelvarr-text-muted hover:text-white text-sm inline-block">
        ← Back to Comics
      </Link>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="md:w-64 flex-shrink-0">
          <BookCover variant="comic" src={coverUrl} title={volume.title} author={subtitle} />
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
            {read && (
              <span className="bg-green-600 text-white rounded px-3 py-1 flex items-center gap-1.5">
                <CheckIcon className="w-3.5 h-3.5" />
                Read
              </span>
            )}
            {volume.monitored && (
              <span className="bg-green-600/20 text-green-400 border border-green-500/40 rounded px-3 py-1">
                Monitored
              </span>
            )}
            {volume.volume_number > 0 && (
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

          {/* Library jobs only apply to volumes Shelvarr owns. Anything else
              is a leftover mirror waiting to be migrated. */}
          {result.managed ? (
            <VolumeActions volumeId={volumeId} />
          ) : (
            <p className="text-xs text-shelvarr-text-muted">
              This volume has not been migrated yet, so Shelvarr cannot manage it. Migrate it
              under{' '}
              <Link href="/settings/comics" className="text-shelvarr-primary hover:underline">
                Settings → Comics
              </Link>
              .
            </p>
          )}
        </div>
      </div>

      {volume.issues.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Issues</h2>
          <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg divide-y divide-shelvarr-border">
            {volume.issues.map((issue) => (
              <ComicIssueRow
                key={issue.id}
                issue={issue}
                volumeTitle={volume.title}
                progress={progressByIssue.get(issue.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
