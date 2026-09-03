import { auth } from '@shelvarr/services';
import '@/lib/config';
import { getCurrentUser } from '@/lib/auth';
import { SettingsNav, type SettingsNavTab } from '@/components/settings/SettingsNav';

export const dynamic = 'force-dynamic';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // With auth switched off there is no user and nothing to manage, so the
  // Users tab is hidden the same way it is from a non-admin.
  const showUsers = auth.isAuthEnabled() && user?.role === 'admin';
  // Unlike Users, Advanced still has something to offer a server running
  // without accounts, so it is hidden only from a signed-in non-admin.
  const showAdvanced = !auth.isAuthEnabled() || user?.role === 'admin';

  const tabs: SettingsNavTab[] = [
    { href: '/settings/metadata', label: 'Metadata Sources' },
    { href: '/settings/downloads', label: 'Download Sources' },
    { href: '/settings/organize', label: 'Books' },
    { href: '/settings/comics', label: 'Comics' },
    ...(showUsers ? [{ href: '/settings/users', label: 'Users' }] : []),
    ...(showAdvanced ? [{ href: '/settings/advanced', label: 'Advanced' }] : []),
    { href: '/settings/about', label: 'About' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-shelvarr-text-muted mt-1">
          Configure metadata sources and integrations
        </p>
      </div>

      <SettingsNav tabs={tabs} />

      <div className="py-6">{children}</div>
    </div>
  );
}
