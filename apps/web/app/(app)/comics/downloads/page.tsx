import Link from 'next/link';
import { getComicDownloadQueue } from '@/lib/actions/comics';
import { DownloadQueue } from '@/components/comics/DownloadQueue';

export const dynamic = 'force-dynamic';

export default async function ComicDownloadsPage() {
  const data = await getComicDownloadQueue();

  return (
    <div className="space-y-6">
      <Link href="/comics" className="text-shelvarr-text-muted hover:text-white text-sm inline-block">
        ← Back to Comics
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-white">Downloads</h1>
        <p className="text-shelvarr-text-muted mt-1">
          Comic downloads in flight, what has finished, and links that failed.
        </p>
      </div>

      <DownloadQueue data={data} />
    </div>
  );
}
