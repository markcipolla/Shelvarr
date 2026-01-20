'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AddWantedBookButton } from '@/components/wanted/AddWantedBookButton';

export default function WantedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const tabs = [
    { href: '/wanted/list', label: 'Wanted' },
    { href: '/wanted/acquired', label: 'Acquired' },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Wanted Books</h1>
          <p className="text-shelvarr-text-muted mt-1">
            Track books you want to acquire
          </p>
        </div>
        <AddWantedBookButton />
      </div>

      {/* Tabs */}
      <div className="border-b border-shelvarr-border mb-6">
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

      {children}
    </div>
  );
}
