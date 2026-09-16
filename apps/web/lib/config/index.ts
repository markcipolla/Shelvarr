import { join } from 'path';
import { initDatabase } from '@shelvarr/db';
import { initServiceConfig, loadConfigFromEnv, scheduler } from '@shelvarr/services';
import { configureLogFile } from '@shelvarr/services/utils/logger';

const config = loadConfigFromEnv();

// Every log line also goes to a file in the data directory, and the next start
// reads its tail back, so the diagnostics API can still see what happened
// before a restart. Opened before the database so a database that will not
// open is on the record too. `LOG_FILE=off` keeps logs in memory only; builds
// and tests never write one.
const logFile = process.env['LOG_FILE']?.trim() || join(config.dataDir, 'logs', 'shelvarr.log');
const logFileDisabled =
  logFile === 'off' ||
  process.env['NODE_ENV'] === 'test' ||
  process.env['NEXT_PHASE'] === 'phase-production-build';

if (!logFileDisabled) configureLogFile(logFile);

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
