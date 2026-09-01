import React from 'react';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import ComicsScreen from '../../src/screens/ComicsScreen';
import { fetchComics } from '../../src/services/api/comics';
import { getCachedComics, searchCachedComics } from '../../src/services/db/comics';
import { useColumns } from '../../src/hooks/useColumns';
import { useSettingsStore } from '../../src/stores/useSettingsStore';
import { useComicDownloadStore } from '../../src/stores/useComicDownloadStore';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));
jest.mock('../../src/services/api/comics');
jest.mock('../../src/services/db/comics', () => ({
  getCachedComics: jest.fn(),
  searchCachedComics: jest.fn(),
}));
jest.mock('../../src/hooks/useColumns');
jest.mock('../../src/stores/useSettingsStore');
jest.mock('../../src/stores/useComicDownloadStore', () => ({
  useComicDownloadStore: { getState: jest.fn(() => ({ downloads: {} })) },
}));
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
const mockSearchCachedComics = searchCachedComics as jest.Mock;
const mockUseColumns = useColumns as jest.Mock;
const mockUseSettingsStore = useSettingsStore as unknown as jest.Mock;
const mockComicDownloadState = useComicDownloadStore.getState as unknown as jest.Mock;

const makeComicDownload = (issueId: number, volumeId: number, volumeTitle: string) => ({
  issueId,
  volumeId,
  kind: 'pdf' as const,
  filePath: `file:///${issueId}.pdf`,
  downloadedAt: issueId,
  volumeTitle,
});

function setComicDownloads(downloads: Record<number, unknown>) {
  mockComicDownloadState.mockReturnValue({ downloads });
}

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
    mockSearchCachedComics.mockResolvedValue([]);
    mockUseColumns.mockReturnValue(2);
    mockUseSettingsStore.mockImplementation((selector: any) =>
      selector({ shelvarrUrl: 'http://shelvarr:3000' })
    );
    setComicDownloads({});
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
      volumes: [makeVolume(2, { title: 'Networked Superman' })],
    });

    const { getByText } = render(<ComicsScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Networked Superman')).toBeTruthy();
    });
  });

  it('shows volumes returned by the API', async () => {
    mockFetchComics.mockResolvedValue({
      volumes: [makeVolume(1, { title: 'Batman' }), makeVolume(2, { title: 'Superman' })],
    });

    const { getByText } = render(<ComicsScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Batman')).toBeTruthy();
      expect(getByText('Superman')).toBeTruthy();
    });
  });

  it('shows error text when the API response includes an error', async () => {
    mockFetchComics.mockResolvedValue({
      volumes: [],
      error: 'Server unreachable',
    });

    const { getByText } = render(<ComicsScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Server unreachable')).toBeTruthy();
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
      volumes: [makeVolume(42, { title: 'Batman' })],
    });

    const { getByTestId } = render(<ComicsScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByTestId('volume-42')).toBeTruthy();
    });

    fireEvent.press(getByTestId('volume-42'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ComicDetail', { volumeId: 42 });
  });

  it('shows the empty state for an empty library', async () => {
    mockFetchComics.mockResolvedValue({ volumes: [] });

    const { getByText } = render(<ComicsScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('No comics found.')).toBeTruthy();
    });
  });

  it('lists volumes with downloaded issues that the cache is missing', async () => {
    // A cached response means the server was unreachable.
    mockFetchComics.mockResolvedValue({
      volumes: [makeVolume(1, { title: 'Cached Batman' })],
      cached: true,
    });
    setComicDownloads({ 5: makeComicDownload(5, 99, 'Downloaded Saga') });

    const { getByText } = render(<ComicsScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Cached Batman')).toBeTruthy();
      expect(getByText('Downloaded Saga')).toBeTruthy();
    });
  });

  it('shows downloaded volumes when nothing is cached and the server is unreachable', async () => {
    mockFetchComics.mockRejectedValue(new Error('offline'));
    setComicDownloads({ 5: makeComicDownload(5, 99, 'Downloaded Saga') });

    const { getByText, queryByText } = render(
      <ComicsScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(getByText('Downloaded Saga')).toBeTruthy();
    });
    expect(queryByText('offline')).toBeNull();
  });
});

describe('ComicsScreen search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetCachedComics.mockResolvedValue([]);
    mockSearchCachedComics.mockResolvedValue([]);
    setComicDownloads({});
    mockUseColumns.mockReturnValue(2);
    mockUseSettingsStore.mockImplementation((selector: any) =>
      selector({ shelvarrUrl: 'http://shelvarr:3000' })
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Advance past the debounce and let the resulting promises settle. */
  async function flushSearch() {
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
  }

  it('loads the library exactly once on mount', async () => {
    mockFetchComics.mockResolvedValue({ volumes: [] });

    render(<ComicsScreen navigation={mockNavigation} route={mockRoute} />);
    await act(async () => {});

    expect(mockFetchComics).toHaveBeenCalledTimes(1);
  });

  it('sends the typed query to the server after a pause', async () => {
    mockFetchComics.mockResolvedValue({ volumes: [makeVolume(1)] });

    const { getByPlaceholderText } = render(
      <ComicsScreen navigation={mockNavigation} route={mockRoute} />
    );
    await act(async () => {});

    fireEvent.changeText(getByPlaceholderText('Search comics…'), 'saga');
    await flushSearch();

    expect(mockFetchComics).toHaveBeenCalledWith('saga');
  });

  it('debounces, so typing does not fire a request per keystroke', async () => {
    mockFetchComics.mockResolvedValue({ volumes: [] });

    const { getByPlaceholderText } = render(
      <ComicsScreen navigation={mockNavigation} route={mockRoute} />
    );
    await act(async () => {});
    mockFetchComics.mockClear();

    const input = getByPlaceholderText('Search comics…');
    fireEvent.changeText(input, 's');
    fireEvent.changeText(input, 'sa');
    fireEvent.changeText(input, 'sag');
    fireEvent.changeText(input, 'saga');
    await flushSearch();

    expect(mockFetchComics).toHaveBeenCalledTimes(1);
    expect(mockFetchComics).toHaveBeenCalledWith('saga');
  });

  it('renders the results it gets back', async () => {
    mockFetchComics.mockResolvedValue({ volumes: [makeVolume(7, { title: 'Saga' })] });

    const { getByPlaceholderText, getByText } = render(
      <ComicsScreen navigation={mockNavigation} route={mockRoute} />
    );
    await act(async () => {});

    fireEvent.changeText(getByPlaceholderText('Search comics…'), 'saga');
    await flushSearch();

    expect(getByText('Saga')).toBeTruthy();
  });

  it('says so when nothing matches', async () => {
    mockFetchComics.mockResolvedValue({ volumes: [] });

    const { getByPlaceholderText, getByText } = render(
      <ComicsScreen navigation={mockNavigation} route={mockRoute} />
    );
    await act(async () => {});

    fireEvent.changeText(getByPlaceholderText('Search comics…'), 'nothing');
    await flushSearch();

    expect(getByText(/No comics match/)).toBeTruthy();
  });

  it('falls back to the on-device cache when the server is unreachable', async () => {
    mockFetchComics.mockResolvedValue({ volumes: [] });

    const { getByPlaceholderText, getByText } = render(
      <ComicsScreen navigation={mockNavigation} route={mockRoute} />
    );
    await act(async () => {});

    mockFetchComics.mockRejectedValue(new Error('offline'));
    mockSearchCachedComics.mockResolvedValue([makeVolume(3, { title: 'Cached Saga' })]);

    fireEvent.changeText(getByPlaceholderText('Search comics…'), 'saga');
    await flushSearch();

    expect(mockSearchCachedComics).toHaveBeenCalledWith('saga');
    expect(getByText('Cached Saga')).toBeTruthy();
  });

  it('restores the full library when the query is cleared', async () => {
    mockFetchComics.mockResolvedValue({ volumes: [makeVolume(1, { title: 'Everything' })] });

    const { getByPlaceholderText, getByText } = render(
      <ComicsScreen navigation={mockNavigation} route={mockRoute} />
    );
    await act(async () => {});

    const input = getByPlaceholderText('Search comics…');
    fireEvent.changeText(input, 'saga');
    await flushSearch();

    mockFetchComics.mockClear();
    fireEvent.changeText(input, '');
    await act(async () => {});

    // Clearing reloads the library rather than leaving the last results up.
    expect(mockFetchComics).toHaveBeenCalledWith();
    expect(getByText('Everything')).toBeTruthy();
  });

  it('includes matching downloaded volumes in an offline search', async () => {
    mockFetchComics.mockResolvedValue({ volumes: [] });
    setComicDownloads({
      5: makeComicDownload(5, 99, 'Downloaded Saga'),
      6: makeComicDownload(6, 98, 'Downloaded Bone'),
    });

    const { getByPlaceholderText, getByText, queryByText } = render(
      <ComicsScreen navigation={mockNavigation} route={mockRoute} />
    );
    await act(async () => {});

    mockFetchComics.mockResolvedValue({ volumes: [], cached: true });
    fireEvent.changeText(getByPlaceholderText('Search comics…'), 'saga');
    await flushSearch();

    expect(getByText('Downloaded Saga')).toBeTruthy();
    expect(queryByText('Downloaded Bone')).toBeNull();
  });
});
