/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // bun variant of the expo-recommended pattern (docs.expo.dev/develop/unit-testing)
  transformIgnorePatterns: [
    'node_modules/(?!(.bun|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg))',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    // reviewed exclusions per SPEC-native-foundation.md coverage policy:
    // route files hold only default-export declarations and are exercised
    // through router tests; type declarations carry no executable code
    '!src/app/**',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      lines: 90,
      statements: 90,
      functions: 90,
      branches: 90,
    },
  },
};
