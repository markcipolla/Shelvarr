import { redirect } from 'next/navigation';
import { auth } from '@shelvarr/services';
import '@/lib/config';
import { SetupForm } from '@/components/auth/SetupForm';

export const dynamic = 'force-dynamic';

/**
 * First run. Available only while the server has no accounts — once the first
 * admin exists this page redirects away for good.
 */
export default async function SetupPage() {
  if (!auth.isAuthEnabled()) redirect('/');
  if (!auth.isSetupRequired()) redirect('/login');

  const status = auth.getAuthStatus();

  return (
    <SetupForm
      allowSignupDefault={status.allowSignup}
      emailConfigured={status.emailConfigured}
    />
  );
}
