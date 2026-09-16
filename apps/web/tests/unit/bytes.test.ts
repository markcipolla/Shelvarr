import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatBytes, formatByteProgress } from '../../lib/utils/bytes.js';

describe('Byte Formatting', () => {
  describe('formatBytes', () => {
    it('leaves small counts in bytes', () => {
      assert.strictEqual(formatBytes(0), '0 B');
      assert.strictEqual(formatBytes(512), '512 B');
    });

    it('steps up through the units', () => {
      assert.strictEqual(formatBytes(1024), '1.0 KB');
      assert.strictEqual(formatBytes(1536), '1.5 KB');
      assert.strictEqual(formatBytes(48 * 1024 * 1024), '48.0 MB');
      assert.strictEqual(formatBytes(3 * 1024 ** 3), '3.0 GB');
      assert.strictEqual(formatBytes(2 * 1024 ** 4), '2.0 TB');
    });

    it('gives nothing for counts that are not a size', () => {
      assert.strictEqual(formatBytes(-1), '');
      assert.strictEqual(formatBytes(Number.NaN), '');
    });
  });

  describe('formatByteProgress', () => {
    it('reads as a fraction of the total with a percentage', () => {
      assert.strictEqual(
        formatByteProgress(12 * 1024 * 1024, 48 * 1024 * 1024),
        '12.0 MB of 48.0 MB (25%)'
      );
    });

    it('caps the percentage when more arrives than promised', () => {
      assert.strictEqual(formatByteProgress(2048, 1024), '2.0 KB of 1.0 KB (100%)');
    });

    it('falls back to the bytes so far when the total is unknown', () => {
      assert.strictEqual(formatByteProgress(2048, null), '2.0 KB');
      assert.strictEqual(formatByteProgress(2048, 0), '2.0 KB');
    });

    it('says nothing before any bytes arrive', () => {
      assert.strictEqual(formatByteProgress(0, null), '');
    });
  });
});
