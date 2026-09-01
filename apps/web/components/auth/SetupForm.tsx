'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { completeSetup } from '@/lib/actions/auth';

interface SetupFormProps {
  allowSignupDefault: boolean;
  emailConfigured: boolean;
}

/**
 * First-run wizard. Creates the admin account and signs it in on the spot, so
 * the server is usable before SMTP is configured.
 */
export function SetupForm({ allowSignupDefault, emailConfigured }: SetupFormProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [allowSignup, setAllowSignup] = useState(allowSignupDefault);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set('name', name);
    formData.set('email', email);
    if (allowSignup) formData.set('allowSignup', 'on');

    startTransition(async () => {
      const result = await completeSetup(formData);
      if (!result.ok) {
        setError(result.message ?? 'Could not create the account');
        return;
      }
      router.replace('/');
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-white">Welcome to Shelvarr</h2>
        <p className="text-sm text-shelvarr-text-muted mt-1">
          Create the first account. It will be an admin, and you will be signed in straight away.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm text-shelvarr-text-muted mb-1">
            Your name <span className="text-shelvarr-text-muted/60">(optional)</span>
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ada Lovelace"
            className="w-full px-3 py-2 rounded-lg bg-shelvarr-bg border border-shelvarr-border text-white placeholder:text-shelvarr-text-muted focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm text-shelvarr-text-muted mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="w-full px-3 py-2 rounded-lg bg-shelvarr-bg border border-shelvarr-border text-white placeholder:text-shelvarr-text-muted focus:outline-none focus:border-blue-500"
          />
          <p className="text-xs text-shelvarr-text-muted mt-1">
            Future sign-ins send a link here, so use an address you can read.
          </p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={allowSignup}
            onChange={(event) => setAllowSignup(event.target.checked)}
            className="mt-1"
          />
          <span className="text-sm">
            <span className="text-white">Let anyone sign themselves up</span>
            <span className="block text-shelvarr-text-muted">
              Off by default. With it off, you invite people from Settings.
            </span>
          </span>
        </label>

        {!emailConfigured && (
          <p className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            No email is configured yet, so sign-in links cannot be delivered. Set the SMTP
            environment variables when you can — until then, links are written to the server log.
          </p>
        )}

        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending || !email}
          className="w-full px-4 py-2 rounded-lg bg-shelvarr-primary text-white font-medium disabled:opacity-50 transition-opacity"
        >
          {pending ? 'Creating…' : 'Create admin account'}
        </button>
      </form>
    </div>
  );
}
