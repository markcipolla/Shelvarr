import {
  getAdoptionCandidates,
  getComicsSettings,
  getSchedules,
} from '@/lib/actions/settings';
import { ComicsTab } from '@/components/settings/ComicsTab';

export const dynamic = 'force-dynamic';

export default async function ComicsSettingsPage() {
  const [settings, schedules, adoptionCandidates] = await Promise.all([
    getComicsSettings(),
    getSchedules(),
    getAdoptionCandidates(),
  ]);

  return (
    <ComicsTab
      settings={settings}
      schedules={schedules}
      adoptionCandidates={adoptionCandidates}
    />
  );
}
