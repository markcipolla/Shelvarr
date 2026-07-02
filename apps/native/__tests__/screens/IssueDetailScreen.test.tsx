import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import IssueDetailScreen from '../../src/screens/IssueDetailScreen';
import { fetchComicIssue, fetchComicProgress } from '../../src/services/api/comics';
import { useAuthHeaders } from '../../src/hooks/useAuthHeaders';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));
jest.mock('../../src/services/api/comics');
jest.mock('../../src/hooks/useAuthHeaders');

const mockFetchComicIssue = fetchComicIssue as jest.Mock;
const mockFetchComicProgress = fetchComicProgress as jest.Mock;
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

describe('IssueDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuthHeaders.mockReturnValue({});
    mockFetchComicProgress.mockResolvedValue(null);
  });

  it('shows loading indicator initially', () => {
    mockFetchComicIssue.mockReturnValue(new Promise(() => {}));
    const { toJSON } = render(<IssueDetailScreen navigation={mockNavigation} route={mockRoute} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders issue details, stripped description, and downloaded badge', async () => {
    mockFetchComicIssue.mockResolvedValue({ configured: true, issue: makeIssue() });

    const { getByText } = render(<IssueDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getByText('First Issue')).toBeTruthy());
    expect(getByText('#1')).toBeTruthy();
    expect(getByText('Batman')).toBeTruthy();
    expect(getByText('2020-01-01')).toBeTruthy();
    expect(getByText('An amazing issue')).toBeTruthy();
    expect(getByText('Downloaded')).toBeTruthy();
    expect(mockNavigation.setOptions).toHaveBeenCalledWith({ title: '#1' });
    expect(mockFetchComicIssue).toHaveBeenCalledWith(1, 42);
  });

  it('renders Missing badge for an undownloaded issue', async () => {
    mockFetchComicIssue.mockResolvedValue({
      configured: true,
      issue: makeIssue({ id: 2, issue_number: '2', title: 'Second', files: [] }),
    });

    const { getByText } = render(
      <IssueDetailScreen
        navigation={mockNavigation}
        route={{ params: { ...baseParams, issueId: 2 } } as any}
      />
    );

    await waitFor(() => expect(getByText('Second')).toBeTruthy());
    expect(getByText('Missing')).toBeTruthy();
  });

  it('shows a "Read" badge when the issue is completed', async () => {
    mockFetchComicIssue.mockResolvedValue({ configured: true, issue: makeIssue() });
    mockFetchComicProgress.mockResolvedValue({ page: 20, completed: true, total: 20 });

    const { getByText, getAllByText } = render(
      <IssueDetailScreen navigation={mockNavigation} route={mockRoute} />
    );

    // Both the "Read" CTA button and the "Read" status badge render for a
    // downloaded, completed issue.
    await waitFor(() => expect(getAllByText('Read').length).toBe(2));
    expect(getByText('Downloaded')).toBeTruthy();
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

  it('shows error when the issue is not found', async () => {
    mockFetchComicIssue.mockResolvedValue({ configured: true, error: 'Issue not found' });

    const { getByText } = render(<IssueDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getByText('Issue not found')).toBeTruthy());
  });

  it('shows kapowarr-not-configured error', async () => {
    mockFetchComicIssue.mockResolvedValue({ configured: false });

    const { getByText } = render(<IssueDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getByText(/Kapowarr is not configured/)).toBeTruthy());
  });

  it('shows generic error when fetch rejects', async () => {
    mockFetchComicIssue.mockRejectedValue(new Error('boom'));

    const { getByText } = render(<IssueDetailScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getByText('Failed to load issue details')).toBeTruthy());
  });
});
