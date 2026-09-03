import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import App from '../App';
import { useSettingsStore } from '../src/stores/useSettingsStore';
import { useDownloadStore } from '../src/stores/useDownloadStore';
import { useComicDownloadStore } from '../src/stores/useComicDownloadStore';
import { useUpdateStore } from '../src/stores/useUpdateStore';
import { retryOfflineQueue } from '../src/services/progressSync';
import * as Font from 'expo-font';

// Prefixed with `mock` so jest's hoisting of the factories below allows the
// reference; the tests reassign these to drive which screen App renders.
let mockAuthState = 'disabled';
let mockSettings = { loaded: true, onboardingComplete: true };
const mockLoadAuth = jest.fn();

jest.mock('../src/stores/useSettingsStore', () => ({
  useSettingsStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => selector(mockSettings),
    { getState: jest.fn() }
  ),
}));
jest.mock('../src/stores/useAuthStore', () => ({
  useAuthStore: Object.assign(
    (selector: (state: { state: string }) => unknown) => selector({ state: mockAuthState }),
    { getState: () => ({ loadAuth: mockLoadAuth }) }
  ),
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
jest.mock('../src/stores/useUpdateStore', () => ({
  useUpdateStore: {
    getState: jest.fn(),
  },
}));
jest.mock('../src/components/UpdateBanner', () => {
  const { Text } = require('react-native');
  return function MockUpdateBanner() {
    return <Text>UpdateBanner</Text>;
  };
});
jest.mock('../src/services/progressSync', () => ({
  retryOfflineQueue: jest.fn(),
}));
jest.mock('../src/navigation/RootNavigator', () => {
  const { Text } = require('react-native');
  return function MockRootNavigator() {
    return <Text>RootNavigator</Text>;
  };
});
jest.mock('../src/screens/OnboardingScreen', () => {
  const { Text } = require('react-native');
  return function MockOnboardingScreen() {
    return <Text>OnboardingScreen</Text>;
  };
});

describe('App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = 'disabled';
    mockSettings = { loaded: true, onboardingComplete: true };
    (useSettingsStore.getState as jest.Mock).mockReturnValue({
      loadSettings: jest.fn().mockResolvedValue(undefined),
    });
    (useDownloadStore.getState as jest.Mock).mockReturnValue({ loadDownloads: jest.fn() });
    (useComicDownloadStore.getState as jest.Mock).mockReturnValue({ loadDownloads: jest.fn() });
    (useUpdateStore.getState as jest.Mock).mockReturnValue({
      loadDismissed: jest.fn().mockResolvedValue(undefined),
      check: jest.fn(),
    });
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

  it('checks the sign-in state once settings have loaded', async () => {
    render(<App />);

    await waitFor(() => {
      expect(mockLoadAuth).toHaveBeenCalled();
    });
  });

  it('checks for an app update once the dismissed version is loaded', async () => {
    const check = jest.fn();
    const loadDismissed = jest.fn().mockResolvedValue(undefined);
    (useUpdateStore.getState as jest.Mock).mockReturnValue({ loadDismissed, check });

    render(<App />);

    expect(loadDismissed).toHaveBeenCalled();
    await waitFor(() => expect(check).toHaveBeenCalledWith({ silent: true }));
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

  it('waits before choosing a screen while the sign-in state is unknown', async () => {
    mockAuthState = 'unknown';

    const { queryByText } = render(<App />);

    await waitFor(() => {
      expect(mockLoadAuth).toHaveBeenCalled();
    });
    expect(queryByText('RootNavigator')).toBeNull();
    expect(queryByText('OnboardingScreen')).toBeNull();
  });

  it('waits for stored settings before choosing a screen', async () => {
    // Onboarding defaults to unfinished, so rendering before the stored flag
    // has been read would flash setup at someone who finished it long ago.
    mockSettings = { loaded: false, onboardingComplete: false };

    const { queryByText } = render(<App />);

    await waitFor(() => {
      expect(mockLoadAuth).toHaveBeenCalled();
    });
    expect(queryByText('RootNavigator')).toBeNull();
    expect(queryByText('OnboardingScreen')).toBeNull();
  });

  it('runs setup on a fresh install', async () => {
    mockSettings = { loaded: true, onboardingComplete: false };

    const { getByText } = render(<App />);

    await waitFor(() => {
      expect(getByText('OnboardingScreen')).toBeTruthy();
    });
  });

  it('keeps the library reachable when signed out, for what is downloaded', async () => {
    mockAuthState = 'signed-out';

    const { getByText } = render(<App />);

    await waitFor(() => {
      expect(getByText('RootNavigator')).toBeTruthy();
    });
  });

  it('shows the library when signed in', async () => {
    mockAuthState = 'signed-in';

    const { getByText } = render(<App />);

    await waitFor(() => {
      expect(getByText('RootNavigator')).toBeTruthy();
    });
  });

  it('offers the update prompt even during setup', async () => {
    // An old build is exactly what a server that now wants a login will
    // refuse, so the way to update has to be reachable from setup rather
    // than sitting behind it.
    mockSettings = { loaded: true, onboardingComplete: false };

    const { getByText } = render(<App />);

    await waitFor(() => {
      expect(getByText('OnboardingScreen')).toBeTruthy();
    });
    expect(getByText('UpdateBanner')).toBeTruthy();
  });
});
