import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import SettingsScreen from '../../src/screens/SettingsScreen';
import { useSettingsStore } from '../../src/stores/useSettingsStore';
import { cleanAllDownloads } from '../../src/services/fileManager';
import { APP_VERSION, BUILD_VERSION } from '../../src/utils/constants';
import { testShelvarrConnection } from '../../src/services/api/shelvarr';

// Mock api/client to prevent axios module side-effects at test boot
// (useSettingsStore transitively loads api/client → axios fetch adapter).
jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));
jest.mock('../../src/stores/useSettingsStore');
jest.mock('../../src/services/fileManager');
jest.mock('../../src/services/api/shelvarr', () => ({
  testShelvarrConnection: jest.fn(),
}));

const mockSetAutoDelete = jest.fn();
const mockSetShelvarrUrl = jest.fn();
const mockSetKapowarrUrl = jest.fn();
const mockLoadSettings = jest.fn();

const mockUseSettingsStore = useSettingsStore as unknown as jest.Mock;
const mockCleanAllDownloads = cleanAllDownloads as jest.Mock;
const mockTestShelvarrConnection = testShelvarrConnection as jest.Mock;

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockCleanAllDownloads.mockResolvedValue(undefined);
    mockTestShelvarrConnection.mockResolvedValue({ ok: true });

    mockUseSettingsStore.mockImplementation((selector: any) =>
      selector({
        autoDeleteAfterReading: true,
        setAutoDelete: mockSetAutoDelete,
        shelvarrUrl: 'http://shelvarr:3000',
        setShelvarrUrl: mockSetShelvarrUrl,
        kapowarrUrl: 'http://kapowarr:5656',
        setKapowarrUrl: mockSetKapowarrUrl,
        loadSettings: mockLoadSettings,
      })
    );
  });

  it('renders settings sections', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Shelvarr (Books)')).toBeTruthy();
    expect(getByText('Kapowarr (Comics)')).toBeTruthy();
    expect(getByText('Reading')).toBeTruthy();
    expect(getByText('Auto-delete after reading')).toBeTruthy();
    expect(getByText('Storage')).toBeTruthy();
  });

  it('calls loadSettings on mount', () => {
    render(<SettingsScreen />);
    expect(mockLoadSettings).toHaveBeenCalled();
  });

  it('tests the connection and saves shelvarr URL when reachable', async () => {
    const { getAllByText, getByDisplayValue } = render(<SettingsScreen />);
    fireEvent.changeText(getByDisplayValue('http://shelvarr:3000'), 'http://new:3000');
    // Two "Save" buttons — first one is for Shelvarr
    fireEvent.press(getAllByText('Save')[0]);

    await waitFor(() => {
      expect(mockTestShelvarrConnection).toHaveBeenCalledWith('http://new:3000');
    });
    expect(mockSetShelvarrUrl).toHaveBeenCalledWith('http://new:3000');
    expect(Alert.alert).toHaveBeenCalledWith('Saved', 'Shelvarr URL updated.');
  });

  it('does not save when shelvarr connection test fails', async () => {
    mockTestShelvarrConnection.mockResolvedValueOnce({ ok: false, error: 'Could not reach server' });
    const { getAllByText, getByDisplayValue } = render(<SettingsScreen />);
    fireEvent.changeText(getByDisplayValue('http://shelvarr:3000'), 'http://bad:3000');
    fireEvent.press(getAllByText('Save')[0]);

    await waitFor(() => {
      expect(mockTestShelvarrConnection).toHaveBeenCalledWith('http://bad:3000');
    });
    expect(mockSetShelvarrUrl).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Could not reach server',
      expect.stringContaining('Could not reach server')
    );
  });

  it('saves kapowarr URL', () => {
    const { getAllByText, getByDisplayValue } = render(<SettingsScreen />);
    fireEvent.changeText(getByDisplayValue('http://kapowarr:5656'), 'http://newkapo:5656');
    fireEvent.press(getAllByText('Save')[1]);
    expect(mockSetKapowarrUrl).toHaveBeenCalledWith('http://newkapo:5656');
    expect(Alert.alert).toHaveBeenCalledWith('Saved', 'Kapowarr URL updated.');
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

    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const deleteButton = alertCall[2].find((b: any) => b.text === 'Delete');
    await deleteButton.onPress();

    expect(mockCleanAllDownloads).toHaveBeenCalled();
  });

  it('toggles auto-delete switch', () => {
    const { UNSAFE_getByType } = render(<SettingsScreen />);
    const { Switch } = require('react-native');
    const switchEl = UNSAFE_getByType(Switch);
    fireEvent(switchEl, 'valueChange', false);
    expect(mockSetAutoDelete).toHaveBeenCalledWith(false);
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
