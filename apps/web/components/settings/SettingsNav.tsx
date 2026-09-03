'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface SettingsNavTab {
  href: string;
  label: string;
}

export function SettingsNav({ tabs }: { tabs: SettingsNavTab[] }) {
  const pathname = usePathname();

  return (
    <div className="border-b border-shelvarr-border">
      <nav className="flex gap-4 overflow-x-auto">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2 -mb-px text-sm font-medium whitespace-nowrap transition-colors ${
              pathname === tab.href
                ? 'text-white border-b-2 border-blue-500'
                : 'text-shelvarr-text-muted hover:text-white'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
