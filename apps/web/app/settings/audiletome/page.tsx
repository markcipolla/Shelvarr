import { getAudiletomeSettings } from '@/lib/actions/settings';
import { AudiletomeTab } from '@/components/settings/AudiletomeTab';

export const dynamic = 'force-dynamic';

export default async function AudiletomeSettingsPage() {
  const audiletome = await getAudiletomeSettings();
  return <AudiletomeTab settings={audiletome} />;
}
