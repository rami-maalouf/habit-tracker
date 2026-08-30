/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // bun variant of the expo-recommended pattern (docs.expo.dev/develop/unit-testing),
  // plus standard-navigation, which expo-router 57 depends on and ships as esm
  transformIgnorePatterns: [
    'node_modules/(?!(.bun|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|standard-navigation|@sentry/react-native|native-base|react-native-svg))',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    // reviewed exclusions per SPEC-native-foundation.md coverage policy:
    // route files hold only default-export declarations and are exercised
    // through router tests; type declarations carry no executable code
    '!src/app/**',
    '!src/**/*.d.ts',
    // reviewed exclusion: test infrastructure (render helper and mocks) is
    // not product logic
    '!src/testing/**',
  ],
  moduleNameMapper: {
    // reviewed behavior-focused mock: jest-expo provides no @expo/ui mock and
    // the real package requires the native ObservableState runtime
    '^@expo/ui$': '<rootDir>/src/testing/expo-ui.mock.tsx',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  coverageThreshold: {
    global: {
      lines: 90,
      statements: 90,
      functions: 90,
      branches: 90,
    },
  },
};
