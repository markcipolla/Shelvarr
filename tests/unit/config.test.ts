import { describe, it } from 'node:test';
import assert from 'node:assert';
import config from '../../src/config/index.js';

describe('Config', () => {
  it('should have default values', () => {
    assert.strictEqual(typeof config.port, 'number');
    assert.ok(config.port > 0);
    assert.strictEqual(typeof config.env, 'string');
    assert.strictEqual(typeof config.libraryRoot, 'string');
    assert.ok(Array.isArray(config.supportedExtensions));
    assert.ok(config.supportedExtensions.includes('.epub'));
    assert.ok(config.supportedExtensions.includes('.pdf'));
  });

  it('should have supported extensions', () => {
    const expected = ['.epub', '.pdf', '.cbz', '.cbr', '.mobi', '.azw', '.azw3'];
    for (const ext of expected) {
      assert.ok(
        config.supportedExtensions.includes(ext),
        `Expected ${ext} to be in supported extensions`
      );
    }
  });

  it('should have komga config structure', () => {
    assert.ok(config.komga !== undefined);
    assert.ok('url' in config.komga);
    assert.ok('username' in config.komga);
    assert.ok('password' in config.komga);
  });

  it('should have rate limits', () => {
    assert.ok(config.rateLimits !== undefined);
    assert.ok(typeof config.rateLimits.googleBooks === 'number');
    assert.ok(typeof config.rateLimits.openLibrary === 'number');
  });

  it('should have a database URL', () => {
    assert.ok(config.databaseUrl);
    assert.ok(config.databaseUrl.startsWith('postgresql://'));
  });

  it('should have a data directory', () => {
    assert.ok(config.dataDir);
    assert.strictEqual(typeof config.dataDir, 'string');
  });
});
