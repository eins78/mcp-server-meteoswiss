import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import jest from 'eslint-plugin-jest';
import tsdoc from 'eslint-plugin-tsdoc';
import globals from 'globals';

export default [
  // Base JavaScript recommended rules
  js.configs.recommended,

  // TypeScript configuration
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        ...globals.node,
        ...globals.es2021,
        // TypeScript Node types
        NodeJS: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      tsdoc,
      prettier: prettierPlugin,
    },
    rules: {
      // TypeScript recommended rules
      ...typescript.configs.recommended.rules,

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],

      // Enforce explicit type imports
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],

      // Enforce return type declarations
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
        },
      ],

      // TSDoc rules
      'tsdoc/syntax': 'warn',
      
      // Prettier integration
      'prettier/prettier': 'error',
    },
  },

  // Prettier config to disable conflicting rules (must come after other configs)
  prettierConfig,

  // Test files
  {
    files: ['**/*.test.tsx', '**/*.test.ts'],
    ...jest.configs['flat/recommended'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      ...jest.configs['flat/recommended'].rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      'max-len': 'off',
    },
  },

  // Ignore patterns
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'vendor/**',
      '*.config.js',
      '*.config.ts',
    ],
  },
];
