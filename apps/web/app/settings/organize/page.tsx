import { getOrganizeSettings } from '@/lib/actions/settings';
import { OrganizeTab } from '@/components/settings/OrganizeTab';

export const dynamic = 'force-dynamic';

export default async function OrganizeSettingsPage() {
  const settings = await getOrganizeSettings();
  return <OrganizeTab settings={settings} />;
}
