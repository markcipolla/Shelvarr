'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { requestLoginCode, submitLoginCode } from '@/lib/actions/auth';
import { CodeInput } from './CodeInput';

interface LoginFormProps {
  next: string | null;
  error: string | null;
  allowSignup: boolean;
  emailConfigured: boolean;
}

const CODE_LENGTH = 6;

/**
 * Sign in with an emailed one-time code.
 *
 * Two steps on one screen: an address, then the six characters that arrive at
 * it. The email is kept once the code step opens because verifying needs
 * both — a code alone is only six characters, and pinning it to an address is
 * what stops one being guessed at across every account at once.
 */
export function LoginForm({ next, error, allowSignup, emailConfigured }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const sendCode = () => {
    const formData = new FormData();
    formData.set('email', email);
    if (next) formData.set('next', next);

    startTransition(async () => {
      const result = await requestLoginCode(formData);
      setMessage({ ok: result.ok, text: result.message ?? '' });
      if (result.ok) {
        setCode('');
        setStep('code');
      }
    });
  };

  const verifyCode = (entered: string) => {
    if (entered.length !== CODE_LENGTH || pending) return;

    const formData = new FormData();
    formData.set('email', email);
    formData.set('code', entered);
    if (next) formData.set('next', next);

    startTransition(async () => {
      const result = await submitLoginCode(formData);
      if (result.ok && result.redirectTo) {
        // A full navigation rather than a push: the layout above this form
        // renders signed-out chrome and has to be rebuilt from the server.
        router.replace(result.redirectTo);
        router.refresh();
        return;
      }
      setCode('');
      setMessage({ ok: false, text: result.message ?? 'That code could not be used' });
    });
  };

  const startOver = () => {
    setStep('email');
    setCode('');
    setMessage(null);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-white">Sign in</h2>
        <p className="text-sm text-shelvarr-text-muted mt-1">
          {step === 'code'
            ? `Enter the ${CODE_LENGTH}-character code we sent to ${email}.`
            : allowSignup
              ? 'Enter your email and we will send you a code. New addresses get an account.'
              : 'Enter your email and we will send you a sign-in code. No password needed.'}
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {!emailConfigured && (
        <p className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          This server has no email configured, so sign-in codes cannot be delivered. The
          administrator can find them in the server log.
        </p>
      )}

      {step === 'email' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            sendCode();
          }}
          className="space-y-4"
        >
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
            {pending ? 'Sending…' : 'Email me a code'}
          </button>

          {/* For an install without SMTP, where the code is read out of the
              server log or passed on by an admin rather than emailed. */}
          <button
            type="button"
            onClick={() => {
              setMessage(null);
              setStep('code');
            }}
            disabled={!email}
            className="w-full text-sm text-shelvarr-text-muted hover:text-white disabled:opacity-50 transition-colors"
          >
            I already have a code
          </button>
        </form>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            verifyCode(code);
          }}
          className="space-y-4"
        >
          <CodeInput
            value={code}
            onChange={setCode}
            onComplete={verifyCode}
            length={CODE_LENGTH}
            disabled={pending}
            autoFocus
          />

          <button
            type="submit"
            disabled={pending || code.length !== CODE_LENGTH}
            className="w-full px-4 py-2 rounded-lg bg-shelvarr-primary text-white font-medium disabled:opacity-50 transition-opacity"
          >
            {pending ? 'Checking…' : 'Sign in'}
          </button>

          <div className="flex justify-between text-sm">
            <button
              type="button"
              onClick={startOver}
              className="text-shelvarr-text-muted hover:text-white transition-colors"
            >
              Use a different email
            </button>
            <button
              type="button"
              onClick={sendCode}
              disabled={pending}
              className="text-shelvarr-text-muted hover:text-white disabled:opacity-50 transition-colors"
            >
              Send a new code
            </button>
          </div>
        </form>
      )}

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
