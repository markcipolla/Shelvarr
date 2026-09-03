import { Suspense } from 'react';
import { SidebarWrapper } from '@/components/SidebarWrapper';
import { GlobalSearch } from '@/components/GlobalSearch';
import { ScrollRestorer } from '@/components/ScrollRestorer';
import { AccountMenu } from '@/components/auth/AccountMenu';
import { requirePageUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Everything the library is made of sits under this layout, so the sign-in
 * check happens in exactly one place. `requirePageUser` redirects to /setup
 * or /login as appropriate and only returns for someone signed in — or for
 * anyone at all when authentication is switched off.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePageUser();

  return (
    <>
      <SidebarWrapper />
      <div className="flex-1 flex flex-col min-h-screen h-full overflow-hidden">
        <header className="sticky top-0 z-30 bg-shelvarr-bg/95 backdrop-blur border-b border-shelvarr-border px-4 py-3 pl-16 lg:pl-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <Suspense fallback={null}>
              <GlobalSearch />
            </Suspense>
          </div>
          {user && <AccountMenu user={user} />}
        </header>
        <main id="main-scroll" className="flex-1 p-6 overflow-auto">
          {children}
        </main>
        <Suspense fallback={null}>
          <ScrollRestorer />
        </Suspense>
      </div>
    </>
  );
}
