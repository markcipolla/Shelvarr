import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';

export const dynamic = 'force-dynamic';

/** The bare shell the sign-in and first-run pages sit in. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Link href="/" className="block text-center mb-8">
          <Logo className="w-16 h-16 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-shelvarr-primary">Shelvarr</h1>
          <p className="text-sm text-shelvarr-text-muted mt-1">Book &amp; Comic Manager</p>
        </Link>
        <div className="bg-shelvarr-surface border border-shelvarr-border rounded-xl p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
