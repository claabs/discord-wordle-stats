import path from 'node:path';

import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import { configs, plugins, rules } from 'eslint-config-airbnb-extended';
import prettierPlugin from 'eslint-plugin-prettier/recommended';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';

const gitignorePath = path.resolve('.', '.gitignore');

const jsConfig = defineConfig([
  // ESLint Recommended Rules
  {
    name: 'js/config',
    ...js.configs.recommended,
  },
  // Stylistic Plugin
  plugins.stylistic,
  // Import X Plugin
  plugins.importX,
  // Airbnb Base Recommended Config
  ...configs.base.recommended,
  // Strict Import Config
  rules.base.importsStrict,
]);

const nodeConfig = defineConfig([
  // Node Plugin
  plugins.node,
  // Airbnb Node Recommended Config
  ...configs.node.recommended,
]);

const typescriptConfig = defineConfig([
  // TypeScript ESLint Plugin
  plugins.typescriptEslint,
  // Airbnb Base TypeScript Config
  ...configs.base.typescript,
  // Strict TypeScript Config
  rules.typescript.typescriptEslintStrict,
]);

export default defineConfig([
  // Ignore .gitignore files/folder in eslint
  includeIgnoreFile(gitignorePath),
  // Javascript Config
  ...jsConfig,
  // Node Config
  ...nodeConfig,
  // TypeScript Config
  ...typescriptConfig,
  // Unicorn Config
  eslintPluginUnicorn.configs.recommended,
  // My overrides
  {
    name: 'project/overrides',
    rules: {
      'import-x/prefer-default-export': 0, // default export is dumb
      'import-x/extensions': ['error', 'ignorePackages', { ts: 'always' }], // Node native TS support
      'unicorn/prefer-ternary': ['error', 'only-single-line'], // Hard to read
      'unicorn/prefer-switch': 'off', // Too wordy
      'unicorn/prevent-abbreviations': 'off', // Unrealistic
      'no-restricted-syntax': ['error', 'ForInStatement', 'LabeledStatement', 'WithStatement'], // Remove Airbnb's ban on for..of
    },
  },
  // Prettier Config
  prettierPlugin,
]);
