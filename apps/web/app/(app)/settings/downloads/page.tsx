import {
  getDownloadConfigs,
  getDownloadSourceStatuses,
  getSourceMirrorList,
} from '@/lib/actions/downloads';
import { DownloadSourcesTab } from '@/components/settings/DownloadSourcesTab';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Download Sources · Settings' };

export default async function DownloadSettingsPage() {
  const [downloadConfigs, downloadStatuses, mirrors] = await Promise.all([
    getDownloadConfigs(),
    getDownloadSourceStatuses(),
    getSourceMirrorList(),
  ]);

  return (
    <DownloadSourcesTab
      configs={downloadConfigs}
      statuses={downloadStatuses}
      mirrors={mirrors}
    />
  );
}
