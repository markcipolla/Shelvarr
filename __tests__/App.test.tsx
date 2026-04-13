import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import App from '../App';
import { useAuthStore } from '../src/stores/useAuthStore';
import { useSettingsStore } from '../src/stores/useSettingsStore';
import { retryOfflineQueue } from '../src/services/progressSync';
import * as Font from 'expo-font';

jest.mock('../src/stores/useAuthStore');
jest.mock('../src/stores/useSettingsStore', () => ({
  useSettingsStore: {
    getState: jest.fn().mockReturnValue({ loadSettings: jest.fn() }),
  },
}));
jest.mock('../src/services/progressSync', () => ({
  retryOfflineQueue: jest.fn(),
}));
jest.mock('../src/navigation/RootNavigator', () => {
  const { Text } = require('react-native');
  return function MockRootNavigator() {
    return <Text>RootNavigator</Text>;
  };
});

const mockLoadCredentials = jest.fn();
const mockUseAuthStore = useAuthStore as unknown as jest.Mock;

describe('App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadCredentials.mockReturnValue(undefined);
    (Font.loadAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('shows loading spinner when auth is loading', () => {
    mockUseAuthStore.mockImplementation((selector: any) =>
      selector({ isLoading: true, loadCredentials: mockLoadCredentials })
    );

    const { toJSON } = render(<App />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders NavigationContainer when loaded', async () => {
    mockUseAuthStore.mockImplementation((selector: any) =>
      selector({ isLoading: false, loadCredentials: mockLoadCredentials })
    );

    const { getByText } = render(<App />);

    await waitFor(() => {
      expect(getByText('RootNavigator')).toBeTruthy();
    });
  });

  it('calls loadCredentials and retryOfflineQueue on mount', () => {
    mockUseAuthStore.mockImplementation((selector: any) =>
      selector({ isLoading: false, loadCredentials: mockLoadCredentials })
    );

    render(<App />);

    expect(mockLoadCredentials).toHaveBeenCalled();
    expect(retryOfflineQueue).toHaveBeenCalled();
    expect(useSettingsStore.getState().loadSettings).toHaveBeenCalled();
  });

  it('continues without fonts on loadAsync failure', async () => {
    (Font.loadAsync as jest.Mock).mockRejectedValue(new Error('font fail'));
    mockUseAuthStore.mockImplementation((selector: any) =>
      selector({ isLoading: false, loadCredentials: mockLoadCredentials })
    );

    const { getByText } = render(<App />);

    await waitFor(() => {
      expect(getByText('RootNavigator')).toBeTruthy();
    });
  });

  it('shows loading when fonts not ready', () => {
    (Font.loadAsync as jest.Mock).mockReturnValue(new Promise(() => {}));
    mockUseAuthStore.mockImplementation((selector: any) =>
      selector({ isLoading: false, loadCredentials: mockLoadCredentials })
    );

    const { toJSON } = render(<App />);
    // Still loading since fonts not ready
    expect(toJSON()).toBeTruthy();
  });
});
