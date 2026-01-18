/**
 * Test setup utilities
 * Provides database initialization and cleanup for tests
 */

import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let testDir: string | null = null;

/**
 * Create a temporary test directory and set environment variables
 */
export function createTestEnvironment(): string {
  testDir = mkdtempSync(join(tmpdir(), 'shelvarr-test-'));
  process.env['DATA_DIR'] = testDir;
  process.env['DB_PATH'] = join(testDir, 'test.db');
  return testDir;
}

/**
 * Initialize the test database
 * Must be called AFTER createTestEnvironment and AFTER importing db module
 */
export async function setupTestDatabase(): Promise<void> {
  // Dynamic import to ensure env vars are set first
  const { initDatabase } = await import('../lib/db/index.js');
  initDatabase();
}

/**
 * Clean up the test database
 * Truncates all tables but keeps the schema
 */
export async function cleanupTestDatabase(): Promise<void> {
  const { getDb } = await import('../lib/db/index.js');
  const db = getDb();

  // Delete all data in reverse dependency order
  db.exec(`
    DELETE FROM downloads;
    DELETE FROM author_works;
    DELETE FROM authors;
    DELETE FROM book_series;
    DELETE FROM series;
    DELETE FROM tasks;
    DELETE FROM books;
    DELETE FROM libraries;
    DELETE FROM settings;
  `);
}

/**
 * Close the test database connection
 */
export async function teardownTestDatabase(): Promise<void> {
  const { closeDatabase } = await import('../lib/db/index.js');
  closeDatabase();
}

/**
 * Clean up test directory
 */
export function cleanupTestEnvironment(): void {
  if (testDir) {
    rmSync(testDir, { recursive: true, force: true });
    testDir = null;
  }
}

/**
 * Reset database to clean state (truncate + close + cleanup)
 */
export async function resetTestDatabase(): Promise<void> {
  try {
    await cleanupTestDatabase();
  } catch {
    // Tables might not exist yet
  }
  await teardownTestDatabase();
  cleanupTestEnvironment();
}
