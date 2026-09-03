import { getOrganizeSettings, getSchedules } from '@/lib/actions/settings';
import { OrganizeTab } from '@/components/settings/OrganizeTab';

export const dynamic = 'force-dynamic';

export default async function OrganizeSettingsPage() {
  const [settings, schedules] = await Promise.all([
    getOrganizeSettings(),
    getSchedules('books'),
  ]);

  return <OrganizeTab settings={settings} schedules={schedules} />;
}
