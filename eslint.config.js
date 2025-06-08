import js from '@eslint/js';
import globals from 'globals';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import jsdoc from 'eslint-plugin-jsdoc';
import prettier from 'eslint-config-prettier';

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
      jsdoc,
    },
    rules: {
      // TypeScript recommended rules
      ...typescript.configs.recommended.rules,
      
      // Enforce explicit type imports
      '@typescript-eslint/consistent-type-imports': ['error', { 
        prefer: 'type-imports' 
      }],
      
      // Enforce return type declarations
      '@typescript-eslint/explicit-function-return-type': ['warn', {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
      }],
      
      // JSDoc rules
      'jsdoc/require-jsdoc': ['warn', {
        publicOnly: true,
        require: {
          FunctionDeclaration: true,
          MethodDefinition: true,
          ClassDeclaration: true,
          ArrowFunctionExpression: false,
          FunctionExpression: false,
        },
      }],
    },
    settings: {
      jsdoc: {
        mode: 'typescript',
      },
    },
  },
  
  // Prettier config to disable conflicting rules
  prettier,
  
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