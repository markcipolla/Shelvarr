import { getKokoroSettings } from '@/lib/actions/settings';
import { KokoroTab } from '@/components/settings/KokoroTab';

export const dynamic = 'force-dynamic';

export default async function NarrationSettingsPage() {
  const kokoro = await getKokoroSettings();

  return <KokoroTab settings={kokoro} />;
}
