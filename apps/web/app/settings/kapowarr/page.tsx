import { getKapowarrSettings } from '@/lib/actions/settings';
import { KapowarrTab } from '@/components/settings/KapowarrTab';

export const dynamic = 'force-dynamic';

export default async function KapowarrSettingsPage() {
  const kapowarr = await getKapowarrSettings();

  return <KapowarrTab settings={kapowarr} />;
}
