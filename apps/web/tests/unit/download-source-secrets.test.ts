/**
 * Credentials at rest for download sources (E1-7).
 *
 * The interesting case is not the happy path — it is the database that
 * already exists. People are running Shelvarr with a Z-Library password
 * sitting in `download_source_config.credentials` as plaintext JSON, and an
 * upgrade has to pick those up, not ignore them and not fall over on them.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  initDatabase,
  closeDatabase,
  execute,
  queryOne,
  getDownloadSourceConfig,
  getDownloadSourceConfigs,
  upsertDownloadSourceConfig,
  getSourceNetworkSettings,
  setSourceNetworkSettings,
  isSourceEnabled,
  encryptSecret,
  decryptSecret,
  isEncrypted,
  secretKeyPath,
} from '@shelvarr/db';

let dataDir: string;

/** What is actually on disk, bypassing the decrypting read path. */
function storedCredentials(source: string): string | null {
  return (
    queryOne<{ credentials: string | null }>(
      'SELECT credentials FROM download_source_config WHERE source = ?',
      [source]
    )?.credentials ?? null
  );
}

function storedProxy(source: string): string | null {
  return (
    queryOne<{ proxy_url: string | null }>(
      'SELECT proxy_url FROM download_source_config WHERE source = ?',
      [source]
    )?.proxy_url ?? null
  );
}

describe('download source secrets', () => {
  before(() => {
    dataDir = join(tmpdir(), `shelvarr-secrets-${Date.now()}`);
    mkdirSync(dataDir, { recursive: true });
    initDatabase(join(dataDir, 'test.db'), { dataDir });
  });

  after(() => {
    closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    execute('DELETE FROM download_source_config', []);
  });

  describe('the key in the data directory', () => {
    it('is created on first use, and only readable by its owner', () => {
      // Touched by any encrypt/decrypt, which the tests above have done.
      encryptSecret('anything');

      const path = secretKeyPath();
      assert.ok(existsSync(path), `expected a key at ${path}`);
      assert.strictEqual(path, join(dataDir, '.secret-key'));
      assert.strictEqual(statSync(path).mode & 0o777, 0o600);
      assert.match(readFileSync(path, 'utf-8').trim(), /^[0-9a-f]{64}$/);
    });

    it('round-trips a value, and produces a different ciphertext each time', () => {
      const first = encryptSecret('hunter2');
      const second = encryptSecret('hunter2');

      assert.notStrictEqual(first, second, 'a fixed nonce would leak equal passwords');
      assert.ok(isEncrypted(first));
      assert.strictEqual(decryptSecret(first), 'hunter2');
      assert.strictEqual(decryptSecret(second), 'hunter2');
    });

    it('passes a plaintext value through untouched, so reads are idempotent', () => {
      assert.strictEqual(decryptSecret('{"email":"a@b.c"}'), '{"email":"a@b.c"}');
      assert.strictEqual(isEncrypted('{"email":"a@b.c"}'), false);
    });

    it('reports tampered-with ciphertext rather than returning garbage', () => {
      const encrypted = encryptSecret('hunter2');
      // Flip the last byte of the body; GCM's tag should catch it.
      const broken = encrypted.slice(0, -1) + (encrypted.endsWith('A') ? 'B' : 'A');
      assert.strictEqual(decryptSecret(broken), null);
    });
  });

  describe('writing credentials', () => {
    it('never puts the password in the column', () => {
      upsertDownloadSourceConfig('zlibrary', true, { email: 'reader@example.com', password: 'hunter2' });

      const stored = storedCredentials('zlibrary');
      assert.ok(stored);
      assert.ok(isEncrypted(stored));
      assert.ok(!stored.includes('hunter2'));
      assert.ok(!stored.includes('reader@example.com'));
    });

    it('gives the caller the credentials back in the clear', () => {
      upsertDownloadSourceConfig('zlibrary', true, { email: 'reader@example.com', password: 'hunter2' });

      const config = getDownloadSourceConfig('zlibrary');
      assert.deepStrictEqual(JSON.parse(config!.credentials!), {
        email: 'reader@example.com',
        password: 'hunter2',
      });
    });

    it('clears credentials when none are given', () => {
      upsertDownloadSourceConfig('zlibrary', true, { password: 'hunter2' });
      upsertDownloadSourceConfig('zlibrary', true, undefined);

      assert.strictEqual(storedCredentials('zlibrary'), null);
      assert.strictEqual(getDownloadSourceConfig('zlibrary')!.credentials, null);
    });
  });

  describe('a database that predates encryption', () => {
    it('migrates plaintext credentials the first time they are read', () => {
      execute(
        `INSERT INTO download_source_config (source, enabled, credentials)
         VALUES ('zlibrary', 1, '{"email":"reader@example.com","password":"hunter2"}')`,
        []
      );
      assert.ok(storedCredentials('zlibrary')!.includes('hunter2'), 'precondition: plaintext on disk');

      // The read hands back exactly what was there...
      const config = getDownloadSourceConfig('zlibrary');
      assert.deepStrictEqual(JSON.parse(config!.credentials!), {
        email: 'reader@example.com',
        password: 'hunter2',
      });

      // ...and the plaintext is gone from the file behind it.
      const stored = storedCredentials('zlibrary');
      assert.ok(isEncrypted(stored!));
      assert.ok(!stored!.includes('hunter2'));

      // A second read still works, now off the encrypted value.
      assert.deepStrictEqual(
        JSON.parse(getDownloadSourceConfig('zlibrary')!.credentials!),
        { email: 'reader@example.com', password: 'hunter2' }
      );
    });

    it('migrates every row when the whole list is read', () => {
      execute(`INSERT INTO download_source_config (source, enabled, credentials) VALUES ('zlibrary', 1, '{"password":"one"}')`, []);
      execute(`INSERT INTO download_source_config (source, enabled, credentials) VALUES ('annas', 1, '{"apiKey":"two"}')`, []);
      execute(`INSERT INTO download_source_config (source, enabled) VALUES ('libgen', 1)`, []);

      const configs = getDownloadSourceConfigs();
      assert.strictEqual(configs.length, 3);
      assert.strictEqual(JSON.parse(configs.find((c) => c.source === 'zlibrary')!.credentials!).password, 'one');
      assert.strictEqual(JSON.parse(configs.find((c) => c.source === 'annas')!.credentials!).apiKey, 'two');
      assert.strictEqual(configs.find((c) => c.source === 'libgen')!.credentials, null);

      assert.ok(isEncrypted(storedCredentials('zlibrary')!));
      assert.ok(isEncrypted(storedCredentials('annas')!));
      assert.strictEqual(storedCredentials('libgen'), null);
    });

    it('migrates a plaintext proxy URL too, since it can carry a password', () => {
      execute(
        `INSERT INTO download_source_config (source, enabled, proxy_url)
         VALUES ('annas', 1, 'socks5://someone:letmein@10.0.0.2:1080')`,
        []
      );

      assert.strictEqual(
        getSourceNetworkSettings('annas').proxyUrl,
        'socks5://someone:letmein@10.0.0.2:1080'
      );

      const stored = storedProxy('annas');
      assert.ok(isEncrypted(stored!));
      assert.ok(!stored!.includes('letmein'));
    });

    it('reads a row that was never given credentials at all', () => {
      execute(`INSERT INTO download_source_config (source, enabled) VALUES ('libgen', 1)`, []);
      const config = getDownloadSourceConfig('libgen');
      assert.strictEqual(config!.credentials, null);
      assert.strictEqual(config!.proxy_url, null);
      assert.strictEqual(config!.enabled, 1);
    });
  });

  describe('when the key no longer matches', () => {
    it('reports no credentials rather than throwing', () => {
      upsertDownloadSourceConfig('zlibrary', true, { password: 'hunter2' });

      // Simulate a restored database whose data directory (and therefore key)
      // was left behind: keep the ciphertext, replace it with something the
      // current key cannot open.
      const foreign = 'enc.v1.' + Buffer.from('not a real ciphertext at all').toString('base64url');
      execute('UPDATE download_source_config SET credentials = ? WHERE source = ?', [foreign, 'zlibrary']);

      const config = getDownloadSourceConfig('zlibrary');
      assert.strictEqual(config!.credentials, null);
      // The unreadable value is left alone, in case the key comes back.
      assert.strictEqual(storedCredentials('zlibrary'), foreign);
    });
  });

  describe('network settings', () => {
    it('stores a proxy without touching credentials or enabled state', () => {
      upsertDownloadSourceConfig('zlibrary', false, { password: 'hunter2' });

      setSourceNetworkSettings('zlibrary', { proxyUrl: 'http://127.0.0.1:3128', userAgent: 'Shelvarr/1.0' });

      const config = getDownloadSourceConfig('zlibrary');
      assert.strictEqual(config!.enabled, 0);
      assert.strictEqual(JSON.parse(config!.credentials!).password, 'hunter2');
      assert.strictEqual(config!.proxy_url, 'http://127.0.0.1:3128');
      assert.strictEqual(config!.user_agent, 'Shelvarr/1.0');
      assert.ok(isEncrypted(storedProxy('zlibrary')!));
    });

    it('creates a row without changing whether the source is searched', () => {
      // No row at all: a shadow library is off by default (E1-8), and setting
      // a proxy must not quietly turn it on.
      assert.strictEqual(isSourceEnabled('annas'), false);

      setSourceNetworkSettings('annas', { proxyUrl: 'socks5://127.0.0.1:1080' });

      assert.strictEqual(isSourceEnabled('annas'), false);
      assert.strictEqual(getSourceNetworkSettings('annas').proxyUrl, 'socks5://127.0.0.1:1080');
    });

    it('clears a proxy when given an empty value', () => {
      setSourceNetworkSettings('annas', { proxyUrl: 'socks5://127.0.0.1:1080', userAgent: 'x' });
      setSourceNetworkSettings('annas', { proxyUrl: '', userAgent: '' });

      assert.deepStrictEqual(getSourceNetworkSettings('annas'), { proxyUrl: null, userAgent: null });
    });

    it('reports nothing configured for a source with no row', () => {
      assert.deepStrictEqual(getSourceNetworkSettings('getcomics'), { proxyUrl: null, userAgent: null });
    });
  });

  describe('the key file itself', () => {
    it('is not overwritten once it exists', () => {
      const before = readFileSync(secretKeyPath(), 'utf-8');
      encryptSecret('something else');
      assert.strictEqual(readFileSync(secretKeyPath(), 'utf-8'), before);
    });

    it('survives being written by a racing process', () => {
      // `wx` means the loser of the race reads the winner's key rather than
      // clobbering it, which is what keeps two server processes agreeing.
      const path = secretKeyPath();
      const existing = readFileSync(path, 'utf-8');
      assert.throws(() => writeFileSync(path, 'other', { flag: 'wx' }));
      assert.strictEqual(readFileSync(path, 'utf-8'), existing);
    });
  });
});
