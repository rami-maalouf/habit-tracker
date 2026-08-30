// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

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
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/theme/*', '**/theme/colors', '**/theme/spacing', '**/theme/typography', '**/theme/radius', '**/theme/shadows', '**/theme/motion'],
              message: 'import theme tokens from @/theme only',
            },
          ],
        },
      ],
    },
  },
]);
