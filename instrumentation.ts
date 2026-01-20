export async function register() {
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

  console.log('Instrumentation registered');
}
