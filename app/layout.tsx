import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';

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
        <Sidebar />
        <main className="flex-1 p-6 min-h-screen h-full overflow-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
