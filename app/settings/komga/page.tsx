import { getKomgaSettings } from '@/lib/actions/settings';
import { KomgaTab } from '@/components/settings/KomgaTab';

export const dynamic = 'force-dynamic';

export default async function KomgaSettingsPage() {
  const komga = await getKomgaSettings();

  return <KomgaTab settings={komga} />;
}
