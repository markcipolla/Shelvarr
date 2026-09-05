import { auth } from '@shelvarr/services';
import '@/lib/config';
import { requireAdmin } from '@/lib/auth';
import { getAccessSettings } from '@/lib/actions/auth';
import { AccessSettings } from '@/components/settings/AccessSettings';
import { UsersTab } from '@/components/settings/UsersTab';

export const dynamic = 'force-dynamic';

export default async function UsersSettingsPage() {
  const currentUser = await requireAdmin();
  const access = await getAccessSettings();

  // With accounts off there are no users to list, but this is still the screen
  // that turns them back on — so it renders the access settings rather than the
  // dead end it used to, which told you to edit an environment variable and
  // restart.
  if (!auth.isAuthEnabled()) {
    return (
      <div className="max-w-3xl space-y-8">
        <div>
          <h2 className="text-lg font-semibold text-white">User accounts</h2>
          <p className="text-sm text-shelvarr-text-muted mt-1">
            Accounts are switched off, so every request is let through and there is nothing to
            manage. Turn them back on below — the first visit afterwards will offer to create an
            admin if none exists.
          </p>
        </div>
        <AccessSettings settings={access} />
      </div>
    );
  }

  const status = auth.getAuthStatus();
  const users = auth.listUsers();
  const sessionCounts = Object.fromEntries(
    users.map((user) => [user.id, auth.getSessions(user.id).length])
  );

  return (
    <div className="max-w-3xl space-y-8">
      <UsersTab
        users={users}
        currentUserId={currentUser?.id ?? null}
        allowSignup={status.allowSignup}
        emailConfigured={status.emailConfigured}
        sessionCounts={sessionCounts}
      />
      <AccessSettings settings={access} />
    </div>
  );
}
