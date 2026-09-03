import { auth } from '@shelvarr/services';
import '@/lib/config';
import { requireAdmin } from '@/lib/auth';
import { getAdminApiSettings, getLogTail } from '@/lib/actions/admin';
import { AdvancedTab } from '@/components/settings/AdvancedTab';

export const dynamic = 'force-dynamic';

export default async function AdvancedSettingsPage() {
  // No-op when authentication is switched off, which is the same "trusted
  // network" allowance the rest of the app makes.
  if (auth.isAuthEnabled()) await requireAdmin();

  const [settings, logs] = await Promise.all([getAdminApiSettings(), getLogTail({ limit: 200 })]);

  return <AdvancedTab settings={settings} initialLogs={logs} />;
}
