'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import type { User } from '@shelvarr/types';
import { signOut, signOutEverywhere } from '@/lib/actions/auth';

function initials(user: User): string {
  const source = user.name?.trim() || user.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0]?.toUpperCase() ?? '');
}

export function AccountMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative flex-shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        className="w-9 h-9 rounded-full bg-shelvarr-primary text-white text-sm font-semibold flex items-center justify-center hover:opacity-90 transition-opacity"
      >
        {initials(user)}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-60 rounded-lg bg-shelvarr-surface border border-shelvarr-border shadow-xl py-2 z-50"
        >
          <div className="px-4 py-2 border-b border-shelvarr-border">
            {user.name && <p className="text-sm text-white truncate">{user.name}</p>}
            <p className="text-xs text-shelvarr-text-muted truncate">{user.email}</p>
            {user.role === 'admin' && (
              <span className="inline-block mt-1 text-[10px] uppercase tracking-wide text-blue-400">
                Admin
              </span>
            )}
          </div>

          {user.role === 'admin' && (
            <Link
              href="/settings/users"
              onClick={() => setOpen(false)}
              role="menuitem"
              className="block px-4 py-2 text-sm text-shelvarr-text-muted hover:text-white hover:bg-shelvarr-bg transition-colors"
            >
              Manage users
            </Link>
          )}

          <button
            type="button"
            role="menuitem"
            disabled={pending}
            onClick={() => startTransition(() => signOut())}
            className="w-full text-left px-4 py-2 text-sm text-shelvarr-text-muted hover:text-white hover:bg-shelvarr-bg transition-colors disabled:opacity-50"
          >
            {pending ? 'Signing out…' : 'Sign out'}
          </button>

          <button
            type="button"
            role="menuitem"
            disabled={pending}
            onClick={() => startTransition(() => signOutEverywhere())}
            title="Ends your session on every device, including phones"
            className="w-full text-left px-4 py-2 text-sm text-shelvarr-text-muted hover:text-white hover:bg-shelvarr-bg transition-colors disabled:opacity-50"
          >
            Sign out everywhere
          </button>
        </div>
      )}
    </div>
  );
}
