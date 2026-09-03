import { auth } from '@shelvarr/services';
import '@/lib/config';
import { requireAdmin } from '@/lib/auth';
import { UsersTab } from '@/components/settings/UsersTab';

export const dynamic = 'force-dynamic';

export default async function UsersSettingsPage() {
  const currentUser = await requireAdmin();

  if (!auth.isAuthEnabled()) {
    return (
      <div className="max-w-2xl space-y-2">
        <h2 className="text-lg font-semibold text-white">User accounts</h2>
        <p className="text-sm text-shelvarr-text-muted">
          Authentication is switched off on this server, so there is nothing to manage. Remove
          <code className="mx-1 px-1 rounded bg-shelvarr-bg">SHELVARR_AUTH_ENABLED=false</code>
          and restart to turn it back on.
        </p>
      </div>
    );
  }

  const status = auth.getAuthStatus();
  const users = auth.listUsers();
  const sessionCounts = Object.fromEntries(
    users.map((user) => [user.id, auth.getSessions(user.id).length])
  );

  return (
    <UsersTab
      users={users}
      currentUserId={currentUser?.id ?? null}
      allowSignup={status.allowSignup}
      emailConfigured={status.emailConfigured}
      sessionCounts={sessionCounts}
    />
  );
}
