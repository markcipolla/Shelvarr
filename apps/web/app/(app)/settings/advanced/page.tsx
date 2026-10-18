import { auth } from '@shelvarr/services';
import '@/lib/config';
import { requireAdmin } from '@/lib/auth';
import { getAdminApiSettings, getLogTail } from '@/lib/actions/admin';
import { getBackupSettings, listBackups } from '@/lib/actions/backup';
import { getSchedules } from '@/lib/actions/settings';
import { AdvancedTab } from '@/components/settings/AdvancedTab';
import { BackupSettings } from '@/components/settings/BackupSettings';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Advanced · Settings' };

export default async function AdvancedSettingsPage() {
  // No-op when authentication is switched off, which is the same "trusted
  // network" allowance the rest of the app makes.
  if (auth.isAuthEnabled()) await requireAdmin();

  const [settings, logs, backupSettings, backups, schedules] = await Promise.all([
    getAdminApiSettings(),
    getLogTail({ limit: 200 }),
    getBackupSettings(),
    listBackups(),
    getSchedules('system'),
  ]);

  return (
    <div className="space-y-10">
      <BackupSettings
        settings={backupSettings}
        backups={backups}
        schedule={schedules.find((schedule) => schedule.name === 'backup') ?? null}
      />
      <AdvancedTab settings={settings} initialLogs={logs} />
    </div>
  );
}
