// Global mocks for React Native / Expo modules

jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

// Mock StatusBar
jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  rn.StatusBar.setHidden = jest.fn();
  return rn;
});

// Mock @react-navigation/native
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
      setOptions: jest.fn(),
    }),
    useRoute: () => ({ params: {} }),
    useFocusEffect: (cb: () => void) => {
      const { useEffect } = require('react');
      useEffect(() => { const cleanup = cb(); return typeof cleanup === 'function' ? cleanup : undefined; }, []);
    },
    NavigationContainer: ({ children }: any) => children,
  };
});

// Mock @react-navigation/native-stack
jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: any) => children,
    Screen: ({ children }: any) => children,
  }),
}));

// Mock expo-status-bar
jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

// Suppress console warnings/errors in tests
console.warn = jest.fn();
console.error = jest.fn();
