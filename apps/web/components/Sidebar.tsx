'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebar } from './SidebarContext';
import type { SidebarCounts } from '@/lib/actions/stats';
import { APP_VERSION, BUILD_VERSION } from '@/lib/constants';
import { BookIcon, AuthorIcon, SeriesIcon } from '@/components/ui/Icons';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  countKey?: keyof SidebarCounts;
  countColor?: 'blue' | 'orange';
}

const navItems: NavItem[] = [
  { href: '/', label: 'Home', icon: HomeIcon },
  { href: '/libraries', label: 'Libraries', icon: FolderIcon },
  { href: '/books', label: 'Books', icon: BookIcon, countKey: 'books', countColor: 'blue' },
  { href: '/comics', label: 'Comics', icon: ComicIcon },
  { href: '/unmatched', label: 'Unmatched', icon: UnmatchedIcon, countKey: 'unmatched', countColor: 'orange' },
  { href: '/wanted', label: 'Wanted', icon: WantedIcon },
  { href: '/series', label: 'Series', icon: SeriesIcon },
  { href: '/authors', label: 'Authors', icon: AuthorIcon },
  { href: '/tasks', label: 'Tasks', icon: QueueIcon },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
];

interface SidebarProps {
  counts?: SidebarCounts;
}

export function Sidebar({ counts }: SidebarProps) {
  const pathname = usePathname();
  const { isCollapsed, isMobileOpen, toggleCollapsed, closeMobile } = useSidebar();

  const handleNavClick = () => {
    // Close mobile sidebar on navigation
    closeMobile();
  };

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:relative z-50 lg:z-auto
          left-0 top-0 h-full
          bg-shelvarr-surface border-r border-shelvarr-border
          flex flex-col
          transition-all duration-300 ease-in-out
          ${isCollapsed ? 'w-16' : 'w-64'}
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Header with toggle button */}
        <div className={`p-4 border-b border-shelvarr-border flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!isCollapsed && (
            <div>
              <h1 className="text-xl font-bold text-shelvarr-primary">Shelvarr</h1>
              <p className="text-xs text-shelvarr-text-muted mt-1">Book & Comic Manager</p>
            </div>
          )}
          <button
            onClick={toggleCollapsed}
            className="p-2 rounded-lg text-shelvarr-text-muted hover:text-shelvarr-text hover:bg-shelvarr-bg transition-colors"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <MenuIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 overflow-y-auto">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== '/' && pathname.startsWith(item.href));
              const count = item.countKey && counts ? counts[item.countKey] : undefined;

              return (
                <li key={item.href} className="relative">
                  <Link
                    href={item.href}
                    onClick={handleNavClick}
                    className={`
                      flex items-center rounded-lg transition-colors
                      ${isCollapsed ? 'justify-center px-2 py-3' : 'justify-between px-3 py-2'}
                      ${isActive
                        ? 'bg-shelvarr-primary text-white'
                        : 'text-shelvarr-text-muted hover:text-shelvarr-text hover:bg-shelvarr-bg'
                      }
                    `}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <div className={`flex items-center ${isCollapsed ? '' : 'gap-3'}`}>
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      {!isCollapsed && <span>{item.label}</span>}
                    </div>
                    {!isCollapsed && count !== undefined && count > 0 && (
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : item.countColor === 'orange'
                              ? 'bg-orange-500/20 text-orange-400'
                              : 'bg-blue-500/20 text-blue-400'
                        }`}
                      >
                        {count}
                      </span>
                    )}
                    {/* Show count as dot when collapsed */}
                    {isCollapsed && count !== undefined && count > 0 && (
                      <span
                        className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
                          item.countColor === 'orange' ? 'bg-orange-400' : 'bg-blue-400'
                        }`}
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className={`p-4 border-t border-shelvarr-border ${isCollapsed ? 'text-center' : ''}`}>
          <p className="text-xs text-shelvarr-text-muted">
            {isCollapsed ? `v${APP_VERSION.split('.')[0]}` : `v${APP_VERSION}`}
          </p>
          {!isCollapsed && (
            <p className="text-[10px] text-shelvarr-text-muted/70 mt-0.5 font-mono">
              build {BUILD_VERSION}
            </p>
          )}
        </div>
      </aside>
    </>
  );
}

// Mobile menu toggle button - to be placed in the main content area
export function MobileMenuButton() {
  const { openMobile } = useSidebar();

  return (
    <button
      onClick={openMobile}
      className="lg:hidden fixed top-4 left-4 z-30 p-2 rounded-lg bg-shelvarr-surface border border-shelvarr-border text-shelvarr-text-muted hover:text-shelvarr-text hover:bg-shelvarr-surface-light transition-colors"
      aria-label="Open menu"
    >
      <MenuIcon className="w-6 h-6" />
    </button>
  );
}

// Icons
function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  );
}


function QueueIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function WantedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  );
}

function UnmatchedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ComicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h6a4 4 0 014 4v12a3 3 0 00-3-3H4V4z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 4h-6a4 4 0 00-4 4v12a3 3 0 013-3h7V4z" />
    </svg>
  );
}
