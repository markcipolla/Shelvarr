'use client';

import { Sidebar, MobileMenuButton } from './Sidebar';
import { SidebarProvider } from './SidebarContext';
import type { SidebarCounts } from '@/lib/actions/stats';

interface SidebarClientProps {
  counts?: SidebarCounts;
}

export function SidebarClient({ counts }: SidebarClientProps) {
  return (
    <SidebarProvider>
      <Sidebar counts={counts} />
      <MobileMenuButton />
    </SidebarProvider>
  );
}
