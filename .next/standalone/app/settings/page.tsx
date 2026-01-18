import { getSourcesStatus, getKomgaSettings } from '@/lib/actions/settings';
import { getDownloadConfigs, getDownloadSourceStatuses } from '@/lib/actions/downloads';
import { SettingsTabs } from '@/components/settings/SettingsTabs';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [sources, komga, downloadConfigs, downloadStatuses] = await Promise.all([
    getSourcesStatus(),
    getKomgaSettings(),
    getDownloadConfigs(),
    getDownloadSourceStatuses(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-shelvarr-text-muted mt-1">
          Configure metadata sources and integrations
        </p>
      </div>

      <SettingsTabs
        sources={sources}
        komga={komga}
        downloadConfigs={downloadConfigs}
        downloadStatuses={downloadStatuses}
      />
    </div>
  );
}
