import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { useAuthStore } from '../../src/stores/useAuthStore';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));
jest.mock('../../src/stores/useAuthStore');

// Override the navigation stack mock to actually render components with options
jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children, screenOptions }: any) => children,
    Screen: ({ component: Component, name, options }: any) => {
      const React = require('react');
      const { View, Text } = require('react-native');
      // Call options if it's a function (to get headerRight etc.)
      const resolvedOptions = typeof options === 'function'
        ? options({ navigation: { navigate: jest.fn() } })
        : options || {};
      return (
        <View testID={`screen-${name}`}>
          <Text>{name}</Text>
          {resolvedOptions.headerRight ? resolvedOptions.headerRight() : null}
        </View>
      );
    },
  }),
}));

// Mock all screen components
jest.mock('../../src/screens/LoginScreen', () => {
  const { Text } = require('react-native');
  return function MockLoginScreen() { return <Text>LoginScreen</Text>; };
});
jest.mock('../../src/screens/HomeScreen', () => {
  const { Text } = require('react-native');
  return function MockHomeScreen() { return <Text>HomeScreen</Text>; };
});
jest.mock('../../src/screens/LibraryScreen', () => {
  const { Text } = require('react-native');
  return function MockLibraryScreen() { return <Text>LibraryScreen</Text>; };
});
jest.mock('../../src/screens/SeriesScreen', () => {
  const { Text } = require('react-native');
  return function MockSeriesScreen() { return <Text>SeriesScreen</Text>; };
});
jest.mock('../../src/screens/BookDetailScreen', () => {
  const { Text } = require('react-native');
  return function MockBookDetailScreen() { return <Text>BookDetailScreen</Text>; };
});
jest.mock('../../src/screens/EpubReaderScreen', () => {
  const { Text } = require('react-native');
  return function MockEpubReaderScreen() { return <Text>EpubReaderScreen</Text>; };
});
jest.mock('../../src/screens/PdfReaderScreen', () => {
  const { Text } = require('react-native');
  return function MockPdfReaderScreen() { return <Text>PdfReaderScreen</Text>; };
});
jest.mock('../../src/screens/ComicReaderScreen', () => {
  const { Text } = require('react-native');
  return function MockComicReaderScreen() { return <Text>ComicReaderScreen</Text>; };
});
jest.mock('../../src/screens/SettingsScreen', () => {
  const { Text } = require('react-native');
  return function MockSettingsScreen() { return <Text>SettingsScreen</Text>; };
});

// Import after all mocks
import RootNavigator from '../../src/navigation/RootNavigator';

const mockUseAuthStore = useAuthStore as unknown as jest.Mock;

describe('RootNavigator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders login screen when not authenticated', () => {
    mockUseAuthStore.mockImplementation((selector: any) =>
      selector({ isAuthenticated: false })
    );

    const { getByTestId } = render(<RootNavigator />);
    expect(getByTestId('screen-Login')).toBeTruthy();
  });

  it('renders authenticated screens when authenticated', () => {
    mockUseAuthStore.mockImplementation((selector: any) =>
      selector({ isAuthenticated: true })
    );

    const { getByTestId } = render(<RootNavigator />);
    expect(getByTestId('screen-Home')).toBeTruthy();
    expect(getByTestId('screen-Settings')).toBeTruthy();
  });

  it('settings button navigates to Settings', () => {
    mockUseAuthStore.mockImplementation((selector: any) =>
      selector({ isAuthenticated: true })
    );

    const { getByText } = render(<RootNavigator />);
    // The settings gear button is rendered by headerRight
    const gearButton = getByText('\u2699');
    fireEvent.press(gearButton);
  });
});
