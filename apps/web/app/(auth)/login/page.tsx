import { redirect } from 'next/navigation';
import { auth } from '@shelvarr/services';
import '@/lib/config';
import { getCurrentUser } from '@/lib/auth';
import { LoginForm } from '@/components/auth/LoginForm';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  'invalid-token': 'That sign-in link is not valid, has expired, or has already been used.',
  'signed-out': 'You have been signed out.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  if (!auth.isAuthEnabled()) redirect('/');
  if (auth.isSetupRequired()) redirect('/setup');
  if (await getCurrentUser()) redirect('/');

  const params = await searchParams;
  const status = auth.getAuthStatus();

  return (
    <LoginForm
      next={auth.isSafeRedirect(params.next) ? params.next : null}
      error={params.error ? (ERRORS[params.error] ?? null) : null}
      allowSignup={status.allowSignup}
      emailConfigured={status.emailConfigured}
    />
  );
}
