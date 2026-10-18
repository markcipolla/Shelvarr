/**
 * Database backups.
 *
 * Everything Shelvarr knows that is not re-derivable from disk lives in two
 * files: `shelvarr.db` and the `.secret-key` that opens the credentials
 * encrypted inside it. A backup is a consistent snapshot of the first,
 * gzipped, kept for a while next to the original — and, when Backblaze B2 is
 * configured, pushed somewhere a dead disk cannot reach, with the key
 * alongside it so the copy is actually restorable.
 *
 * The snapshot uses SQLite's online backup API rather than copying the file:
 * the database is in WAL mode and is being written to while this runs, so a
 * plain `cp` would produce a torn copy.
 */

import { createReadStream, createWriteStream } from 'fs';
import { mkdir, readdir, readFile, rm, stat } from 'fs/promises';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { createGzip } from 'zlib';

import { getDb, getSetting, setSetting, encryptSecret, decryptSecret, secretKeyPath } from '@shelvarr/db';

import { getServiceConfig } from '../config';
import { createLogger } from '../utils/logger';
import { authorize, deleteFile, listFiles, uploadFile, type B2File } from './b2';

const log = createLogger('backup');

export const ENABLED_SETTING = 'backup_b2_enabled';
export const KEY_ID_SETTING = 'backup_b2_key_id';
export const APPLICATION_KEY_SETTING = 'backup_b2_application_key';
export const BUCKET_SETTING = 'backup_b2_bucket';
export const PREFIX_SETTING = 'backup_b2_prefix';
export const KEEP_SETTING = 'backup_keep';

/** How many snapshots to keep, here and at Backblaze, unless told otherwise. */
export const DEFAULT_KEEP = 7;

/** Names every snapshot, and the prefix retention sweeps match on. */
const FILE_PREFIX = 'shelvarr-';
const FILE_SUFFIX = '.db.gz';

/** The copy of `.secret-key` uploaded beside the snapshots. */
const SECRET_KEY_NAME = 'secret-key';

/** What the settings page shows. The application key itself never comes back. */
export interface BackupSettings {
  /** Whether finished snapshots are uploaded to Backblaze B2. */
  b2Enabled: boolean;
  keyId: string;
  bucket: string;
  /** Folder within the bucket, without a trailing slash. Empty for the root. */
  prefix: string;
  /** Whether an application key has been saved. */
  hasApplicationKey: boolean;
  keep: number;
}

export interface BackupSettingsInput {
  b2Enabled: boolean;
  keyId: string;
  bucket: string;
  prefix: string;
  /** Left out or empty to keep the stored key. */
  applicationKey?: string;
  keep: number;
}

export function getBackupSettings(): BackupSettings {
  return {
    b2Enabled: getSetting<boolean>(ENABLED_SETTING, false) === true,
    keyId: getSetting<string>(KEY_ID_SETTING, '') ?? '',
    bucket: getSetting<string>(BUCKET_SETTING, '') ?? '',
    prefix: getSetting<string>(PREFIX_SETTING, '') ?? '',
    hasApplicationKey: (getSetting<string>(APPLICATION_KEY_SETTING, '') ?? '').length > 0,
    keep: getSetting<number>(KEEP_SETTING, DEFAULT_KEEP) ?? DEFAULT_KEEP,
  };
}

/** The stored application key, decrypted, or null when there is none. */
function getApplicationKey(): string | null {
  const stored = getSetting<string>(APPLICATION_KEY_SETTING, '') ?? '';
  return stored ? decryptSecret(stored) : null;
}

export function saveBackupSettings(input: BackupSettingsInput): BackupSettings {
  const keep = Math.max(1, Math.min(365, Math.round(input.keep)));
  const prefix = input.prefix.trim().replace(/^\/+|\/+$/g, '');

  setSetting(KEY_ID_SETTING, input.keyId.trim());
  setSetting(BUCKET_SETTING, input.bucket.trim());
  setSetting(PREFIX_SETTING, prefix);
  setSetting(KEEP_SETTING, keep);

  // An empty box means "leave it alone": the page cannot show the saved key,
  // so it cannot send it back either.
  if (input.applicationKey?.trim()) {
    setSetting(APPLICATION_KEY_SETTING, encryptSecret(input.applicationKey.trim()));
  }

  const settings = getBackupSettings();
  if (input.b2Enabled && !(settings.keyId && settings.bucket && settings.hasApplicationKey)) {
    throw new Error('Uploading to Backblaze needs a key ID, an application key and a bucket.');
  }
  setSetting(ENABLED_SETTING, input.b2Enabled);

  return getBackupSettings();
}

/** Where snapshots are written. Inside the data directory, so it is on the volume. */
export function backupDir(): string {
  return join(getServiceConfig().dataDir, 'backups');
}

export interface LocalBackup {
  name: string;
  path: string;
  bytes: number;
  /** ISO-8601 instant the file was written. */
  createdAt: string;
}

/** Snapshots on disk, newest first. */
export async function listLocalBackups(): Promise<LocalBackup[]> {
  const directory = backupDir();

  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return [];
  }

  const backups = await Promise.all(
    names
      .filter((name) => name.startsWith(FILE_PREFIX) && name.endsWith(FILE_SUFFIX))
      .map(async (name) => {
        const path = join(directory, name);
        const info = await stat(path);
        return { name, path, bytes: info.size, createdAt: info.mtime.toISOString() };
      })
  );

  return backups.sort((a, b) => b.name.localeCompare(a.name));
}

export interface BackupResult {
  /** The snapshot written this run. */
  name: string;
  bytes: number;
  /** Older snapshots deleted from disk. */
  prunedLocal: number;
  /** Where it went at Backblaze, or null when uploading is off. */
  uploadedTo: string | null;
  /** Older snapshots deleted from the bucket. */
  prunedRemote: number;
  message: string;
}

/** Delete all but the newest `keep` files, newest-first list in. */
async function pruneLocal(backups: LocalBackup[], keep: number): Promise<number> {
  const doomed = backups.slice(keep);
  for (const backup of doomed) await rm(backup.path, { force: true });
  return doomed.length;
}

/** The same, at Backblaze. Only files this module named are considered. */
async function pruneRemote(
  session: Awaited<ReturnType<typeof authorize>>,
  files: B2File[],
  keep: number
): Promise<number> {
  const snapshots = files
    .filter((file) => file.fileName.endsWith(FILE_SUFFIX))
    .sort((a, b) => b.fileName.localeCompare(a.fileName));

  const doomed = snapshots.slice(keep);
  for (const file of doomed) await deleteFile(session, file);
  return doomed.length;
}

/**
 * Take a snapshot, keep the last `keep` of them, and upload if configured.
 *
 * Uploading failing does not undo the local snapshot: a backup on the same
 * disk is worth more than no backup, and the error says which half worked.
 */
export async function runBackup(): Promise<BackupResult> {
  const settings = getBackupSettings();
  const directory = backupDir();
  await mkdir(directory, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `${FILE_PREFIX}${stamp}${FILE_SUFFIX}`;
  const snapshotPath = join(directory, `${name}.tmp`);
  const path = join(directory, name);

  // Online backup: consistent even though the server is still writing.
  await getDb().backup(snapshotPath);

  try {
    await pipeline(createReadStream(snapshotPath), createGzip(), createWriteStream(path));
  } finally {
    await rm(snapshotPath, { force: true });
  }

  const { size: bytes } = await stat(path);
  const prunedLocal = await pruneLocal(await listLocalBackups(), settings.keep);
  log.info('Snapshot written', { name, bytes, prunedLocal });

  if (!settings.b2Enabled) {
    return {
      name,
      bytes,
      prunedLocal,
      uploadedTo: null,
      prunedRemote: 0,
      message: `Snapshot ${name} written (${bytes} bytes). Backblaze upload is off.`,
    };
  }

  const applicationKey = getApplicationKey();
  if (!applicationKey) {
    throw new Error(
      'Backblaze upload is on but the application key could not be read. Enter it again under Settings → Advanced.'
    );
  }

  const session = await authorize({
    keyId: settings.keyId,
    applicationKey,
    bucket: settings.bucket,
  });

  const remotePrefix = settings.prefix ? `${settings.prefix}/` : '';
  const existing = await listFiles(session, remotePrefix);

  await uploadFile(session, `${remotePrefix}${name}`, await readFile(path));

  // The snapshot is useless without the key that opens the credentials in it.
  // Upload it once; it only changes if someone deletes it.
  if (!existing.some((file) => file.fileName === `${remotePrefix}${SECRET_KEY_NAME}`)) {
    await uploadFile(session, `${remotePrefix}${SECRET_KEY_NAME}`, await readFile(secretKeyPath()));
  }

  // `existing` was listed before this run's upload, so keeping one fewer of
  // the old ones leaves `keep` in the bucket once the new one is counted.
  const prunedRemote = await pruneRemote(session, existing, settings.keep - 1);
  log.info('Snapshot uploaded', { name, bucket: settings.bucket, prunedRemote });

  return {
    name,
    bytes,
    prunedLocal,
    uploadedTo: `${settings.bucket}/${remotePrefix}${name}`,
    prunedRemote,
    message: `Snapshot ${name} written (${bytes} bytes) and uploaded to ${settings.bucket}.`,
  };
}
