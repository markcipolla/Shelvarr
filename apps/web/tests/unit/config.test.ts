import { describe, it } from 'node:test';
import assert from 'node:assert';
import config from '../../lib/config/index.js';

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
    const expected = ['.epub', '.pdf', '.mobi', '.azw', '.azw3'];
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
    assert.ok('apiKey' in config.komga);
  });

  it('should have rate limits', () => {
    assert.ok(config.rateLimits !== undefined);
    assert.ok(typeof config.rateLimits.hardcover === 'number');
  });

  it('should have a database path', () => {
    assert.ok(typeof config.dbPath === 'string');
  });

  it('should have a data directory', () => {
    assert.ok(config.dataDir);
    assert.strictEqual(typeof config.dataDir, 'string');
  });
});
