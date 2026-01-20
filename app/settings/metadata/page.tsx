import { getSourcesStatus } from '@/lib/actions/settings';
import { MetadataSourcesTab } from '@/components/settings/MetadataSourcesTab';

export const dynamic = 'force-dynamic';

export default async function MetadataSettingsPage() {
  const sources = await getSourcesStatus();

  return <MetadataSourcesTab sources={sources} />;
}
