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

// Nothing in the suite should reach the network. Tests that exercise a fetch
// mock it themselves; this is here so the ones that forget fail loudly instead
// of quietly calling api.github.com (or whichever server URL a store happens to
// be holding). Requests to the loopback address still go through, since that is
// where a local Shelvarr server would be.
const realFetch: typeof fetch | undefined = global.fetch;

global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const isExternal = /^https?:\/\//i.test(target) && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(target);

  if (isExternal) {
    throw new TypeError(`Blocked network request to ${target} — mock fetch in the test.`);
  }
  if (!realFetch) {
    throw new TypeError('fetch is not available in this test environment');
  }
  return realFetch(input, init);
}) as typeof fetch;
