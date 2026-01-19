import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sanitizeHtml, containsHtml } from '../../lib/utils/sanitize.js';

describe('Sanitize Utilities', () => {
  describe('sanitizeHtml', () => {
    it('should allow basic formatting tags', () => {
      const html = '<b>bold</b> and <i>italic</i>';
      const result = sanitizeHtml(html);
      assert.strictEqual(result, '<b>bold</b> and <i>italic</i>');
    });

    it('should allow em and strong tags', () => {
      const html = '<em>emphasis</em> and <strong>strong</strong>';
      const result = sanitizeHtml(html);
      assert.strictEqual(result, '<em>emphasis</em> and <strong>strong</strong>');
    });

    it('should allow list tags', () => {
      const html = '<ul><li>item 1</li><li>item 2</li></ul>';
      const result = sanitizeHtml(html);
      assert.strictEqual(result, '<ul><li>item 1</li><li>item 2</li></ul>');
    });

    it('should allow p tags', () => {
      const html = '<p>paragraph one</p><p>paragraph two</p>';
      const result = sanitizeHtml(html);
      assert.strictEqual(result, '<p>paragraph one</p><p>paragraph two</p>');
    });

    it('should convert br tags to standard format', () => {
      const html = 'line one<br>line two<br/>line three<br />';
      const result = sanitizeHtml(html);
      assert.strictEqual(result, 'line one<br>line two<br>line three<br>');
    });

    it('should strip disallowed tags like script', () => {
      const html = '<p>Safe content</p><script>alert("xss")</script>';
      const result = sanitizeHtml(html);
      assert.strictEqual(result, '<p>Safe content</p>alert("xss")');
    });

    it('should strip disallowed tags like a with href', () => {
      const html = 'Click <a href="http://example.com">here</a> for more';
      const result = sanitizeHtml(html);
      assert.strictEqual(result, 'Click here for more');
    });

    it('should strip style and class attributes', () => {
      const html = '<b style="color:red" class="highlight">text</b>';
      const result = sanitizeHtml(html);
      assert.strictEqual(result, '<b>text</b>');
    });

    it('should strip div and span tags', () => {
      const html = '<div><span>content</span></div>';
      const result = sanitizeHtml(html);
      assert.strictEqual(result, 'content');
    });

    it('should handle nested allowed tags', () => {
      const html = '<p><b>bold in <i>italic</i></b></p>';
      const result = sanitizeHtml(html);
      assert.strictEqual(result, '<p><b>bold in <i>italic</i></b></p>');
    });

    it('should handle malformed tags', () => {
      const html = '<b>unclosed bold';
      const result = sanitizeHtml(html);
      assert.strictEqual(result, '<b>unclosed bold');
    });

    it('should handle empty string', () => {
      const result = sanitizeHtml('');
      assert.strictEqual(result, '');
    });

    it('should handle plain text without tags', () => {
      const text = 'Just some plain text';
      const result = sanitizeHtml(text);
      assert.strictEqual(result, 'Just some plain text');
    });

    it('should strip img tags', () => {
      const html = '<p>Text with <img src="image.jpg" alt="image"> in it</p>';
      const result = sanitizeHtml(html);
      assert.strictEqual(result, '<p>Text with  in it</p>');
    });

    it('should strip iframe tags', () => {
      const html = '<p>Text</p><iframe src="evil.com"></iframe>';
      const result = sanitizeHtml(html);
      assert.strictEqual(result, '<p>Text</p>');
    });

    it('should handle ordered lists', () => {
      const html = '<ol><li>first</li><li>second</li></ol>';
      const result = sanitizeHtml(html);
      assert.strictEqual(result, '<ol><li>first</li><li>second</li></ol>');
    });
  });

  describe('containsHtml', () => {
    it('should return true for strings with HTML tags', () => {
      assert.strictEqual(containsHtml('<p>text</p>'), true);
      assert.strictEqual(containsHtml('<b>bold</b>'), true);
      assert.strictEqual(containsHtml('text <br> more'), true);
    });

    it('should return false for plain text', () => {
      assert.strictEqual(containsHtml('Just plain text'), false);
      assert.strictEqual(containsHtml('No tags here'), false);
    });

    it('should return false for empty string', () => {
      assert.strictEqual(containsHtml(''), false);
    });

    it('should return true for self-closing tags', () => {
      assert.strictEqual(containsHtml('<img src="test.jpg"/>'), true);
      assert.strictEqual(containsHtml('<br/>'), true);
    });

    it('should handle angle brackets that are not tags', () => {
      // Less-than/greater-than are still detected as potential tags
      assert.strictEqual(containsHtml('5 < 10'), false);
      assert.strictEqual(containsHtml('10 > 5'), false);
    });

    it('should detect malformed tags', () => {
      assert.strictEqual(containsHtml('<div>unclosed'), true);
    });
  });
});
