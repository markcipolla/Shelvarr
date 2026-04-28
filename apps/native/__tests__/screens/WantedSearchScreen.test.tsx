import React from 'react';
import { Alert } from 'react-native';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import WantedSearchScreen from '../../src/screens/WantedSearchScreen';
import { searchHardcover, addToWanted } from '../../src/services/api/wanted';
import { useSettingsStore } from '../../src/stores/useSettingsStore';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));
jest.mock('../../src/services/api/wanted');
jest.mock('../../src/stores/useSettingsStore');

const mockSearchHardcover = searchHardcover as jest.Mock;
const mockAddToWanted = addToWanted as jest.Mock;
const mockUseSettingsStore = useSettingsStore as unknown as jest.Mock;

const navigation = { navigate: jest.fn() } as any;
const route = { params: undefined } as any;

const result = (overrides: any = {}) => ({
  hardcoverId: 'hc-1',
  title: 'Dune',
  author: 'Frank Herbert',
  isbn: '9780441172719',
  coverUrl: 'https://example.com/dune.jpg',
  description: 'Spice must flow.',
  publishDate: '1965',
  isWanted: false,
  ...overrides,
});

describe('WantedSearchScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockUseSettingsStore.mockImplementation((selector: any) =>
      selector({ shelvarrUrl: 'http://shelvarr:3000' })
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows "no server configured" when shelvarrUrl is empty', () => {
    mockUseSettingsStore.mockImplementation((selector: any) => selector({ shelvarrUrl: '' }));
    const { getByText } = render(<WantedSearchScreen navigation={navigation} route={route} />);
    expect(getByText(/No Shelvarr server configured/)).toBeTruthy();
  });

  it('shows the empty prompt before any search', () => {
    const { getByText } = render(<WantedSearchScreen navigation={navigation} route={route} />);
    expect(
      getByText(/Enter a search term above to find books on Hardcover/)
    ).toBeTruthy();
  });

  it('debounces input then renders search results', async () => {
    mockSearchHardcover.mockResolvedValue({
      success: true,
      configured: true,
      results: [result()],
    });

    const { getByPlaceholderText, getByText } = render(
      <WantedSearchScreen navigation={navigation} route={route} />
    );

    fireEvent.changeText(getByPlaceholderText(/Search Hardcover/), 'dune');
    expect(mockSearchHardcover).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(mockSearchHardcover).toHaveBeenCalledWith('dune');
      expect(getByText('Dune')).toBeTruthy();
      expect(getByText('Frank Herbert')).toBeTruthy();
      expect(getByText('+ Want')).toBeTruthy();
    });
  });

  it('marks already-wanted results as on the wanted list', async () => {
    mockSearchHardcover.mockResolvedValue({
      success: true,
      configured: true,
      results: [result({ isWanted: true })],
    });

    const { getByPlaceholderText, getByText, queryByText } = render(
      <WantedSearchScreen navigation={navigation} route={route} />
    );

    fireEvent.changeText(getByPlaceholderText(/Search Hardcover/), 'dune');
    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(getByText('✓ On Wanted List')).toBeTruthy();
    });
    expect(queryByText('+ Want')).toBeNull();
  });

  it('adds a result to the wanted list when "+ Want" is tapped', async () => {
    mockSearchHardcover.mockResolvedValue({
      success: true,
      configured: true,
      results: [result()],
    });
    mockAddToWanted.mockResolvedValue({ success: true, id: 5 });

    const { getByPlaceholderText, getByText } = render(
      <WantedSearchScreen navigation={navigation} route={route} />
    );

    fireEvent.changeText(getByPlaceholderText(/Search Hardcover/), 'dune');
    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    await waitFor(() => expect(getByText('+ Want')).toBeTruthy());

    fireEvent.press(getByText('+ Want'));

    await waitFor(() => {
      expect(mockAddToWanted).toHaveBeenCalledWith({
        hardcoverId: 'hc-1',
        title: 'Dune',
        author: 'Frank Herbert',
        isbn: '9780441172719',
        coverUrl: 'https://example.com/dune.jpg',
        description: 'Spice must flow.',
      });
      expect(getByText('✓ On Wanted List')).toBeTruthy();
    });
  });

  it('alerts and resets the button if adding fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockSearchHardcover.mockResolvedValue({
      success: true,
      configured: true,
      results: [result()],
    });
    mockAddToWanted.mockResolvedValue({ success: false, error: 'Server exploded' });

    const { getByPlaceholderText, getByText } = render(
      <WantedSearchScreen navigation={navigation} route={route} />
    );

    fireEvent.changeText(getByPlaceholderText(/Search Hardcover/), 'dune');
    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    await waitFor(() => expect(getByText('+ Want')).toBeTruthy());
    fireEvent.press(getByText('+ Want'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Could not add', 'Server exploded');
      expect(getByText('+ Want')).toBeTruthy();
    });

    alertSpy.mockRestore();
  });

  it('shows the not-configured message when Hardcover is not configured', async () => {
    mockSearchHardcover.mockResolvedValue({
      success: false,
      configured: false,
      error: 'Hardcover is not configured on this Shelvarr server',
    });

    const { getByPlaceholderText, getByText } = render(
      <WantedSearchScreen navigation={navigation} route={route} />
    );

    fireEvent.changeText(getByPlaceholderText(/Search Hardcover/), 'dune');
    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(getByText(/Hardcover is not configured on your Shelvarr server/)).toBeTruthy();
    });
  });

  it('shows a no-results message when search returns empty', async () => {
    mockSearchHardcover.mockResolvedValue({
      success: true,
      configured: true,
      results: [],
    });

    const { getByPlaceholderText, getByText } = render(
      <WantedSearchScreen navigation={navigation} route={route} />
    );

    fireEvent.changeText(getByPlaceholderText(/Search Hardcover/), 'qwertyuiop');
    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(getByText(/No results found for "qwertyuiop"/)).toBeTruthy();
    });
  });
});
