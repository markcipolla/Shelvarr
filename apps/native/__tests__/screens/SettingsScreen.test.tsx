import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import SettingsScreen from '../../src/screens/SettingsScreen';
import { useSettingsStore } from '../../src/stores/useSettingsStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { cleanAllDownloads } from '../../src/services/fileManager';
import { resetApiClient } from '../../src/services/api/client';
import { APP_VERSION, BUILD_VERSION } from '../../src/utils/constants';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));
jest.mock('../../src/stores/useSettingsStore');
jest.mock('../../src/stores/useAuthStore');
jest.mock('../../src/services/fileManager');
jest.mock('../../src/services/api/client');

const mockSetAutoDelete = jest.fn();
const mockSetShelvarrUrl = jest.fn();
const mockLoadSettings = jest.fn();
const mockLogout = jest.fn().mockResolvedValue(undefined);

const mockUseSettingsStore = useSettingsStore as unknown as jest.Mock;
const mockUseAuthStore = useAuthStore as unknown as jest.Mock;
const mockCleanAllDownloads = cleanAllDownloads as jest.Mock;
const mockResetApiClient = resetApiClient as jest.Mock;

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockCleanAllDownloads.mockResolvedValue(undefined);
    mockResetApiClient.mockReturnValue(undefined);

    mockUseSettingsStore.mockImplementation((selector: any) =>
      selector({
        autoDeleteAfterReading: true,
        setAutoDelete: mockSetAutoDelete,
        shelvarrUrl: 'http://shelvarr:3000',
        setShelvarrUrl: mockSetShelvarrUrl,
        loadSettings: mockLoadSettings,
      })
    );
    mockUseAuthStore.mockImplementation((selector: any) =>
      selector({
        logout: mockLogout,
        credentials: { serverUrl: 'http://myserver:25600' },
      })
    );
  });

  it('renders settings sections', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Reading')).toBeTruthy();
    expect(getByText('Auto-delete after reading')).toBeTruthy();
    expect(getByText('Shelvarr')).toBeTruthy();
    expect(getByText('Storage')).toBeTruthy();
    expect(getByText('Server')).toBeTruthy();
    expect(getByText('http://myserver:25600')).toBeTruthy();
  });

  it('calls loadSettings on mount', () => {
    render(<SettingsScreen />);
    expect(mockLoadSettings).toHaveBeenCalled();
  });

  it('saves shelvarr URL', () => {
    const { getByText, getByDisplayValue } = render(<SettingsScreen />);
    fireEvent.changeText(getByDisplayValue('http://shelvarr:3000'), 'http://new:3000');
    fireEvent.press(getByText('Save'));
    expect(mockSetShelvarrUrl).toHaveBeenCalledWith('http://new:3000');
    expect(Alert.alert).toHaveBeenCalledWith('Saved', 'Shelvarr URL updated.');
  });

  it('handles clear downloads', () => {
    const { getByText } = render(<SettingsScreen />);
    fireEvent.press(getByText('Clear all downloads'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Clear Downloads',
      'Delete all downloaded books?',
      expect.any(Array)
    );
  });

  it('executes clear downloads action', async () => {
    const { getByText } = render(<SettingsScreen />);
    fireEvent.press(getByText('Clear all downloads'));

    // Get the alert buttons and press Delete
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const deleteButton = alertCall[2].find((b: any) => b.text === 'Delete');
    await deleteButton.onPress();

    expect(mockCleanAllDownloads).toHaveBeenCalled();
  });

  it('handles logout', async () => {
    const { getByText } = render(<SettingsScreen />);
    fireEvent.press(getByText('Logout'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Logout',
      'Disconnect from server?',
      expect.any(Array)
    );

    // Get the alert buttons and press Logout
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const logoutButton = alertCall[2].find((b: any) => b.text === 'Logout');
    await logoutButton.onPress();

    expect(mockCleanAllDownloads).toHaveBeenCalled();
    expect(mockResetApiClient).toHaveBeenCalled();
    expect(mockLogout).toHaveBeenCalled();
  });

  describe('About section', () => {
    it('renders the About section heading', () => {
      const { getByText } = render(<SettingsScreen />);
      expect(getByText('About')).toBeTruthy();
    });

    it('renders the Version label and value', () => {
      const { getByText } = render(<SettingsScreen />);
      expect(getByText('Version')).toBeTruthy();
      expect(getByText(APP_VERSION)).toBeTruthy();
    });

    it('renders the Build label and value', () => {
      const { getByText } = render(<SettingsScreen />);
      expect(getByText('Build')).toBeTruthy();
      expect(getByText(BUILD_VERSION)).toBeTruthy();
    });

    it('renders the build value with monospace font', () => {
      const { getByText } = render(<SettingsScreen />);
      const buildValue = getByText(BUILD_VERSION);
      const style = Array.isArray(buildValue.props.style)
        ? Object.assign({}, ...buildValue.props.style)
        : buildValue.props.style;
      expect(style.fontFamily).toBe('monospace');
    });
  });
});
