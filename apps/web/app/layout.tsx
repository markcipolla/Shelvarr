import type { Metadata } from 'next';
import './globals.css';
import { SidebarWrapper } from '@/components/SidebarWrapper';
import { ToastProvider } from '@/components/ui/Toast';
import { GlobalSearch } from '@/components/GlobalSearch';

// Force all pages to be dynamic — this app uses SQLite and has no static content
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Shelvarr',
  description: 'Self-hosted book and comic metadata management',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html className="h-full" lang="en">
      <body className="min-h-screen h-full flex bg-shelvarr-bg">
        <ToastProvider>
          <SidebarWrapper />
          <div className="flex-1 flex flex-col min-h-screen h-full overflow-hidden">
            <header className="sticky top-0 z-30 bg-shelvarr-bg/95 backdrop-blur border-b border-shelvarr-border px-4 py-3 pl-16 lg:pl-4">
              <GlobalSearch />
            </header>
            <main className="flex-1 p-6 overflow-auto">
              {children}
            </main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
