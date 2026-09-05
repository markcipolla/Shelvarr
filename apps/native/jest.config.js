module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!(.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|base-64|@openspacelabs/.*|react-native-render-html|react-native-pdf|jszip))',
  ],
  setupFiles: ['./jest.setup.ts'],
  // Jest's default is 5s per test, which is fine on a developer machine — the
  // whole suite runs in about 8s there — and not fine on a CI agent, where the
  // same suite takes 44s and BookDetailScreen's "renders book details after
  // load" tips over the limit. The web suite already runs with a 120s timeout
  // for the same reason. A generous timeout costs nothing on a passing test;
  // it only delays a failure that was going to fail anyway.
  testTimeout: 30000,
  moduleNameMapper: {
    'react-native/Libraries/Animated/NativeAnimatedHelper': '<rootDir>/__mocks__/NativeAnimatedHelper.ts',
    '^expo-image$': '<rootDir>/__mocks__/expo-image.tsx',
    '^expo-secure-store$': '<rootDir>/__mocks__/expo-secure-store.ts',
    '^expo-sqlite$': '<rootDir>/__mocks__/expo-sqlite.ts',
    '^expo-file-system/legacy$': '<rootDir>/__mocks__/expo-file-system/legacy.ts',
    '^expo-navigation-bar$': '<rootDir>/__mocks__/expo-navigation-bar.ts',
    '^expo-font$': '<rootDir>/__mocks__/expo-font.ts',
    '^react-native-pdf$': '<rootDir>/__mocks__/react-native-pdf.tsx',
    '^react-native-render-html$': '<rootDir>/__mocks__/react-native-render-html.tsx',
    '^@openspacelabs/react-native-zoomable-view$': '<rootDir>/__mocks__/@openspacelabs/react-native-zoomable-view.tsx',
    '^jszip$': '<rootDir>/__mocks__/jszip.ts',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'App.tsx',
    '!src/types/**',
    '!src/navigation/types.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
};
