# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. It contains key information and context needed to assist with development, debugging, and decision making.

## How to Use This File

1. **Project Context**: Brief overview of the project's purpose, architecture, and main components
2. **Design Decisions**: Document major design or implementation decisions, along with their rationale and any trade-offs considered
3. **Open Tasks and Issues**: List outstanding tasks, bugs, or technical debt
4. **References**: Include links to relevant documentation, tickets, or external resources
5. **Update Regularly**: Keep this file current whenever the project context changes or new decisions are made

## Essential Commands

### Development
- **Run development server with hot reloading**: `pnpm run dev`
- **Start server**: `pnpm run start`
- **Test with MCP Inspector**: `pnpm run dev:inspect`
- **Type checking**: `pnpm run lint` (runs both TypeScript and ESLint checks)
- **Run tests**: `pnpm test`
- **Run integration tests**: `pnpm test:integration`
- **Format code**: `pnpm run format`

### Build (when needed)
- **Build project**: `pnpm run build`

### Git Commands (Devcontainer)
When running in a devcontainer, use the following for git commits:
- **Commit without GPG signing**: `git commit --no-gpg-sign -m "commit message"`

## Architecture Overview

This is a Model Context Protocol (MCP) server for MeteoSwiss weather data, implemented using:
- **Node.js 18+**: Using `tsx` for TypeScript execution
- **MCP TypeScript SDK**: Using `McpServer` class with HTTP/SSE transport
- **Zod**: For runtime validation and schema definitions
- **Express + SSE**: For HTTP transport with Server-Sent Events
- **mcp-remote**: For Claude Desktop integration

### Key Components

1. **Entry Point** (`src/index.ts`): HTTP server with SSE endpoint
2. **Core Server** (`src/server.ts`): MCP server implementation
3. **Transport** (`src/transports/streamable-http.ts`): HTTP server with SSE
   - `/` - Information endpoint
   - `/mcp` - MCP SSE endpoint
   - `/messages` - Message handling endpoint
   - `/health` - Health check endpoint
4. **Tools** (`src/tools/`): MCP tools for weather data queries
   - `getWeatherReport`: Retrieves weather reports for Swiss regions (north/south/west) in multiple languages
5. **Data Layer** (`src/data/`): Handles fetching from MeteoSwiss HTTP endpoints
6. **Schemas** (`src/schemas/`): Zod schemas for input validation
7. **Utils** (`src/utils/`): HTTP client and other utilities

### Data Flow
1. MCP client connects via `mcp-remote` to HTTP endpoint
2. Tool requests are validated using Zod schemas
3. Data is fetched from MeteoSwiss HTTP endpoints (or test fixtures in dev mode)
4. Results are returned as JSON through MCP protocol

## Critical Development Guidelines

### TypeScript Import Rules
Always use the `type` keyword for type imports:
```typescript
import type { MyType } from './types.ts';
import { someFunction, type AnotherType } from './module.ts';
```

### TypeScript with tsx
- Uses `tsx` for TypeScript execution (no build step needed)
- All imports must use `.js` extensions (even for `.ts` files)
- No path aliases from tsconfig.json

### TypeScript Coding Standards
- **Production Code**: Be strict - avoid `!`, `as`, and `any`. Handle all edge cases explicitly
- **Test Code**: Be lenient - use `!` and type assertions where it improves readability
- **Enums**: Never use TypeScript enums. Use const objects/arrays with `as const` instead:
  ```typescript
  // ❌ Bad
  enum Status { Active, Inactive }
  
  // ✅ Good
  const STATUS = ['active', 'inactive'] as const;
  type Status = typeof STATUS[number];
  
  // ✅ Also good
  const STATUS = {
    ACTIVE: 'active',
    INACTIVE: 'inactive'
  } as const;
  type Status = typeof STATUS[keyof typeof STATUS];
  ```
- **Type Guards**: Always provide type guard functions alongside types:
  ```typescript
  type User = { id: string; name: string };
  
  function isUser(value: unknown): value is User {
    return (
      typeof value === 'object' &&
      value !== null &&
      'id' in value &&
      'name' in value &&
      typeof value.id === 'string' &&
      typeof value.name === 'string'
    );
  }
  ```

### Testing Strategy
- **Integration tests** in `test/integration/` for all MCP tools
- **Test fixtures** in `test/__fixtures__/` to avoid external dependencies
- Environment variable `USE_TEST_FIXTURES=true` automatically set for Claude Desktop

### Code Standards
- Use explicit return types for functions
- JSDoc comments for all exported functions
- Follow existing patterns in codebase
- Never reference `./vendor` files directly in code

### Node.js Built-in Imports
Always import Node.js built-in modules with the `node:` prefix for clarity and future compatibility:
- **Correct**: `import * as path from 'node:path'`, `import { readFile } from 'node:fs/promises'`
- **Incorrect**: `import * as path from 'path'`, `import { readFile } from 'fs/promises'`

### File Naming Convention
Follow consistent naming schemes:
- **Functions/utilities**: `kebab-case` (e.g., `get-weather-report.ts`, `http-client.ts`)
- **Classes**: `PascalCase` (e.g., `WeatherService.ts`, `DataLoader.ts`)
- **Tests**: Match the file they test with `.test.ts` suffix

### Documentation Strategy
Prefer comprehensive JSDoc/TSDoc comments for implementation details and README for architecture:
- **JSDoc/TSDoc**: Complete API documentation with examples, parameters, return types, and usage patterns
- **README**: High-level architecture, data flow, system design, and getting started information
- **Code Comments**: Minimal but exhaustive - only explain unusual implementations, workarounds, or performance optimizations
- **Avoid**: Obvious comments that restate what the code clearly shows

## MCP Tool Implementation

When implementing MCP tools:
1. Define Zod schema for parameters in `src/schemas/`
2. Implement tool logic in `src/tools/`
3. Register tool in `src/server.ts` using `server.tool()`
4. Add integration tests in `test/integration/`
5. Document tool behavior and parameters

### Transport Support
- **HTTP/SSE**: Server runs on configurable port (default: 3000)
- **mcp-remote**: Used for Claude Desktop integration
- Supports multiple concurrent sessions

## Environment Variables
- `USE_TEST_FIXTURES`: When `true`, uses local test data instead of HTTP requests
- `PORT`: Server port (default: 3000, not used in stdio mode)

### Configuration Management Strategy
Fail fast with helpful error messages instead of silent fallbacks:
- **No Default Values**: Don't provide fallback strings for required configuration (API keys, model names, etc.)
- **Strict Validation**: Validate all required environment variables at startup with clear error messages
- **Helpful Errors**: Include examples and guidance in configuration error messages
- **Test Configuration**: Use `cross-env` in package.json scripts to set test environment variables explicitly
- **Mock Support**: Provide appropriate test fixtures and mocking for testing without real API calls

## Debugging
- Logs are written to stderr (using `console.error`) to avoid interfering with MCP communication
- See `docs/debugging-guide.md` for Claude Desktop debugging tips

## Development Workflow

### Mandatory Practices
1. **ALWAYS Run Tests Before Committing**: Before any commit, run `pnpm run test && pnpm run test:integration` to ensure all tests pass. This is CRITICAL.
2. **Run Tests After Changes**: After each change, run `pnpm test` to catch regressions early
3. **Dependency Management**: Always use pnpm CLI to add or remove dependencies so correct versions are recorded in `package.json`
4. **Documentation Updates**: Always update documentation when changing code, especially:
   - **README.md**: Update when adding features, changing architecture, or modifying usage instructions
   - **CLAUDE.md**: Update project context, design decisions, and open tasks when making significant changes
   - **JSDoc/TSDoc**: Add comprehensive comments to new types, classes, and functions
   - **Code Examples**: Update examples in README when APIs or usage patterns change

### Package Management
- **Never install packages globally**: Always install dependencies as dev dependencies in the project
- **Running commands**: Use `npx` for one-off commands in shell, or define scripts in `package.json`
- **Example**: Instead of `npm install -g typescript`, use `pnpm add -D typescript` and run with `npx tsc` or via package.json scripts

## Open Tasks and Issues
<!-- Document outstanding tasks, bugs, or technical debt here -->

## Design Decisions
<!-- Document major design or implementation decisions, along with their rationale -->

## References
<!-- Include links to relevant documentation, tickets, or external resources -->
- [MCP Protocol Documentation](https://spec.modelcontextprotocol.io/)
- [MeteoSwiss API Documentation](https://www.meteoswiss.admin.ch/)