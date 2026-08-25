import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import IssueDetailScreen from '../../src/screens/IssueDetailScreen';
import { fetchComicIssue, fetchComicProgress, updateComicProgress } from '../../src/services/api/comics';
import {
  prepareComicForReading,
  downloadComic,
  removeDownloadedComic,
} from '../../src/services/comicReader';
import { useComicDownloadStore } from '../../src/stores/useComicDownloadStore';
import { useAuthHeaders } from '../../src/hooks/useAuthHeaders';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));
jest.mock('../../src/services/api/comics');
jest.mock('../../src/services/comicReader', () => ({
  prepareComicForReading: jest.fn(),
  downloadComic: jest.fn(),
  removeDownloadedComic: jest.fn(),
  describeComicReadError: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));
jest.mock('../../src/hooks/useAuthHeaders');

const mockFetchComicIssue = fetchComicIssue as jest.Mock;
const mockFetchComicProgress = fetchComicProgress as jest.Mock;
const mockUpdateComicProgress = updateComicProgress as jest.Mock;
const mockPrepare = prepareComicForReading as jest.Mock;
const mockDownloadComic = downloadComic as jest.Mock;
const mockRemoveComic = removeDownloadedComic as jest.Mock;
const mockUseAuthHeaders = useAuthHeaders as jest.Mock;

const mockNavigation = {
  navigate: jest.fn(),
  setOptions: jest.fn(),
  goBack: jest.fn(),
} as any;

const baseParams = { volumeId: 42, issueId: 1, volumeTitle: 'Batman' };
const mockRoute = { params: baseParams } as any;

const makeIssue = (overrides: any = {}) => ({
  id: 1,
  volume_id: 42,
  comicvine_id: 1,
  issue_number: '1',
  calculated_issue_number: 1,
  title: 'First Issue',
  date: '2020-01-01',
  description: '<p>An <b>amazing</b> issue</p>',
  monitored: true,
  files: [{ id: 1, filepath: '/x', size: 1048576 }],
  ...overrides,
});

const markDownloaded = (issueId: number) =>
  useComicDownloadStore.setState({
    downloads: {
      [issueId]: { issueId, volumeId: 42, kind: 'images', extractedDir: '/e/', totalPages: 3, downloadedAt: 1 },
    },
  });

describe('IssueDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockUseAuthHeaders.mockReturnValue({});
    mockFetchComicProgress.mockResolvedValue(null);
    useComicDownloadStore.setState({ downloads: {}, activeIssueId: null, progress: 0 });
  });

  it('shows loading indicator initially', () => {
    mockFetchComicIssue.mockReturnValue(new Promise(() => {}));
    const { toJSON } = render(<IssueDetailScreen navigation={mockNavigation} route={mockRoute} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders issue details, stripped description, and an Available badge', async () => {
    mockFetchComicIssue.mockResolvedValue({ configured: true, issue: makeIssue() });

    const { getByText } = render(<IssueDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getByText('First Issue')).toBeTruthy());
    expect(getByText('#1')).toBeTruthy();
    expect(getByText('Batman')).toBeTruthy();
    expect(getByText('2020-01-01')).toBeTruthy();
    expect(getByText('An amazing issue')).toBeTruthy();
    // On the server but not on this device yet.
    expect(getByText('Available')).toBeTruthy();
    expect(getByText('Download')).toBeTruthy();
    expect(mockNavigation.setOptions).toHaveBeenCalledWith({ title: '#1' });
    expect(mockFetchComicIssue).toHaveBeenCalledWith(1, 42);
  });

  it('renders a Downloaded badge and Remove Download when downloaded on this device', async () => {
    mockFetchComicIssue.mockResolvedValue({ configured: true, issue: makeIssue() });
    markDownloaded(1);

    const { getByText, queryByText } = render(
      <IssueDetailScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => expect(getByText('Downloaded')).toBeTruthy());
    expect(getByText('Remove Download')).toBeTruthy();
    expect(queryByText('Download')).toBeNull();
  });

  it('formats large issue sizes in GB', async () => {
    mockFetchComicIssue.mockResolvedValue({
      configured: true,
      issue: makeIssue({ files: [{ id: 1, filepath: '/x', size: 2 * 1024 * 1024 * 1024 }] }),
    });

    const { getByText } = render(<IssueDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getByText('Size: 2.00 GB')).toBeTruthy());
  });

  it('renders Missing badge and no actions for an issue absent from the server', async () => {
    mockFetchComicIssue.mockResolvedValue({
      configured: true,
      issue: makeIssue({ id: 2, issue_number: '2', title: 'Second', files: [] }),
    });

    const { getByText, queryByText } = render(
      <IssueDetailScreen
        navigation={mockNavigation}
        route={{ params: { ...baseParams, issueId: 2 } } as any}
      />
    );

    await waitFor(() => expect(getByText('Second')).toBeTruthy());
    expect(getByText('Missing')).toBeTruthy();
    expect(queryByText('Download')).toBeNull();
    expect(queryByText('Read')).toBeNull();
  });

  it('shows a "Read" badge when the issue is completed', async () => {
    mockFetchComicIssue.mockResolvedValue({ configured: true, issue: makeIssue() });
    mockFetchComicProgress.mockResolvedValue({ page: 20, completed: true, total: 20 });

    const { getByText, getAllByText } = render(
      <IssueDetailScreen navigation={mockNavigation} route={mockRoute} />
    );

    // Both the "Read" CTA button and the "Read" status badge render.
    await waitFor(() => expect(getAllByText('Read').length).toBe(2));
    expect(getByText('Available')).toBeTruthy();
  });

  it('marks an issue as completed', async () => {
    mockFetchComicIssue.mockResolvedValue({ configured: true, issue: makeIssue() });
    mockFetchComicProgress.mockResolvedValue({ page: 5, completed: false, total: 22 });
    mockUpdateComicProgress.mockResolvedValue(undefined);

    const { getByText, queryByText, getAllByText } = render(
      <IssueDetailScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => expect(getByText('Mark as Completed')).toBeTruthy());
    fireEvent.press(getByText('Mark as Completed'));

    await waitFor(() => {
      expect(mockUpdateComicProgress).toHaveBeenCalledWith(1, 5, true, 22);
      // Once completed the button disappears and the "Read" badge shows
      // (alongside the "Read" CTA button, so there are two matches).
      expect(queryByText('Mark as Completed')).toBeNull();
      expect(getAllByText('Read').length).toBe(2);
    });
  });

  it('hides Mark as Completed when the issue is already completed', async () => {
    mockFetchComicIssue.mockResolvedValue({ configured: true, issue: makeIssue() });
    mockFetchComicProgress.mockResolvedValue({ page: 20, completed: true, total: 20 });

    const { queryByText, getByText } = render(
      <IssueDetailScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => expect(getByText('Available')).toBeTruthy());
    expect(queryByText('Mark as Completed')).toBeNull();
  });

  it('alerts when marking completed fails', async () => {
    mockFetchComicIssue.mockResolvedValue({ configured: true, issue: makeIssue() });
    mockFetchComicProgress.mockResolvedValue({ page: 5, completed: false, total: 22 });
    mockUpdateComicProgress.mockRejectedValue(new Error('nope'));

    const { getByText } = render(<IssueDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getByText('Mark as Completed')).toBeTruthy());
    fireEvent.press(getByText('Mark as Completed'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'nope');
    });
  });

  it('shows "Reading X/Y" when in progress with a known total', async () => {
    mockFetchComicIssue.mockResolvedValue({ configured: true, issue: makeIssue() });
    mockFetchComicProgress.mockResolvedValue({ page: 5, completed: false, total: 22 });

    const { getByText } = render(<IssueDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getByText('Reading 5/22')).toBeTruthy());
  });

  it('shows "Reading p.X" when in progress with no known total', async () => {
    mockFetchComicIssue.mockResolvedValue({ configured: true, issue: makeIssue() });
    mockFetchComicProgress.mockResolvedValue({ page: 5, completed: false });

    const { getByText } = render(<IssueDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getByText('Reading p.5')).toBeTruthy());
  });

  it('reads an image comic: prepares it and navigates to the comic reader', async () => {
    mockFetchComicIssue.mockResolvedValue({ configured: true, issue: makeIssue() });
    mockPrepare.mockResolvedValue({ kind: 'images', extractedDir: '/e/', totalPages: 5 });

    const { getByText } = render(<IssueDetailScreen navigation={mockNavigation} route={mockRoute} />);
    await waitFor(() => expect(getByText('Read')).toBeTruthy());

    fireEvent.press(getByText('Read'));

    await waitFor(() =>
      expect(mockNavigation.navigate).toHaveBeenCalledWith('ComicReader', {
        bookId: 'comic-1',
        extractedDir: '/e/',
        startPage: 1,
        totalPages: 5,
        streaming: false,
        kind: 'comic',
        issueId: 1,
      })
    );
    expect(mockPrepare).toHaveBeenCalledWith(makeIssue(), {}, expect.any(Function), 'Batman');
  });

  it('reads a pdf comic: navigates to the pdf reader at the saved page', async () => {
    mockFetchComicIssue.mockResolvedValue({ configured: true, issue: makeIssue() });
    mockPrepare.mockResolvedValue({ kind: 'pdf', filePath: '/p.pdf' });
    mockFetchComicProgress.mockResolvedValue({ page: 4, completed: false, total: 30 });

    const { getByText } = render(<IssueDetailScreen navigation={mockNavigation} route={mockRoute} />);
    await waitFor(() => expect(getByText('Read')).toBeTruthy());

    fireEvent.press(getByText('Read'));

    await waitFor(() =>
      expect(mockNavigation.navigate).toHaveBeenCalledWith('PdfReader', {
        bookId: 'comic-1',
        filePath: '/p.pdf',
        startPage: 4,
        totalPages: 30,
        kind: 'comic',
        issueId: 1,
      })
    );
  });

  it('alerts when reading fails', async () => {
    mockFetchComicIssue.mockResolvedValue({ configured: true, issue: makeIssue() });
    mockPrepare.mockRejectedValue(new Error('boom while reading'));

    const { getByText } = render(<IssueDetailScreen navigation={mockNavigation} route={mockRoute} />);
    await waitFor(() => expect(getByText('Read')).toBeTruthy());

    fireEvent.press(getByText('Read'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith("Can't open comic", 'boom while reading')
    );
  });

  it('downloads the issue when Download is pressed', async () => {
    mockFetchComicIssue.mockResolvedValue({ configured: true, issue: makeIssue() });
    mockDownloadComic.mockResolvedValue(undefined);

    const { getByText } = render(<IssueDetailScreen navigation={mockNavigation} route={mockRoute} />);
    await waitFor(() => expect(getByText('Download')).toBeTruthy());

    fireEvent.press(getByText('Download'));

    await waitFor(() => expect(mockDownloadComic).toHaveBeenCalledWith(makeIssue(), {}, 'Batman'));
  });

  it('alerts when a download fails', async () => {
    mockFetchComicIssue.mockResolvedValue({ configured: true, issue: makeIssue() });
    mockDownloadComic.mockRejectedValue(new Error('no space left'));

    const { getByText } = render(<IssueDetailScreen navigation={mockNavigation} route={mockRoute} />);
    await waitFor(() => expect(getByText('Download')).toBeTruthy());

    fireEvent.press(getByText('Download'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith("Can't download comic", 'no space left')
    );
  });

  it('removes the download when Remove Download is pressed', async () => {
    mockFetchComicIssue.mockResolvedValue({ configured: true, issue: makeIssue() });
    markDownloaded(1);
    mockRemoveComic.mockResolvedValue(undefined);

    const { getByText } = render(<IssueDetailScreen navigation={mockNavigation} route={mockRoute} />);
    await waitFor(() => expect(getByText('Remove Download')).toBeTruthy());

    fireEvent.press(getByText('Remove Download'));

    await waitFor(() => expect(mockRemoveComic).toHaveBeenCalledWith(1));
  });

  it('alerts when removing a download fails', async () => {
    mockFetchComicIssue.mockResolvedValue({ configured: true, issue: makeIssue() });
    markDownloaded(1);
    mockRemoveComic.mockRejectedValue(new Error('remove failed'));

    const { getByText } = render(<IssueDetailScreen navigation={mockNavigation} route={mockRoute} />);
    await waitFor(() => expect(getByText('Remove Download')).toBeTruthy());

    fireEvent.press(getByText('Remove Download'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Error', 'remove failed'));
  });

  it('shows error when the issue is not found', async () => {
    mockFetchComicIssue.mockResolvedValue({ configured: true, error: 'Issue not found' });

    const { getByText } = render(<IssueDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getByText('Issue not found')).toBeTruthy());
  });

  it('shows an error when the server has no such issue', async () => {
    mockFetchComicIssue.mockResolvedValue({ configured: false });

    const { getByText } = render(<IssueDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getByText(/not on the server/)).toBeTruthy());
  });

  it('shows generic error when fetch rejects', async () => {
    mockFetchComicIssue.mockRejectedValue(new Error('boom'));

    const { getByText } = render(<IssueDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getByText('Failed to load issue details')).toBeTruthy());
  });
});
