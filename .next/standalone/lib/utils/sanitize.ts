/**
 * Sanitize HTML to allow only safe tags
 */

const ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'br', 'p', 'ul', 'ol', 'li'];

/**
 * Sanitize HTML string to only allow safe tags
 * Removes all attributes and disallowed tags
 */
export function sanitizeHtml(html: string): string {
  // Replace allowed tags with placeholders
  let result = html;

  // Create a map of allowed tag patterns
  const tagPatterns: Array<{ open: RegExp; close: RegExp; openReplace: string; closeReplace: string }> = ALLOWED_TAGS.map(tag => ({
    open: new RegExp(`<${tag}(\\s[^>]*)?>`, 'gi'),
    close: new RegExp(`</${tag}>`, 'gi'),
    openReplace: `<${tag}>`,
    closeReplace: `</${tag}>`,
  }));

  // Handle self-closing br tags
  result = result.replace(/<br\s*\/?>/gi, '\n__BR__\n');

  // Temporarily replace allowed tags
  const placeholders: Array<{ placeholder: string; replacement: string }> = [];
  let placeholderIndex = 0;

  for (const pattern of tagPatterns) {
    if (pattern.openReplace === '<br>') continue; // Already handled

    result = result.replace(pattern.open, () => {
      const placeholder = `__TAG_OPEN_${placeholderIndex}__`;
      placeholders.push({ placeholder, replacement: pattern.openReplace });
      placeholderIndex++;
      return placeholder;
    });

    result = result.replace(pattern.close, () => {
      const placeholder = `__TAG_CLOSE_${placeholderIndex}__`;
      placeholders.push({ placeholder, replacement: pattern.closeReplace });
      placeholderIndex++;
      return placeholder;
    });
  }

  // Strip all remaining HTML tags
  result = result.replace(/<[^>]*>/g, '');

  // Restore allowed tags
  for (const { placeholder, replacement } of placeholders) {
    result = result.replace(new RegExp(placeholder, 'g'), replacement);
  }

  // Restore br tags
  result = result.replace(/\n?__BR__\n?/g, '<br>');

  return result;
}

/**
 * Check if a string contains HTML tags
 */
export function containsHtml(text: string): boolean {
  return /<[^>]+>/.test(text);
}
