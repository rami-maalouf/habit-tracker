// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

// flat config: a later block's rule value replaces an earlier one for files
// matching both, so the feature-scope block repeats the theme pattern
const themeImportPattern = {
  group: ['@/theme/*', '**/theme/colors', '**/theme/spacing', '**/theme/typography', '**/theme/radius', '**/theme/shadows', '**/theme/motion'],
  message: 'import theme tokens from @/theme only',
};

const persistenceImportPattern = {
  group: ['@/core/persistence/*', '**/core/persistence/*', 'expo-sqlite'],
  message: 'use commands and queries from @/core/domain instead of raw persistence',
};

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // the theme is consumed only through its public entry point
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    ignores: ['src/theme/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [themeImportPattern] }],
    },
  },
  {
    // feature and route code additionally never reaches persistence directly:
    // every mutation goes through the named commands and queries
    files: ['src/app/**/*.{ts,tsx}', 'src/features/**/*.{ts,tsx}', 'src/widgets/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [themeImportPattern, persistenceImportPattern] },
      ],
    },
  },
]);
