import { getSidebarCounts } from '@/lib/actions/stats';
import { SidebarClient } from './SidebarClient';

export async function SidebarWrapper() {
  const counts = await getSidebarCounts();

  return <SidebarClient counts={counts} />;
}
