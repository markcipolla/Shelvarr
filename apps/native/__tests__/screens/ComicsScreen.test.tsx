import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import ComicsScreen from '../../src/screens/ComicsScreen';
import { fetchComics } from '../../src/services/api/comics';
import { getCachedComics } from '../../src/services/db/comics';
import { useColumns } from '../../src/hooks/useColumns';
import { useSettingsStore } from '../../src/stores/useSettingsStore';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));
jest.mock('../../src/services/api/comics');
jest.mock('../../src/services/db/comics', () => ({
  getCachedComics: jest.fn(),
}));
jest.mock('../../src/hooks/useColumns');
jest.mock('../../src/stores/useSettingsStore');
jest.mock('../../src/components/ComicGridSkeleton', () => {
  const { View } = require('react-native');
  return function MockSkeleton() {
    return <View testID="skeleton" />;
  };
});
jest.mock('../../src/components/ComicCard', () => {
  const { View, Text, TouchableOpacity } = require('react-native');
  return function MockComicCard({ volume, placeholder, onPress }: any) {
    if (placeholder) return <View testID="placeholder" />;
    return (
      <TouchableOpacity testID={`volume-${volume.id}`} onPress={onPress}>
        <Text>{volume.title}</Text>
      </TouchableOpacity>
    );
  };
});
jest.mock('../../src/utils/gridHelpers', () => ({
  padDataForGrid: (data: any[]) => data,
  isPlaceholder: (item: any) => item._placeholder === true,
}));

const mockFetchComics = fetchComics as jest.Mock;
const mockGetCachedComics = getCachedComics as jest.Mock;
const mockUseColumns = useColumns as jest.Mock;
const mockUseSettingsStore = useSettingsStore as unknown as jest.Mock;

const mockNavigation = { navigate: jest.fn() } as any;
const mockRoute = { params: {} } as any;

const makeVolume = (id: number, overrides: any = {}) => ({
  id,
  comicvine_id: 1000 + id,
  title: `Volume ${id}`,
  year: 2020,
  publisher: 'Test Publisher',
  volume_number: 1,
  description: '',
  monitored: true,
  monitor_new_issues: false,
  folder: '/comics',
  issue_count: 10,
  issue_count_monitored: 10,
  issues_downloaded: 5,
  issues_downloaded_monitored: 5,
  total_size: 1024,
  ...overrides,
});

describe('ComicsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCachedComics.mockResolvedValue([]);
    mockUseColumns.mockReturnValue(2);
    mockUseSettingsStore.mockImplementation((selector: any) =>
      selector({ shelvarrUrl: 'http://shelvarr:3000' })
    );
  });

  it('shows "no server configured" message when shelvarrUrl is empty', () => {
    mockUseSettingsStore.mockImplementation((selector: any) => selector({ shelvarrUrl: '' }));
    const { getByText } = render(<ComicsScreen navigation={mockNavigation} route={mockRoute} />);
    expect(getByText(/No Shelvarr server configured/)).toBeTruthy();
  });

  it('shows the skeleton grid while loading with no cache', async () => {
    mockFetchComics.mockReturnValue(new Promise(() => {}));
    const { getByTestId } = render(<ComicsScreen navigation={mockNavigation} route={mockRoute} />);
    await waitFor(() => {
      expect(getByTestId('skeleton')).toBeTruthy();
    });
  });

  it('paints cached comics immediately before the network resolves', async () => {
    mockGetCachedComics.mockResolvedValue([makeVolume(1, { title: 'Cached Batman' })]);
    mockFetchComics.mockReturnValue(new Promise(() => {})); // never resolves

    const { getByText } = render(<ComicsScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Cached Batman')).toBeTruthy();
    });
  });

  it('ignores cache-read errors and still loads from the network', async () => {
    mockGetCachedComics.mockRejectedValue(new Error('cache unavailable'));
    mockFetchComics.mockResolvedValue({
      configured: true,
      volumes: [makeVolume(2, { title: 'Networked Superman' })],
    });

    const { getByText } = render(<ComicsScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Networked Superman')).toBeTruthy();
    });
  });

  it('shows volumes returned by the API', async () => {
    mockFetchComics.mockResolvedValue({
      configured: true,
      volumes: [makeVolume(1, { title: 'Batman' }), makeVolume(2, { title: 'Superman' })],
    });

    const { getByText } = render(<ComicsScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Batman')).toBeTruthy();
      expect(getByText('Superman')).toBeTruthy();
    });
  });

  it('shows "Kapowarr not configured" message when configured:false', async () => {
    mockFetchComics.mockResolvedValue({ configured: false, volumes: [] });

    const { getByText } = render(<ComicsScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText(/Kapowarr is not configured/)).toBeTruthy();
      expect(getByText('Open Settings')).toBeTruthy();
    });
  });

  it('navigates to Settings from the not-configured state', async () => {
    mockFetchComics.mockResolvedValue({ configured: false, volumes: [] });

    const { getByText } = render(<ComicsScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Open Settings')).toBeTruthy();
    });

    fireEvent.press(getByText('Open Settings'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Settings');
  });

  it('shows error text when the API response includes an error', async () => {
    mockFetchComics.mockResolvedValue({
      configured: true,
      volumes: [],
      error: 'Kapowarr unreachable',
    });

    const { getByText } = render(<ComicsScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Kapowarr unreachable')).toBeTruthy();
    });
  });

  it('shows error text when the request throws', async () => {
    mockFetchComics.mockRejectedValue(new Error('Network down'));

    const { getByText } = render(<ComicsScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Network down')).toBeTruthy();
    });
  });

  it('falls back to a generic error when rejection is not an Error', async () => {
    mockFetchComics.mockRejectedValue('boom');

    const { getByText } = render(<ComicsScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Failed to load comics')).toBeTruthy();
    });
  });

  it('navigates to ComicDetail when a volume is tapped', async () => {
    mockFetchComics.mockResolvedValue({
      configured: true,
      volumes: [makeVolume(42, { title: 'Batman' })],
    });

    const { getByTestId } = render(<ComicsScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByTestId('volume-42')).toBeTruthy();
    });

    fireEvent.press(getByTestId('volume-42'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ComicDetail', { volumeId: 42 });
  });

  it('shows empty state when configured with zero volumes', async () => {
    mockFetchComics.mockResolvedValue({ configured: true, volumes: [] });

    const { getByText } = render(<ComicsScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('No comics found.')).toBeTruthy();
    });
  });
});
