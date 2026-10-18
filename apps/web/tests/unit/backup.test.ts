/**
 * Database backups: the snapshot, local retention, and the Backblaze upload.
 *
 * Backblaze is stubbed at `fetch` — the point of the test is that the right
 * calls are made with the right file, not that B2 answers them.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';

describe('Backups', () => {
  let backup: typeof import('@shelvarr/services/backup/index');
  let db: typeof import('../../lib/db/index.js');
  let root: string;
  const realFetch = globalThis.fetch;

  before(async () => {
    root = '/tmp/shelvarr-backup-test-' + Date.now();
    process.env['DATA_DIR'] = root;
    process.env['DB_PATH'] = join(root, 'test.db');
    mkdirSync(root, { recursive: true });

    db = await import('../../lib/db/index.js');
    db.initDatabase();

    backup = await import('@shelvarr/services/backup/index');
  });

  after(() => {
    globalThis.fetch = realFetch;
    rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    globalThis.fetch = realFetch;
    db.getDb().exec('DELETE FROM settings;');
    rmSync(backup.backupDir(), { recursive: true, force: true });
  });

  it('writes a gzipped snapshot of the database', async () => {
    const result = await backup.runBackup();

    assert.match(result.name, /^shelvarr-.*\.db\.gz$/);
    assert.strictEqual(result.uploadedTo, null);

    const backups = await backup.listLocalBackups();
    assert.strictEqual(backups.length, 1);
    assert.strictEqual(backups[0]!.name, result.name);

    // A readable SQLite file, not a torn copy of one.
    const { readFileSync } = await import('fs');
    const unzipped = gunzipSync(readFileSync(backups[0]!.path));
    assert.strictEqual(unzipped.subarray(0, 15).toString(), 'SQLite format 3');

    // Nothing left behind from the snapshot step.
    assert.ok(!readdirSync(backup.backupDir()).some((name) => name.endsWith('.tmp')));
  });

  it('keeps only the newest snapshots', async () => {
    backup.saveBackupSettings({ b2Enabled: false, keyId: '', bucket: '', prefix: '', keep: 2 });

    mkdirSync(backup.backupDir(), { recursive: true });
    for (const stamp of ['2000-01-01', '2000-01-02', '2000-01-03']) {
      writeFileSync(join(backup.backupDir(), `shelvarr-${stamp}.db.gz`), 'old');
    }

    const result = await backup.runBackup();

    assert.strictEqual(result.prunedLocal, 2);
    const names = (await backup.listLocalBackups()).map((item) => item.name);
    // The new one, plus the newest of the old ones.
    assert.deepStrictEqual(names, [result.name, 'shelvarr-2000-01-03.db.gz']);
  });

  it('refuses to switch Backblaze on without credentials', () => {
    assert.throws(
      () =>
        backup.saveBackupSettings({
          b2Enabled: true,
          keyId: 'key',
          bucket: '',
          prefix: '',
          applicationKey: 'secret',
          keep: 7,
        }),
      /key ID, an application key and a bucket/
    );
    assert.strictEqual(backup.getBackupSettings().b2Enabled, false);
  });

  it('uploads the snapshot and the secret key, and prunes the bucket', async () => {
    backup.saveBackupSettings({
      b2Enabled: true,
      keyId: 'keyid',
      bucket: 'shelvarr-backups',
      prefix: '/nightly/',
      applicationKey: 'app-key',
      keep: 2,
    });

    // The key is not readable from the settings table in the clear.
    const stored = db.getDb()
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('backup_b2_application_key') as { value: string };
    assert.ok(!stored.value.includes('app-key'));

    const calls: Array<{ url: string; body: unknown; headers: Record<string, string> }> = [];
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
      calls.push({ url, body, headers });

      if (url.endsWith('b2_authorize_account')) {
        assert.strictEqual(
          headers['Authorization'],
          'Basic ' + Buffer.from('keyid:app-key').toString('base64')
        );
        return json({
          accountId: 'account',
          authorizationToken: 'session-token',
          apiInfo: { storageApi: { apiUrl: 'https://api.b2', bucketId: null, bucketName: null } },
        });
      }
      if (url.endsWith('b2_list_buckets')) {
        return json({ buckets: [{ bucketId: 'bucket-1', bucketName: 'shelvarr-backups' }] });
      }
      if (url.endsWith('b2_list_file_versions')) {
        return json({
          files: [
            { fileName: 'nightly/shelvarr-2000-01-01.db.gz', fileId: 'f1', contentLength: 1, uploadTimestamp: 1 },
            { fileName: 'nightly/shelvarr-2000-01-02.db.gz', fileId: 'f2', contentLength: 1, uploadTimestamp: 2 },
          ],
        });
      }
      if (url.endsWith('b2_get_upload_url')) {
        return json({ uploadUrl: 'https://upload.b2/file', authorizationToken: 'upload-token' });
      }
      if (url.startsWith('https://upload.b2')) return json({ fileName: headers['X-Bz-File-Name'] });
      if (url.endsWith('b2_delete_file_version')) return json({});

      throw new Error(`Unexpected call to ${url}`);
    }) as typeof fetch;

    const result = await backup.runBackup();

    assert.strictEqual(result.uploadedTo, `shelvarr-backups/nightly/${result.name}`);

    const uploaded = calls
      .filter((call) => call.url.startsWith('https://upload.b2'))
      .map((call) => decodeURIComponent(call.headers['X-Bz-File-Name']!));
    assert.deepStrictEqual(uploaded, [`nightly/${result.name}`, 'nightly/secret-key']);

    // keep=2, one just uploaded, so exactly the oldest of the two goes.
    const deleted = calls
      .filter((call) => call.url.endsWith('b2_delete_file_version'))
      .map((call) => (call.body as { fileId: string }).fileId);
    assert.deepStrictEqual(deleted, ['f1']);
    assert.strictEqual(result.prunedRemote, 1);
  });
});
