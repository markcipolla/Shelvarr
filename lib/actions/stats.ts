'use server';

import { queryOne } from '@/lib/db';

export interface SidebarCounts {
  books: number;
  unmatched: number;
}

export async function getSidebarCounts(): Promise<SidebarCounts> {
  const counts = queryOne<{ total: number; unmatched: number }>(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN metadata_source IS NULL THEN 1 ELSE 0 END) as unmatched
    FROM books
  `, []);

  return {
    books: counts?.total || 0,
    unmatched: counts?.unmatched || 0,
  };
}
