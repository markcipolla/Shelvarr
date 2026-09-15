import { initDatabase } from '@shelvarr/db';
import { initServiceConfig, loadConfigFromEnv, scheduler } from '@shelvarr/services';

const config = loadConfigFromEnv();

// Initialize shared packages
initDatabase(config.dbPath);
initServiceConfig(config);

// Recurring jobs (metadata refresh, and optionally the GetComics sweep).
//
// Skipped during `next build`, which imports every module to collect page
// data and must not start timers, and in tests, which drive the scheduler
// directly. Claiming is atomic in SQL, so running this in each of several
// server processes is safe.
const schedulerDisabled =
  process.env['SCHEDULER_ENABLED'] === 'false' ||
  process.env['NODE_ENV'] === 'test' ||
  process.env['NEXT_PHASE'] === 'phase-production-build';

if (!schedulerDisabled) {
  try {
    scheduler.startScheduler();
  } catch (error) {
    // A broken scheduler must not stop the app from serving.
    console.error('Failed to start the scheduler:', error);
  }
}

export default config;
