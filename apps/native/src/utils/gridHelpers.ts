export function padDataForGrid<T extends { id: string }>(
  data: T[],
  columns: number
): (T | { id: string; _placeholder: true })[] {
  const remainder = data.length % columns;
  if (remainder === 0) return data;
  const padding = columns - remainder;
  const placeholders = Array.from({ length: padding }, (_, i) => ({
    id: `_placeholder_${i}`,
    _placeholder: true as const,
  }));
  return [...data, ...placeholders];
}

export function isPlaceholder(item: any): boolean {
  return item._placeholder === true;
}
