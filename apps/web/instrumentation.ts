export async function register() {
  // Only register Node.js process handlers when not in Edge Runtime
  if (typeof process !== 'undefined' && process.env.NEXT_RUNTIME !== 'edge') {
    // Before anything else, so whatever the startup below prints — a database
    // that will not open included — reaches the diagnostics log.
    const { captureConsole, createLogger } = await import('@shelvarr/services/utils/logger');
    captureConsole();

    // Initialize database and services on startup
    // Dynamic import to ensure this only runs server-side
    await import('./lib/config/index');

    const log = createLogger('process');
    log.info('Server started', {
      pid: process.pid,
      build: process.env['NEXT_PUBLIC_BUILD_VERSION'] || 'dev',
      node: process.version,
    });

    // Add global error handlers to catch silent crashes. The log file is
    // written synchronously, so these lines are on disk even if the process
    // dies straight after.
    const describe = (reason: unknown) =>
      reason instanceof Error ? reason.stack || reason.message : String(reason);

    process.on('uncaughtException', (error) => {
      log.error(`Uncaught exception: ${describe(error)}`);
    });

    process.on('unhandledRejection', (reason) => {
      log.error(`Unhandled rejection: ${describe(reason)}`);
    });

    process.on('exit', (code) => {
      log.info('Process exiting', { code });
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
