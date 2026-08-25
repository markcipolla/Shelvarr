import {
  searchHardcover,
  searchLocalBooks,
  searchLocalComicsList,
  type HardcoverSearchResult,
} from '@/lib/actions/search';
import { isBookWanted } from '@/lib/actions/wanted';
import { isHardcoverConfigured } from '@/lib/actions/settings';
import { SearchPage } from '@/components/search/SearchPage';
import type { Book } from '@/types';
import type { ComicVolumeSummary } from '@shelvarr/types';

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

  let hardcoverResults: SearchResultWithStatus[] = [];
  let localBooks: Book[] = [];
  let localComics: ComicVolumeSummary[] = [];

  if (query) {
    const [books, comics, hardcover] = await Promise.all([
      searchLocalBooks(query, 20),
      searchLocalComicsList(query, 20),
      configured ? searchHardcover(query, 20) : Promise.resolve([]),
    ]);
    localBooks = books;
    localComics = comics;
    hardcoverResults = await Promise.all(
      hardcover.map(async (r) => ({
        ...r,
        isWanted: await isBookWanted(r.hardcoverId, undefined, r.title),
      }))
    );
  }

  return (
    <SearchPage
      initialQuery={query}
      initialResults={hardcoverResults}
      initialLocalBooks={localBooks}
      initialLocalComics={localComics}
      isConfigured={configured}
    />
  );
}
