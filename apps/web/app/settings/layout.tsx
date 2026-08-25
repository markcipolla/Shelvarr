'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const tabs = [
    { href: '/settings/metadata', label: 'Metadata Sources' },
    { href: '/settings/downloads', label: 'Download Sources' },
    { href: '/settings/organize', label: 'Organize' },
    { href: '/settings/comics', label: 'Comics' },
    { href: '/settings/komga', label: 'Komga' },
    { href: '/settings/audiletome', label: 'Audiletome' },
    { href: '/settings/about', label: 'About' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-shelvarr-text-muted mt-1">
          Configure metadata sources and integrations
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-shelvarr-border">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-2 -mb-px text-sm font-medium transition-colors ${
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

      <div className="py-6">
        {children}
      </div>
    </div>
  );
}
