/**
 * Encryption at rest for the few secrets Shelvarr has to keep in the database.
 *
 * `download_source_config.credentials` holds a real Z-Library account password
 * and Anna's Archive member API key; `download_source_config.proxy_url` can
 * carry `user:pass@` for an authenticated proxy. Those used to sit in the
 * SQLite file as plaintext JSON, which means anyone with a copy of the Docker
 * volume — a backup, a stray `docker cp`, a mounted disk — has the operator's
 * password.
 *
 * The key is derived (HKDF-SHA256) from a random 32-byte seed kept in a single
 * file in the data directory, `.secret-key`, mode 0600. That is a real
 * improvement over plaintext without pretending to be more: someone who can
 * read the whole data directory can read the key too. It defends the case that
 * actually happens, a database file that travels without the directory around
 * it, and it keeps the password out of anything that greps a `.db`.
 *
 * Node's built-in `crypto` only — no dependency.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/** Marks a value this module wrote. Anything else is read as plaintext. */
const PREFIX = 'enc.v1.';
const KEY_FILE = '.secret-key';
const CIPHER = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Where the seed lives. Set by `initDatabase` from the injected config, never
 * read from the environment at point of use.
 */
let secretsDir: string | null = null;
let cachedKey: Buffer | null = null;

/** Point secret storage at the data directory. Idempotent. */
export function initSecrets(dataDir: string): void {
  if (secretsDir !== dataDir) cachedKey = null;
  secretsDir = dataDir;
}

/** Forget the cached key (tests that move the data directory between cases). */
export function resetSecretsCache(): void {
  cachedKey = null;
}

/** The path the seed is read from, for diagnostics and tests. */
export function secretKeyPath(): string {
  if (!secretsDir) {
    throw new Error('Secret storage is not initialized. Call initDatabase() first.');
  }
  return join(secretsDir, KEY_FILE);
}

/**
 * Read the seed, creating it on first use.
 *
 * `wx` makes creation atomic, so two server processes starting at once cannot
 * end up with different keys: the loser gets EEXIST and reads what the winner
 * wrote.
 */
function readSeed(): Buffer {
  const path = secretKeyPath();

  if (!existsSync(path)) {
    mkdirSync(secretsDir!, { recursive: true });
    const seed = randomBytes(32);
    try {
      writeFileSync(path, seed.toString('hex') + '\n', { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
      return seed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }

  const raw = readFileSync(path, 'utf-8').trim();
  const seed = Buffer.from(raw, 'hex');
  if (seed.length < 16) {
    throw new Error(`Secret key file ${path} is not a usable key. Delete it to have a new one generated.`);
  }
  return seed;
}

function getKey(): Buffer {
  if (!cachedKey) {
    cachedKey = Buffer.from(
      hkdfSync('sha256', readSeed(), Buffer.from('shelvarr.secrets.v1'), Buffer.from('download-source-config'), 32)
    );
  }
  return cachedKey;
}

/** True when `value` was produced by `encryptSecret`. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

/**
 * Encrypt a string for storage. The result is `enc.v1.<base64url iv|tag|body>`,
 * which is ASCII-safe for a TEXT column and self-identifying on read.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, getKey(), iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

/**
 * Decrypt a value written by `encryptSecret`.
 *
 * A value with no `enc.v1.` prefix is returned untouched: rows written before
 * this existed are plaintext, and the read path migrates them rather than
 * failing. Returns null when the value is encrypted but cannot be opened —
 * a lost or replaced key file — so a caller can treat it as "no credentials"
 * instead of crashing the request.
 */
export function decryptSecret(value: string): string | null {
  if (!isEncrypted(value)) return value;

  try {
    const raw = Buffer.from(value.slice(PREFIX.length), 'base64url');
    if (raw.length < IV_BYTES + TAG_BYTES) return null;

    const decipher = createDecipheriv(CIPHER, getKey(), raw.subarray(0, IV_BYTES));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf-8');
  } catch {
    return null;
  }
}
