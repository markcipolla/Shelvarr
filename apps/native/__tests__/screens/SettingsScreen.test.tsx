import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import SettingsScreen from '../../src/screens/SettingsScreen';
import { useSettingsStore } from '../../src/stores/useSettingsStore';
import { useUpdateStore } from '../../src/stores/useUpdateStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
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
jest.mock('../../src/stores/useUpdateStore');
jest.mock('../../src/stores/useAuthStore');
jest.mock('../../src/services/fileManager');
jest.mock('../../src/services/api/shelvarr', () => ({
  testShelvarrConnection: jest.fn(),
}));

const mockSetAutoDelete = jest.fn();
const mockSetShelvarrUrl = jest.fn();
const mockLoadSettings = jest.fn();

const mockCheckForUpdates = jest.fn();
const mockStartUpdate = jest.fn();
const mockSignOut = jest.fn();

const mockUseSettingsStore = useSettingsStore as unknown as jest.Mock;
const mockUseUpdateStore = useUpdateStore as unknown as jest.Mock;
const mockUseAuthStore = useAuthStore as unknown as jest.Mock;

function mockUpdateState(overrides: Record<string, unknown> = {}) {
  mockUseUpdateStore.mockImplementation((selector: any) =>
    selector({
      status: 'idle',
      update: null,
      error: null,
      upToDate: false,
      check: mockCheckForUpdates,
      startUpdate: mockStartUpdate,
      ...overrides,
    })
  );
}
function mockAuthState(overrides: Record<string, unknown> = {}) {
  mockUseAuthStore.mockImplementation((selector: any) =>
    selector({
      state: 'signed-in',
      user: { id: 1, email: 'reader@example.com', name: 'Reader', role: 'user' },
      signOut: mockSignOut,
      ...overrides,
    })
  );
}

const mockCleanAllDownloads = cleanAllDownloads as jest.Mock;
const mockTestShelvarrConnection = testShelvarrConnection as jest.Mock;

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockCleanAllDownloads.mockResolvedValue(undefined);
    mockTestShelvarrConnection.mockResolvedValue({ ok: true });

    mockUpdateState();
    mockAuthState();

    mockUseSettingsStore.mockImplementation((selector: any) =>
      selector({
        autoDeleteAfterReading: true,
        setAutoDelete: mockSetAutoDelete,
        shelvarrUrl: 'http://shelvarr:3000',
        setShelvarrUrl: mockSetShelvarrUrl,
        loadSettings: mockLoadSettings,
      })
    );
  });

  it('renders settings sections', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Server')).toBeTruthy();
    expect(getByText('Reading')).toBeTruthy();
    expect(getByText('Auto-delete after reading')).toBeTruthy();
    expect(getByText('Storage')).toBeTruthy();
    expect(getByText('Updates')).toBeTruthy();
  });

  describe('the account section', () => {
    it('names who is signed in', () => {
      const { getByText } = render(<SettingsScreen />);

      expect(getByText('Account')).toBeTruthy();
      expect(getByText('reader@example.com')).toBeTruthy();
    });

    it('says so rather than going blank when the account is not known yet', () => {
      mockAuthState({ user: null });

      const { getByText } = render(<SettingsScreen />);

      expect(getByText('Unknown')).toBeTruthy();
    });

    it('hides the section on a server that has no accounts', () => {
      mockAuthState({ state: 'disabled', user: null });

      const { queryByText } = render(<SettingsScreen />);

      expect(queryByText('Account')).toBeNull();
      expect(queryByText('Sign out')).toBeNull();
    });

    it('asks before signing out, since getting back in needs a new link', () => {
      const { getByText } = render(<SettingsScreen />);

      fireEvent.press(getByText('Sign out'));

      expect(Alert.alert).toHaveBeenCalledWith(
        'Sign out',
        'You will need a new sign-in link to get back in.',
        expect.any(Array)
      );
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('signs out once confirmed', () => {
      const { getByText } = render(<SettingsScreen />);
      fireEvent.press(getByText('Sign out'));

      const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as Array<{
        text: string;
        onPress?: () => void;
      }>;
      buttons.find((button) => button.text === 'Sign out')?.onPress?.();

      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  it('calls loadSettings on mount', () => {
    render(<SettingsScreen />);
    expect(mockLoadSettings).toHaveBeenCalled();
  });

  it('tests the connection and saves shelvarr URL when reachable', async () => {
    const { getByText, getByDisplayValue } = render(<SettingsScreen />);
    fireEvent.changeText(getByDisplayValue('http://shelvarr:3000'), 'http://new:3000');
    fireEvent.press(getByText('Save'));

    await waitFor(() => {
      expect(mockTestShelvarrConnection).toHaveBeenCalledWith('http://new:3000');
    });
    expect(mockSetShelvarrUrl).toHaveBeenCalledWith('http://new:3000');
    expect(Alert.alert).toHaveBeenCalledWith('Saved', 'Shelvarr URL updated.');
  });

  it('does not save when shelvarr connection test fails', async () => {
    mockTestShelvarrConnection.mockResolvedValueOnce({ ok: false, error: 'Could not reach server' });
    const { getByText, getByDisplayValue } = render(<SettingsScreen />);
    fireEvent.changeText(getByDisplayValue('http://shelvarr:3000'), 'http://bad:3000');
    fireEvent.press(getByText('Save'));

    await waitFor(() => {
      expect(mockTestShelvarrConnection).toHaveBeenCalledWith('http://bad:3000');
    });
    expect(mockSetShelvarrUrl).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Could not reach server',
      expect.stringContaining('Could not reach server')
    );
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

describe('SettingsScreen updates section', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockUseSettingsStore.mockImplementation((selector: any) =>
      selector({
        autoDeleteAfterReading: true,
        setAutoDelete: mockSetAutoDelete,
        shelvarrUrl: '',
        setShelvarrUrl: mockSetShelvarrUrl,
        loadSettings: mockLoadSettings,
      })
    );
    mockUpdateState();
  });

  it('checks for updates on demand', () => {
    const { getByText } = render(<SettingsScreen />);

    fireEvent.press(getByText('Check for updates'));

    expect(mockCheckForUpdates).toHaveBeenCalledWith();
  });

  it('disables the button and spins while checking', () => {
    mockUpdateState({ status: 'checking' });

    const { queryByText } = render(<SettingsScreen />);

    expect(queryByText('Check for updates')).toBeNull();
  });

  it('confirms when there is nothing newer', () => {
    mockUpdateState({ upToDate: true });

    const { getByText } = render(<SettingsScreen />);

    expect(getByText("You're on the latest version.")).toBeTruthy();
  });

  it('surfaces a check failure', () => {
    mockUpdateState({ status: 'error', error: 'GitHub returned 403' });

    const { getByText } = render(<SettingsScreen />);

    expect(getByText('GitHub returned 403')).toBeTruthy();
  });

  it('offers to install a pending update', () => {
    mockUpdateState({ status: 'available', update: { version: '1.2.0' } });

    const { getByText } = render(<SettingsScreen />);

    fireEvent.press(getByText(/Install version/));

    expect(mockStartUpdate).toHaveBeenCalled();
  });

  it.each(['downloading', 'installing'] as const)(
    'shows a spinner instead of the install button while %s',
    (status) => {
      mockUpdateState({ status, update: { version: '1.2.0' } });

      const { queryByText } = render(<SettingsScreen />);

      expect(queryByText(/Install version/)).toBeNull();
    }
  );
});
