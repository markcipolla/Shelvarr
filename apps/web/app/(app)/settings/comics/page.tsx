import { getComicsSettings, getSchedules } from '@/lib/actions/settings';
import { ComicsTab } from '@/components/settings/ComicsTab';

export const dynamic = 'force-dynamic';

export default async function ComicsSettingsPage() {
  const [settings, schedules] = await Promise.all([
    getComicsSettings(),
    getSchedules('comics'),
  ]);

  return <ComicsTab settings={settings} schedules={schedules} />;
}
