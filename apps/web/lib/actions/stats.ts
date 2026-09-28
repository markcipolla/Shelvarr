'use server';

import { queryOne } from '@/lib/db';

export interface SidebarCounts {
  books: number;
  unmatched: number;
  comics: number;
  comicIssues: number;
}

export async function getSidebarCounts(): Promise<SidebarCounts> {
  const counts = queryOne<{ matched: number; unmatched: number }>(`
    SELECT
      SUM(CASE WHEN metadata_source IS NOT NULL THEN 1 ELSE 0 END) as matched,
      SUM(CASE WHEN metadata_source IS NULL THEN 1 ELSE 0 END) as unmatched
    FROM books
  `, []);

  // Volumes on the shelf, and the issues of them we actually hold files for.
  const comics = queryOne<{ volumes: number; issues: number }>(`
    SELECT
      COUNT(*) as volumes,
      COALESCE(SUM(issues_downloaded), 0) as issues
    FROM comics
    WHERE deleted_at IS NULL
  `, []);

  return {
    books: counts?.matched || 0,
    unmatched: counts?.unmatched || 0,
    comics: comics?.volumes || 0,
    comicIssues: comics?.issues || 0,
  };
}
