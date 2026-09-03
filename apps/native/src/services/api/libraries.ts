import { getApiClient } from './client';
import { Library } from '../../types/api';

export async function fetchLibraries(): Promise<Library[]> {
  const { data } = await getApiClient().get<Library[]>('/api/libraries');
  return data;
}
