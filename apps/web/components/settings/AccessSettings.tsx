'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import {
  saveEmailSettings,
  setAuthEnabledAction,
  testEmailSettings,
  type AccessSettings as AccessSettingsData,
} from '@/lib/actions/auth';

const inputClass =
  'bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500 disabled:opacity-50';

export function AccessSettings({ settings }: { settings: AccessSettingsData }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [authEnabled, setAuthEnabled] = useState(settings.authEnabled);

  const [host, setHost] = useState(settings.email.host ?? '');
  const [port, setPort] = useState(String(settings.email.port));
  const [secure, setSecure] = useState(settings.email.secure);
  const [user, setUser] = useState(settings.email.user ?? '');
  const [from, setFrom] = useState(settings.email.from);

  // The saved password is never sent to the browser, so the field starts empty
  // and only counts as a change once it has been typed in. Otherwise saving
  // the form after editing the host would silently wipe the password.
  const [password, setPassword] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);

  const run = (action: () => Promise<{ ok: boolean; message?: string }>) => {
    startTransition(async () => {
      const result = await action();
      if (result.message) {
        if (result.ok) toast.success(result.message);
        else toast.error(result.message);
      }
      if (result.ok) router.refresh();
    });
  };

  const handleAuthToggle = (value: boolean) => {
    // Only the off direction is dangerous, and it is dangerous enough to ask:
    // it hands full access to anyone who can reach the server.
    if (
      !value &&
      !confirm(
        'Turn accounts off?\n\nAnyone who can reach this server will have full access, ' +
          'including whoever is on the same network. Existing accounts are kept.'
      )
    ) {
      return;
    }
    setAuthEnabled(value);
    run(() => setAuthEnabledAction(value));
  };

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    run(() =>
      saveEmailSettings({
        host: host.trim() || null,
        port: Number.parseInt(port, 10) || null,
        secure,
        user: user.trim() || null,
        from: from.trim() || null,
        // Left out entirely when untouched, which the action reads as "keep
        // what is saved".
        ...(passwordTouched ? { password: password || null } : {}),
      })
    );
    setPasswordTouched(false);
    setPassword('');
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium text-white">Accounts</h3>
          <p className="text-sm text-shelvarr-text-muted mt-1">
            Changed here rather than in the environment, so it survives a restart. A
            <code className="mx-1 px-1 rounded bg-shelvarr-bg">SHELVARR_AUTH_ENABLED</code>
            variable only sets the starting value.
          </p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={authEnabled}
            disabled={pending}
            onChange={(event) => handleAuthToggle(event.target.checked)}
            className="mt-1"
          />
          <span className="text-sm">
            <span className="text-white">Require an account to use this server</span>
            <span className="block text-shelvarr-text-muted">
              When off, every request is let through without signing in. Only sensible behind a
              reverse proxy that authenticates, or on a network you trust completely.
            </span>
          </span>
        </label>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium text-white">Outgoing mail</h3>
          <p className="text-sm text-shelvarr-text-muted mt-1">
            How sign-in codes get delivered. Without a host they are written to the server log
            instead, which works but means passing them on by hand.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <label className="flex-1 min-w-[220px] space-y-1">
              <span className="text-xs text-shelvarr-text-muted">Host</span>
              <input
                type="text"
                value={host}
                disabled={pending}
                onChange={(event) => setHost(event.target.value)}
                placeholder="smtp.example.com"
                className={`w-full ${inputClass}`}
              />
            </label>
            <label className="w-28 space-y-1">
              <span className="text-xs text-shelvarr-text-muted">Port</span>
              <input
                type="number"
                value={port}
                disabled={pending}
                onChange={(event) => setPort(event.target.value)}
                className={`w-full ${inputClass}`}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="flex-1 min-w-[220px] space-y-1">
              <span className="text-xs text-shelvarr-text-muted">Username</span>
              <input
                type="text"
                value={user}
                disabled={pending}
                onChange={(event) => setUser(event.target.value)}
                autoComplete="off"
                className={`w-full ${inputClass}`}
              />
            </label>
            <label className="flex-1 min-w-[220px] space-y-1">
              <span className="text-xs text-shelvarr-text-muted">Password</span>
              <input
                type="password"
                value={password}
                disabled={pending}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setPasswordTouched(true);
                }}
                placeholder={settings.email.passwordSet ? 'unchanged' : 'none'}
                autoComplete="off"
                className={`w-full ${inputClass}`}
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs text-shelvarr-text-muted">From</span>
            <input
              type="text"
              value={from}
              disabled={pending}
              onChange={(event) => setFrom(event.target.value)}
              placeholder="Shelvarr &lt;shelvarr@example.com&gt;"
              className={`w-full ${inputClass}`}
            />
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={secure}
              disabled={pending}
              onChange={(event) => setSecure(event.target.checked)}
            />
            <span className="text-shelvarr-text-muted">
              Implicit TLS. Usually only for port 465 — everything else upgrades with STARTTLS.
            </span>
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg px-4 py-2"
            >
              Save
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(testEmailSettings)}
              className="border border-shelvarr-border hover:border-blue-500 disabled:opacity-50 text-white text-sm rounded-lg px-4 py-2"
            >
              Send a test
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
