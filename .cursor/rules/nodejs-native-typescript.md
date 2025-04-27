# Node.js 23 Native TypeScript Development Guidelines

This project uses Node.js 23's native TypeScript support, eliminating the need for a build step.

## Requirements

- Use Node.js 23.11.0 or later (specified in `.nvmrc` and `package.json` engines field)
- For environment setup, run `nvm use` to ensure the correct Node.js version
- Package managers will automatically check Node.js version compatibility based on the engines field

## Development Workflow

1. Write TypeScript code directly in the `src` directory
2. Use `pnpm run dev` to run the application with automatic reloading
3. Use `pnpm run lint` to check TypeScript types without emitting JavaScript files

## TypeScript Import Guidelines

- Always use the `type` keyword when importing types:

  ```typescript
  // Correct
  import type { MyType } from './types.ts';
  import { someFunction, type AnotherType } from './module.ts';
  
  // Incorrect - will cause runtime errors
  import { MyType } from './types.ts';
  ```

## Limitations

- Node.js native TypeScript does not support:
  - `enum` declarations (without `--experimental-transform-types` flag)
  - Runtime `namespace` declarations
  - Parameter properties
  - Import aliases
  - Path aliases from tsconfig.json

## Documentation

- All code should include JSDoc comments for exported functions, classes, and interfaces
- Always include parameter types, return types, and example usage where appropriate
