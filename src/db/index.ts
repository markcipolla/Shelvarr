import pg from 'pg';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import config from '../config/index.js';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let pool: pg.Pool | null = null;

/**
 * Initialize the database connection pool and run migrations
 */
export async function initDatabase(): Promise<pg.Pool> {
  // Create connection pool
  pool = new Pool({
    connectionString: config.databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Test connection
  const client = await pool.connect();
  try {
    // Run schema
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    await client.query(schema);
    console.log(`Database connected to PostgreSQL`);
  } finally {
    client.release();
  }

  return pool;
}

/**
 * Get the database pool
 */
export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return pool;
}

/**
 * Close the database connection pool
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Execute a query and return all rows
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await getPool().query(sql, params);
  return result.rows as T[];
}

/**
 * Execute a query and return the first row
 */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] || null;
}

/**
 * Execute a query that modifies data (INSERT, UPDATE, DELETE)
 */
export async function execute(
  sql: string,
  params: unknown[] = []
): Promise<{ rowCount: number }> {
  const result = await getPool().query(sql, params);
  return { rowCount: result.rowCount || 0 };
}

/**
 * Execute an INSERT and return the inserted row
 */
export async function insertReturning<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const result = await getPool().query(sql, params);
  return (result.rows[0] as T) || null;
}

/**
 * Get a setting value
 */
export async function getSetting<T = unknown>(key: string, defaultValue: T | null = null): Promise<T | null> {
  const row = await queryOne<{ value: string }>('SELECT value FROM settings WHERE key = $1', [key]);

  if (!row) return defaultValue;

  try {
    return JSON.parse(row.value) as T;
  } catch {
    return row.value as T;
  }
}

/**
 * Set a setting value
 */
export async function setSetting(key: string, value: unknown): Promise<void> {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  await execute(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
    [key, serialized]
  );
}

/**
 * Get all settings
 */
export async function getAllSettings(): Promise<Record<string, unknown>> {
  const rows = await query<{ key: string; value: string }>('SELECT key, value FROM settings');

  const settings: Record<string, unknown> = {};

  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }

  return settings;
}

export default {
  initDatabase,
  getPool,
  closeDatabase,
  query,
  queryOne,
  execute,
  insertReturning,
  getSetting,
  setSetting,
  getAllSettings,
};
