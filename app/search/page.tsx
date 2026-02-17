import { searchHardcover, type HardcoverSearchResult } from '@/lib/actions/search';
import { isBookWanted } from '@/lib/actions/wanted';
import { isHardcoverConfigured } from '@/lib/actions/settings';
import { SearchPage } from '@/components/search/SearchPage';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export interface SearchResultWithStatus extends HardcoverSearchResult {
  isWanted: boolean;
}

export default async function SearchRoute({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const query = q?.trim() || '';

  const configured = await isHardcoverConfigured();

  let results: SearchResultWithStatus[] = [];
  if (query && configured) {
    const hardcoverResults = await searchHardcover(query, 20);
    results = await Promise.all(
      hardcoverResults.map(async (r) => ({
        ...r,
        isWanted: await isBookWanted(r.hardcoverId, undefined, r.title),
      }))
    );
  }

  return <SearchPage initialQuery={query} initialResults={results} isConfigured={configured} />;
}
