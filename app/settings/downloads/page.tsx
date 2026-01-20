import { getDownloadConfigs, getDownloadSourceStatuses } from '@/lib/actions/downloads';
import { DownloadSourcesTab } from '@/components/settings/DownloadSourcesTab';

export const dynamic = 'force-dynamic';

export default async function DownloadSettingsPage() {
  const [downloadConfigs, downloadStatuses] = await Promise.all([
    getDownloadConfigs(),
    getDownloadSourceStatuses(),
  ]);

  return <DownloadSourcesTab configs={downloadConfigs} statuses={downloadStatuses} />;
}
