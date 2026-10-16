import { getComicVineDateType, getSourcesStatus } from '@/lib/actions/settings';
import { MetadataSourcesTab } from '@/components/settings/MetadataSourcesTab';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Metadata Sources · Settings' };

export default async function MetadataSettingsPage() {
  const [sources, comicVineDateType] = await Promise.all([
    getSourcesStatus(),
    getComicVineDateType(),
  ]);

  return <MetadataSourcesTab sources={sources} comicVineDateType={comicVineDateType} />;
}
