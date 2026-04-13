export async function register() {
  // Only register Node.js process handlers when not in Edge Runtime
  if (typeof process !== 'undefined' && process.env.NEXT_RUNTIME !== 'edge') {
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

    console.log('Instrumentation registered (Node.js runtime)');
  } else {
    console.log('Instrumentation registered (Edge runtime - process handlers skipped)');
  }
}
