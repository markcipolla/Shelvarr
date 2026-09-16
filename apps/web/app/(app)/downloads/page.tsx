import Link from 'next/link';
import { getBookDownloadQueue } from '@/lib/actions/downloads';
import { DownloadQueue } from '@/components/downloads/DownloadQueue';

export const dynamic = 'force-dynamic';

export default async function BookDownloadsPage() {
  const data = await getBookDownloadQueue();

  return (
    <div className="space-y-6">
      <Link href="/wanted" className="text-shelvarr-text-muted hover:text-white text-sm inline-block">
        ← Back to Wanted
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-white">Downloads</h1>
        <p className="text-shelvarr-text-muted mt-1">
          Book downloads in flight, what has finished, and links that failed.
        </p>
      </div>

      <DownloadQueue data={data} />
    </div>
  );
}
