import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import App from '../App';
import { useSettingsStore } from '../src/stores/useSettingsStore';
import { useDownloadStore } from '../src/stores/useDownloadStore';
import { useComicDownloadStore } from '../src/stores/useComicDownloadStore';
import { retryOfflineQueue } from '../src/services/progressSync';
import * as Font from 'expo-font';

jest.mock('../src/stores/useSettingsStore', () => ({
  useSettingsStore: {
    getState: jest.fn().mockReturnValue({ loadSettings: jest.fn() }),
  },
}));
jest.mock('../src/stores/useDownloadStore', () => ({
  useDownloadStore: {
    getState: jest.fn().mockReturnValue({ loadDownloads: jest.fn() }),
  },
}));
jest.mock('../src/stores/useComicDownloadStore', () => ({
  useComicDownloadStore: {
    getState: jest.fn().mockReturnValue({ loadDownloads: jest.fn() }),
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

describe('App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSettingsStore.getState as jest.Mock).mockReturnValue({ loadSettings: jest.fn() });
    (useDownloadStore.getState as jest.Mock).mockReturnValue({ loadDownloads: jest.fn() });
    (useComicDownloadStore.getState as jest.Mock).mockReturnValue({ loadDownloads: jest.fn() });
    (Font.loadAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('renders without crashing while fonts load', () => {
    const { toJSON } = render(<App />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders NavigationContainer when fonts are loaded', async () => {
    const { getByText } = render(<App />);

    await waitFor(() => {
      expect(getByText('RootNavigator')).toBeTruthy();
    });
  });

  it('loads settings, downloads, and retries offline queue on mount', () => {
    render(<App />);

    expect(useSettingsStore.getState().loadSettings).toHaveBeenCalled();
    expect(useDownloadStore.getState().loadDownloads).toHaveBeenCalled();
    expect(useComicDownloadStore.getState().loadDownloads).toHaveBeenCalled();
    expect(retryOfflineQueue).toHaveBeenCalled();
  });

  it('continues without fonts on loadAsync failure', async () => {
    (Font.loadAsync as jest.Mock).mockRejectedValue(new Error('font fail'));

    const { getByText } = render(<App />);

    await waitFor(() => {
      expect(getByText('RootNavigator')).toBeTruthy();
    });
  });

  it('shows loading spinner while fonts not ready', () => {
    (Font.loadAsync as jest.Mock).mockReturnValue(new Promise(() => {}));

    const { toJSON } = render(<App />);
    expect(toJSON()).toBeTruthy();
  });
});
