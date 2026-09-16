import { join } from 'path';
import { initDatabase } from '@shelvarr/db';
import { initServiceConfig, loadConfigFromEnv, scheduler } from '@shelvarr/services';
import { failOrphanedRunningTasks, rebuildRetryQueueFromDatabase } from '@shelvarr/services/queue/index';
import { configureLogFile, createLogger } from '@shelvarr/services/utils/logger';

const log = createLogger('config');

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

// A task left at `running` when the process died has nothing left to finish
// it: the in-memory bookkeeping that would otherwise notice died with the
// process. Reconcile those before the scheduler can queue anything new, so a
// stale "running" scan doesn't race a freshly scheduled one.
//
// Skipped during `next build`, which imports every module to collect page
// data and must not touch the database, and in tests, which drive the queue
// directly.
const orphanRecoveryDisabled =
  process.env['NODE_ENV'] === 'test' ||
  process.env['NEXT_PHASE'] === 'phase-production-build';

if (!orphanRecoveryDisabled) {
  try {
    const failedCount = failOrphanedRunningTasks();
    if (failedCount > 0) {
      log.info('Failed orphaned running tasks left over from a server restart', { count: failedCount });
    }
  } catch (error) {
    // A broken recovery pass must not stop the app from serving.
    console.error('Failed to reconcile orphaned running tasks:', error);
  }

  // The rate-limit retry queue lives in memory; a restart loses it, leaving a
  // rate-limited task stuck at `pending` until a human finds it and clicks
  // retry. `scheduleRetry` also stamps `not_before` onto the task's row, so
  // it can be rebuilt here instead.
  try {
    const requeued = rebuildRetryQueueFromDatabase();
    if (requeued > 0) {
      log.info('Rebuilt the retry queue left over from a server restart', { count: requeued });
    }
  } catch (error) {
    // A broken rebuild must not stop the app from serving.
    console.error('Failed to rebuild the retry queue:', error);
  }
}

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
