import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  { files: ['app/**/*.{js,mjs}'], languageOptions: { globals: globals.browser } },
  { files: ['*.mjs', 'tests/**/*.mjs'], languageOptions: { globals: globals.node } },
];
