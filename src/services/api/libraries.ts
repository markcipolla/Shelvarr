import { getApiClient } from './client';
import { Library } from '../../types/komga';

export async function fetchLibraries(): Promise<Library[]> {
  const { data } = await getApiClient().get<Library[]>('/api/v1/libraries');
  return data;
}
