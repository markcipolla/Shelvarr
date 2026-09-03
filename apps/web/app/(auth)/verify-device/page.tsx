import Link from 'next/link';

export const dynamic = 'force-dynamic';

/**
 * Shown after a magic link for a native login is opened. The app that started
 * the login picks the session up on its next poll — which is the point: the
 * email can be read on a laptop and still sign in the phone.
 */
export default async function VerifyDevicePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  return (
    <div className="text-center space-y-4">
      <div className="text-4xl" aria-hidden="true">
        ✓
      </div>
      <h2 className="text-xl font-semibold text-white">Device approved</h2>
      {code && (
        <p className="text-sm text-shelvarr-text-muted">
          Confirm your app is showing{' '}
          <span className="font-mono text-white tracking-widest">{code}</span>. If it is not,
          close this page and sign out of that device from Settings.
        </p>
      )}
      <p className="text-sm text-shelvarr-text-muted">
        You can go back to the app now — it will finish signing in within a few seconds.
      </p>
      <Link
        href="/"
        className="inline-block px-4 py-2 rounded-lg bg-shelvarr-primary text-white text-sm font-medium"
      >
        Open Shelvarr
      </Link>
    </div>
  );
}
