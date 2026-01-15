/**
 * Test setup utilities
 * Provides database initialization and cleanup for tests
 */

import { initDatabase, closeDatabase, getPool } from '../src/db/index.js';

// Set test database URL before any imports that use config
const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'] ||
  'postgresql://shelvarr_test:shelvarr_test@localhost:5433/shelvarr_test';

// Override the database URL for tests
process.env['DATABASE_URL'] = TEST_DATABASE_URL;

/**
 * Initialize the test database
 * Creates all tables fresh for each test run
 */
export async function setupTestDatabase(): Promise<void> {
  await initDatabase();
}

/**
 * Clean up the test database
 * Truncates all tables but keeps the schema
 */
export async function cleanupTestDatabase(): Promise<void> {
  const pool = getPool();

  // Truncate all tables in reverse dependency order
  await pool.query(`
    TRUNCATE TABLE
      downloads,
      author_works,
      authors,
      book_series,
      series,
      tasks,
      books,
      libraries,
      settings
    RESTART IDENTITY CASCADE
  `);
}

/**
 * Close the test database connection
 */
export async function teardownTestDatabase(): Promise<void> {
  await closeDatabase();
}

/**
 * Reset database to clean state (truncate + close)
 */
export async function resetTestDatabase(): Promise<void> {
  try {
    await cleanupTestDatabase();
  } catch {
    // Tables might not exist yet
  }
  await teardownTestDatabase();
}
