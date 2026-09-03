import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';

// Force all pages to be dynamic — this app uses SQLite and has no static content
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Shelvarr',
  description: 'Self-hosted book and comic metadata management',
};

/**
 * Only the document shell lives here. The application chrome — sidebar,
 * search, scroll restoration — belongs to the `(app)` group, which is behind
 * the sign-in check; the `(auth)` group is deliberately bare.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html className="h-full" lang="en">
      <body className="min-h-screen h-full flex bg-shelvarr-bg">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
