import { render } from '@testing-library/react-native';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));

let capturedScreenOptions: any;

jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({ children, screenOptions }: any) => {
      capturedScreenOptions = screenOptions;
      return children;
    },
    Screen: ({ name, options }: any) => {
      const React = require('react');
      const { View, Text } = require('react-native');
      return (
        <View testID={`tab-${name}`}>
          <Text>{options?.title ?? name}</Text>
        </View>
      );
    },
  }),
}));

jest.mock('../../src/screens/HomeScreen', () => {
  const { Text } = require('react-native');
  return function MockHomeScreen() { return <Text>HomeScreen</Text>; };
});
jest.mock('../../src/screens/BooksScreen', () => {
  const { Text } = require('react-native');
  return function MockBooksScreen() { return <Text>BooksScreen</Text>; };
});
jest.mock('../../src/screens/ComicsScreen', () => {
  const { Text } = require('react-native');
  return function MockComicsScreen() { return <Text>ComicsScreen</Text>; };
});
jest.mock('../../src/screens/WantedListScreen', () => {
  const { Text } = require('react-native');
  return function MockWantedListScreen() { return <Text>WantedListScreen</Text>; };
});
jest.mock('../../src/screens/SettingsScreen', () => {
  const { Text } = require('react-native');
  return function MockSettingsScreen() { return <Text>SettingsScreen</Text>; };
});

import MainTabs from '../../src/navigation/MainTabs';

describe('MainTabs', () => {
  it('gives Settings a tab of its own', () => {
    const { getByTestId } = render(<MainTabs />);
    expect(getByTestId('tab-Settings')).toBeTruthy();
  });

  it('keeps the four library tabs alongside it', () => {
    const { getByTestId } = render(<MainTabs />);
    expect(getByTestId('tab-Home')).toBeTruthy();
    expect(getByTestId('tab-Books')).toBeTruthy();
    expect(getByTestId('tab-Comics')).toBeTruthy();
    expect(getByTestId('tab-Wanted')).toBeTruthy();
  });

  it('no longer puts a settings button in the header', () => {
    // The gear moved to the tab bar; leaving the header copy behind would be
    // two ways to reach the same screen.
    render(<MainTabs />);
    expect(capturedScreenOptions.headerRight).toBeUndefined();
  });
});
