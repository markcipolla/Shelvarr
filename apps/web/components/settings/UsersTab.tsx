'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { User, UserRole } from '@shelvarr/types';
import { useToast } from '@/components/ui/Toast';
import {
  changeUserRole,
  inviteUser,
  removeUser,
  resendInvite,
  setSelfSignup,
  testEmailSettings,
} from '@/lib/actions/auth';

interface UsersTabProps {
  users: User[];
  currentUserId: number | null;
  allowSignup: boolean;
  emailConfigured: boolean;
  sessionCounts: Record<number, number>;
}

export function UsersTab({
  users,
  currentUserId,
  allowSignup,
  emailConfigured,
  sessionCounts,
}: UsersTabProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('user');
  const [signup, setSignup] = useState(allowSignup);
  // Shown when mail is unconfigured and the admin has to pass a link on by hand.
  const [manualLink, setManualLink] = useState<string | null>(null);

  const run = (action: () => Promise<{ ok: boolean; message?: string; link?: string }>) => {
    startTransition(async () => {
      const result = await action();
      if (result.message) {
        if (result.ok) toast.success(result.message);
        else toast.error(result.message);
      }
      setManualLink(result.link ?? null);
      if (result.ok) router.refresh();
    });
  };

  const handleInvite = (event: React.FormEvent) => {
    event.preventDefault();
    const formData = new FormData();
    formData.set('email', email);
    formData.set('name', name);
    formData.set('role', role);
    run(async () => {
      const result = await inviteUser(formData);
      if (result.ok) {
        setEmail('');
        setName('');
        setRole('user');
      }
      return result;
    });
  };

  const handleRemove = (user: User) => {
    if (!confirm(`Remove ${user.email}? Their sessions end immediately.`)) return;
    run(() => removeUser(user.id));
  };

  const handleSignupToggle = (value: boolean) => {
    setSignup(value);
    run(() => setSelfSignup(value));
  };

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-white">User accounts</h2>
        <p className="text-sm text-shelvarr-text-muted mt-1">
          Everyone signs in with a link emailed to them — there are no passwords to manage.
        </p>
      </div>

      {!emailConfigured && (
        <div className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 space-y-1">
          <p>
            No mail server is configured, so sign-in links cannot be delivered. Set{' '}
            <code className="px-1 rounded bg-black/30">SMTP_HOST</code> and friends, or pass links
            to people yourself — they are shown here and written to the server log.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(testEmailSettings)}
            className="underline hover:no-underline disabled:opacity-50"
          >
            Test the connection anyway
          </button>
        </div>
      )}

      <section className="space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={signup}
            disabled={pending}
            onChange={(event) => handleSignupToggle(event.target.checked)}
            className="mt-1"
          />
          <span className="text-sm">
            <span className="text-white">Let anyone sign themselves up</span>
            <span className="block text-shelvarr-text-muted">
              When off, only addresses you invite below can sign in.
            </span>
          </span>
        </label>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-white">Invite someone</h3>
        <form onSubmit={handleInvite} className="flex flex-wrap gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="them@example.com"
            className="flex-1 min-w-[200px] bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
          />
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name (optional)"
            className="flex-1 min-w-[160px] bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
            className="bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="submit"
            disabled={pending || !email}
            className="px-4 py-2 rounded-lg bg-shelvarr-primary text-white text-sm font-medium disabled:opacity-50"
          >
            Invite
          </button>
        </form>

        {manualLink && (
          <div className="text-sm bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2 space-y-1">
            <p className="text-shelvarr-text-muted">Send them this link:</p>
            <code className="block break-all text-blue-400">{manualLink}</code>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-white">
          {users.length} {users.length === 1 ? 'account' : 'accounts'}
        </h3>
        <ul className="divide-y divide-shelvarr-border border border-shelvarr-border rounded-lg overflow-hidden">
          {users.map((user) => {
            const isSelf = user.id === currentUserId;
            const sessions = sessionCounts[user.id] ?? 0;

            return (
              <li
                key={user.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 bg-shelvarr-surface"
              >
                <div className="flex-1 min-w-[180px]">
                  <p className="text-white text-sm">
                    {user.name || user.email}
                    {isSelf && <span className="text-shelvarr-text-muted"> (you)</span>}
                  </p>
                  <p className="text-xs text-shelvarr-text-muted">
                    {user.name ? `${user.email} · ` : ''}
                    {user.lastLoginAt ? `last seen ${user.lastLoginAt}` : 'never signed in'}
                    {sessions > 0 && ` · ${sessions} active ${sessions === 1 ? 'session' : 'sessions'}`}
                  </p>
                </div>

                <select
                  value={user.role}
                  disabled={pending}
                  onChange={(event) =>
                    run(() => changeUserRole(user.id, event.target.value as UserRole))
                  }
                  className="bg-shelvarr-bg border border-shelvarr-border rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  aria-label={`Role for ${user.email}`}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>

                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => resendInvite(user.id))}
                  className="text-sm text-shelvarr-text-muted hover:text-white disabled:opacity-50"
                >
                  Send link
                </button>

                {!isSelf && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleRemove(user)}
                    className="text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
