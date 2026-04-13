import { getApiClient } from './client';
import { PagedResponse, Series } from '../../types/komga';
import { PAGE_SIZE } from '../../utils/constants';

export async function fetchSeriesForLibrary(
  libraryId: string,
  page: number = 0
): Promise<PagedResponse<Series>> {
  const { data } = await getApiClient().get<PagedResponse<Series>>(
    `/api/v1/series`,
    { params: { library_id: libraryId, page, size: PAGE_SIZE, sort: 'metadata.titleSort,asc' } }
  );
  return data;
}

export async function fetchSeries(seriesId: string): Promise<Series> {
  const { data } = await getApiClient().get<Series>(`/api/v1/series/${seriesId}`);
  return data;
}
