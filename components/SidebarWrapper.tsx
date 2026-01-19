import { getSidebarCounts } from '@/lib/actions/stats';
import { Sidebar } from './Sidebar';

export async function SidebarWrapper() {
  const counts = await getSidebarCounts();

  return <Sidebar counts={counts} />;
}
