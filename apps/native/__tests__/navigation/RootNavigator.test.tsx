import { render } from '@testing-library/react-native';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: any) => children,
    Screen: ({ name }: any) => {
      const React = require('react');
      const { View, Text } = require('react-native');
      return (
        <View testID={`screen-${name}`}>
          <Text>{name}</Text>
        </View>
      );
    },
  }),
}));

jest.mock('../../src/navigation/MainTabs', () => {
  const { Text } = require('react-native');
  return function MockMainTabs() { return <Text>MainTabs</Text>; };
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

import RootNavigator from '../../src/navigation/RootNavigator';

describe('RootNavigator', () => {
  it('registers MainTabs as the root screen', () => {
    const { getByTestId } = render(<RootNavigator />);
    expect(getByTestId('screen-MainTabs')).toBeTruthy();
  });

  it('registers all detail and reader screens', () => {
    const { getByTestId } = render(<RootNavigator />);
    expect(getByTestId('screen-Library')).toBeTruthy();
    expect(getByTestId('screen-Series')).toBeTruthy();
    expect(getByTestId('screen-BookDetail')).toBeTruthy();
    expect(getByTestId('screen-EpubReader')).toBeTruthy();
    expect(getByTestId('screen-PdfReader')).toBeTruthy();
    expect(getByTestId('screen-ComicReader')).toBeTruthy();
    expect(getByTestId('screen-Settings')).toBeTruthy();
  });
});
