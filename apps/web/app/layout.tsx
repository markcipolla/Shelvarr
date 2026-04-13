import type { Metadata } from 'next';
import './globals.css';
import { SidebarWrapper } from '@/components/SidebarWrapper';
import { ToastProvider } from '@/components/ui/Toast';

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
          <main className="flex-1 p-6 pt-16 lg:pt-6 min-h-screen h-full overflow-auto">
            {children}
          </main>
        </ToastProvider>
      </body>
    </html>
  );
}
