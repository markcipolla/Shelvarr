'use client';

import { useState, useTransition } from 'react';
import { requestMagicLink } from '@/lib/actions/auth';

interface LoginFormProps {
  next: string | null;
  error: string | null;
  allowSignup: boolean;
  emailConfigured: boolean;
}

export function LoginForm({ next, error, allowSignup, emailConfigured }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData();
    formData.set('email', email);
    if (next) formData.set('next', next);

    startTransition(async () => {
      const result = await requestMagicLink(formData);
      setMessage({ ok: result.ok, text: result.message ?? '' });
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-white">Sign in</h2>
        <p className="text-sm text-shelvarr-text-muted mt-1">
          {allowSignup
            ? 'Enter your email and we will send you a link. New addresses get an account.'
            : 'Enter your email and we will send you a sign-in link. No password needed.'}
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {!emailConfigured && (
        <p className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          This server has no email configured, so sign-in links cannot be delivered. The
          administrator can find them in the server log.
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm text-shelvarr-text-muted mb-1">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="w-full px-3 py-2 rounded-lg bg-shelvarr-bg border border-shelvarr-border text-white placeholder:text-shelvarr-text-muted focus:outline-none focus:border-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={pending || !email}
          className="w-full px-4 py-2 rounded-lg bg-shelvarr-primary text-white font-medium disabled:opacity-50 transition-opacity"
        >
          {pending ? 'Sending…' : 'Email me a link'}
        </button>
      </form>

      {message && (
        <p
          className={`text-sm rounded-lg px-3 py-2 border ${
            message.ok
              ? 'text-green-400 bg-green-500/10 border-green-500/30'
              : 'text-red-400 bg-red-500/10 border-red-500/30'
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
