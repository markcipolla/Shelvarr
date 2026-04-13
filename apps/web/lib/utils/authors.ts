/**
 * Safely parse authors from database
 * Handles both plain strings and JSON arrays
 */
export function parseAuthors(authorsField: string | null | undefined): string[] {
  if (!authorsField) {
    return [];
  }

  // If it's already an array (shouldn't happen but be safe)
  if (Array.isArray(authorsField)) {
    return authorsField;
  }

  // Try to parse as JSON first
  try {
    const parsed = JSON.parse(authorsField);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    // If parsed but not an array, wrap it
    return [String(parsed)];
  } catch {
    // If parsing fails, treat it as a plain string
    // This handles legacy data where authors was stored as a plain string
    return [authorsField];
  }
}

/**
 * Format authors array as a comma-separated string
 */
export function formatAuthors(authorsField: string | null | undefined): string {
  const authors = parseAuthors(authorsField);
  return authors.join(', ');
}
