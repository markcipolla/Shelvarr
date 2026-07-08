export async function register() {
  // Only register Node.js process handlers when not in Edge Runtime
  if (typeof process !== 'undefined' && process.env.NEXT_RUNTIME !== 'edge') {
    // Initialize database and services on startup
    // Dynamic import to ensure this only runs server-side
    await import('./lib/config/index');

    // Add global error handlers to catch silent crashes
    process.on('uncaughtException', (error) => {
      console.error('UNCAUGHT EXCEPTION:', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
    });

    process.on('exit', (code) => {
      console.log('Process exiting with code:', code);
    });

    // Mirror the user's Hardcover reading statuses (want to read / reading / read)
    // into the local cache on startup and every few hours, so they stay fresh
    // across devices without a manual sync. No-ops when Hardcover isn't configured.
    const { hardcover } = await import('@shelvarr/services');
    const syncHardcoverStatuses = () => {
      hardcover.syncReadingStatusesFromHardcover().catch((err) => {
        console.error('Hardcover status sync failed:', err);
      });
    };
    syncHardcoverStatuses();
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    // Cast because the web tsconfig types setInterval via the DOM lib (number),
    // but at runtime this is a Node timer with unref() so it won't hold the
    // process open on its own.
    const timer = setInterval(syncHardcoverStatuses, SIX_HOURS_MS) as unknown as {
      unref?: () => void;
    };
    timer.unref?.();

    console.log('Instrumentation registered (Node.js runtime)');
  } else {
    console.log('Instrumentation registered (Edge runtime - process handlers skipped)');
  }
}
