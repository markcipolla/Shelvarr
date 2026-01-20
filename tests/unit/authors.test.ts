import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseAuthors, formatAuthors } from '../../lib/utils/authors.js';

describe('Authors Utilities', () => {
  describe('parseAuthors', () => {
    it('should parse JSON array of authors', () => {
      const result = parseAuthors('["Adrian Tchaikovsky","Brandon Sanderson"]');
      assert.deepStrictEqual(result, ['Adrian Tchaikovsky', 'Brandon Sanderson']);
    });

    it('should handle plain string author (legacy format)', () => {
      const result = parseAuthors('Adrian Tchaikovsky');
      assert.deepStrictEqual(result, ['Adrian Tchaikovsky']);
    });

    it('should handle single-element JSON array', () => {
      const result = parseAuthors('["Adrian Tchaikovsky"]');
      assert.deepStrictEqual(result, ['Adrian Tchaikovsky']);
    });

    it('should handle empty string', () => {
      const result = parseAuthors('');
      assert.deepStrictEqual(result, []);
    });

    it('should handle null', () => {
      const result = parseAuthors(null);
      assert.deepStrictEqual(result, []);
    });

    it('should handle undefined', () => {
      const result = parseAuthors(undefined);
      assert.deepStrictEqual(result, []);
    });

    it('should handle malformed JSON as plain string', () => {
      const result = parseAuthors('[Adrian Tchaikovsky');
      assert.deepStrictEqual(result, ['[Adrian Tchaikovsky']);
    });

    it('should handle JSON array with empty strings', () => {
      const result = parseAuthors('["Adrian Tchaikovsky","","Brandon Sanderson"]');
      assert.deepStrictEqual(result, ['Adrian Tchaikovsky', '', 'Brandon Sanderson']);
    });

    it('should handle JSON with non-string values by converting to string', () => {
      const result = parseAuthors('123');
      assert.deepStrictEqual(result, ['123']);
    });

    it('should handle whitespace-only string', () => {
      const result = parseAuthors('   ');
      assert.deepStrictEqual(result, ['   ']);
    });

    it('should preserve author names with special characters', () => {
      const result = parseAuthors('["O\'Brien, Tim","García Márquez, Gabriel"]');
      assert.deepStrictEqual(result, ["O'Brien, Tim", "García Márquez, Gabriel"]);
    });
  });

  describe('formatAuthors', () => {
    it('should format JSON array as comma-separated string', () => {
      const result = formatAuthors('["Adrian Tchaikovsky","Brandon Sanderson"]');
      assert.strictEqual(result, 'Adrian Tchaikovsky, Brandon Sanderson');
    });

    it('should format plain string author (legacy format)', () => {
      const result = formatAuthors('Adrian Tchaikovsky');
      assert.strictEqual(result, 'Adrian Tchaikovsky');
    });

    it('should format single author JSON array', () => {
      const result = formatAuthors('["Adrian Tchaikovsky"]');
      assert.strictEqual(result, 'Adrian Tchaikovsky');
    });

    it('should return empty string for null', () => {
      const result = formatAuthors(null);
      assert.strictEqual(result, '');
    });

    it('should return empty string for undefined', () => {
      const result = formatAuthors(undefined);
      assert.strictEqual(result, '');
    });

    it('should return empty string for empty string', () => {
      const result = formatAuthors('');
      assert.strictEqual(result, '');
    });

    it('should handle malformed JSON as plain string', () => {
      const result = formatAuthors('[Adrian Tchaikovsky');
      assert.strictEqual(result, '[Adrian Tchaikovsky');
    });

    it('should format three or more authors', () => {
      const result = formatAuthors('["Author One","Author Two","Author Three"]');
      assert.strictEqual(result, 'Author One, Author Two, Author Three');
    });

    it('should preserve special characters in formatted output', () => {
      const result = formatAuthors('["O\'Brien, Tim","García Márquez, Gabriel"]');
      assert.strictEqual(result, "O'Brien, Tim, García Márquez, Gabriel");
    });

    it('should handle empty array', () => {
      const result = formatAuthors('[]');
      assert.strictEqual(result, '');
    });
  });

  describe('Integration: parseAuthors and formatAuthors', () => {
    it('should be idempotent for properly formatted JSON', () => {
      const input = '["Adrian Tchaikovsky","Brandon Sanderson"]';
      const parsed = parseAuthors(input);
      const formatted = formatAuthors(JSON.stringify(parsed));
      assert.strictEqual(formatted, 'Adrian Tchaikovsky, Brandon Sanderson');
    });

    it('should handle round-trip conversion', () => {
      const original = ['Author A', 'Author B', 'Author C'];
      const jsonString = JSON.stringify(original);
      const parsed = parseAuthors(jsonString);
      const formatted = formatAuthors(jsonString);
      assert.deepStrictEqual(parsed, original);
      assert.strictEqual(formatted, 'Author A, Author B, Author C');
    });
  });
});
