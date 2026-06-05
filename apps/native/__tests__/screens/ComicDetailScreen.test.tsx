import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import ComicDetailScreen from '../../src/screens/ComicDetailScreen';
import { fetchComicDetail } from '../../src/services/api/comics';
import { useAuthHeaders } from '../../src/hooks/useAuthHeaders';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));
jest.mock('../../src/services/api/comics');
jest.mock('../../src/hooks/useAuthHeaders');

const mockFetchComicDetail = fetchComicDetail as jest.Mock;
const mockUseAuthHeaders = useAuthHeaders as jest.Mock;

const mockNavigation = {
  navigate: jest.fn(),
  setOptions: jest.fn(),
  goBack: jest.fn(),
} as any;

const mockRoute = {
  params: { volumeId: 42 },
} as any;

const makeIssue = (overrides: any = {}) => ({
  id: 1,
  volume_id: 42,
  comicvine_id: 1,
  issue_number: '1',
  calculated_issue_number: 1,
  title: 'First Issue',
  date: '2020-01-01',
  description: '',
  monitored: true,
  files: [],
  ...overrides,
});

const makeVolume = (overrides: any = {}) => ({
  id: 42,
  comicvine_id: 1,
  title: 'Batman',
  year: 2020,
  publisher: 'DC',
  volume_number: 1,
  description: '<p>An <b>amazing</b> comic</p>',
  monitored: true,
  monitor_new_issues: false,
  folder: '/comics',
  issue_count: 2,
  issue_count_monitored: 2,
  issues_downloaded: 1,
  issues_downloaded_monitored: 1,
  total_size: 52428800,
  special_version: null,
  special_version_locked: false,
  site_url: '',
  root_folder: 1,
  volume_folder: 'batman',
  general_files: [],
  issues: [
    makeIssue({ id: 1, issue_number: '1', title: 'First', files: [{ id: 1, filepath: '/x', size: 1 }] }),
    makeIssue({ id: 2, issue_number: '2', title: 'Second' }),
  ],
  ...overrides,
});

describe('ComicDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockUseAuthHeaders.mockReturnValue({});
  });

  it('shows loading indicator initially', () => {
    mockFetchComicDetail.mockReturnValue(new Promise(() => {}));
    const { toJSON } = render(<ComicDetailScreen navigation={mockNavigation} route={mockRoute} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders volume details, stripped description, and issues list', async () => {
    mockFetchComicDetail.mockResolvedValue({ configured: true, volume: makeVolume() });

    const { getByText } = render(<ComicDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Batman')).toBeTruthy();
    });
    expect(getByText('DC · 2020')).toBeTruthy();
    expect(getByText('Issues: 1/2')).toBeTruthy();
    expect(getByText('An amazing comic')).toBeTruthy();
    expect(getByText('First')).toBeTruthy();
    expect(getByText('Second')).toBeTruthy();
    expect(getByText('Read')).toBeTruthy();
    expect(getByText('Missing')).toBeTruthy();
  });

  it('navigates to IssueDetail when tapping an undownloaded issue', async () => {
    mockFetchComicDetail.mockResolvedValue({ configured: true, volume: makeVolume() });

    const { getByText } = render(<ComicDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getByText('Missing')).toBeTruthy());

    fireEvent.press(getByText('Missing'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('IssueDetail', {
      volumeId: 42,
      issueId: 2,
      volumeTitle: 'Batman',
    });
  });

  it('navigates to IssueDetail when tapping a downloaded issue', async () => {
    mockFetchComicDetail.mockResolvedValue({ configured: true, volume: makeVolume() });

    const { getByText } = render(<ComicDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getByText('Read')).toBeTruthy());

    fireEvent.press(getByText('Read'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('IssueDetail', {
      volumeId: 42,
      issueId: 1,
      volumeTitle: 'Batman',
    });
  });

  it('shows kapowarr-not-configured error', async () => {
    mockFetchComicDetail.mockResolvedValue({ configured: false });

    const { getByText } = render(<ComicDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText(/Kapowarr is not configured/)).toBeTruthy();
    });
  });

  it('shows API-level error message', async () => {
    mockFetchComicDetail.mockResolvedValue({ configured: true, error: 'Kapowarr down' });

    const { getByText } = render(<ComicDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getByText('Kapowarr down')).toBeTruthy());
  });

  it('shows generic error when fetch rejects', async () => {
    mockFetchComicDetail.mockRejectedValue(new Error('boom'));

    const { getByText } = render(<ComicDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getByText('Failed to load comic details')).toBeTruthy());
  });
});
