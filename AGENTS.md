# AGENTS.md

This file provides guidance to AI coding assistants (like GitHub Copilot, Claude, Cursor, etc.) when working with code in this repository. It complements CLAUDE.md with vendor-neutral guidelines that any AI assistant can follow.

## Purpose

While CLAUDE.md contains Claude-specific instructions and context, this file provides general guidelines that apply to any AI coding assistant helping with this codebase. It focuses on coding standards, architectural patterns, and development practices.

## Coding Standards

### TypeScript Style

- Use explicit return types for functions
- Use type imports with the `type` keyword
- Follow verbatim module syntax (as configured in tsconfig.json)
- Use `type` for object shapes and primitives, and `interface` for intersections and extensions
- NEVER use enums - use simple string unions instead:
  ```typescript
  // ❌ Bad
  enum Color { Red, Blue }
  
  // ✅ Good
  type Color = "red" | "blue"
  ```

### Naming Conventions

- **Variables, parameters, functions**: camelCase
- **Classes, interfaces, types**: PascalCase
- **Constants**: UPPER_CASE
- **Files**: kebab-case for utilities, PascalCase for classes/types
- **Folders**: kebab-case
- Prefix interfaces with "I" only for interface inheritance (e.g., IDisposable)

### File Organization

- One export per file when possible
- Group related functionality in directories
- Use index.ts files to re-export from directories
- Keep files focused and under 300 lines when possible

## Commit Message Guidelines

1. Start with a concise summary line (50-72 characters), first character lowercase
2. Prefer simple words (e.g., "add" over "implement", "update" over "enhance")
3. Leave one blank line after the summary
4. Focus on WHY changes were made, not WHAT was changed
5. Reference issue numbers where applicable

Example:
```
add station metadata caching to improve API response time

Implemented in-memory caching layer to reduce database load for 
frequently requested station metadata. Required custom serialization 
due to complex nested objects.

Fixes #123
```

## Documentation Standards

1. Every module should include JSDoc comments for all exported functions, classes, and interfaces
2. Include parameter descriptions, return type descriptions, and examples
3. Document thrown exceptions
4. Update relevant documentation when changing functionality

Example:
```typescript
/**
 * Retrieves weather data for a specific station.
 * 
 * @param stationId - The unique identifier for the weather station
 * @param dateRange - The date range for which to retrieve data
 * @returns The weather data for the specified station and date range
 * @throws {StationNotFoundError} If the station ID is invalid
 * 
 * @example
 * ```ts
 * const data = await getWeatherData('ABC123', { start: '2023-01-01', end: '2023-01-31' });
 * ```
 */
export function getWeatherData(
  stationId: string, 
  dateRange: DateRange
): Promise<WeatherData> {
  // Implementation
}
```

## MCP-Specific Guidelines

When implementing MCP Resources or Tools:

1. Resources should be client-controlled, read-only data providers
2. Tools should be model-controlled functions with clear parameters
3. Implementation MUST use the `@modelcontextprotocol/sdk` (TypeScript SDK)
4. Ensure each Tool and Resource has a clear, concise description
5. Document authentication requirements in the implementation
6. Use the `McpServer` class from the SDK for server setup

## Testing Guidelines

1. Add unit tests for Zod schemas and small utilities where integration tests won't cover all edge cases
2. For public API (anything the MCP client will call), always add integration tests in `test/integration/`
3. Never reference files in `./vendor` directly - copy minimal subsets to `./test/__fixtures__` if needed
4. Always run tests with `pnpm test` after making changes

## Data Transformation Guidelines

When transforming MeteoSwiss data:

1. Use Zod schemas for validation during transformation
2. Maintain proper type definitions between raw data and schema data
3. Follow the data schema defined in docs/analysis/data-schema.md
4. Cache appropriately based on data update frequency

## Important Files Reference

When working on this project, be aware of these key files:

### Core Implementation
- `src/index.ts` - Main entry point for HTTP/SSE transport
- `src/server.ts` - MCP server implementation
- `src/transports/streamable-http.ts` - HTTP/SSE transport layer
- `package.json` - Project metadata and dependencies

### Schemas
- `src/schemas/weather-report.ts` - Weather report data schemas
- `src/schemas/meteoswiss-search.ts` - Search functionality schemas
- `src/schemas/meteoswiss-fetch.ts` - Content fetch schemas

### Tools
- `src/tools/meteoswiss-weather-report.ts` - Weather report MCP tool
- `src/tools/meteoswiss-search.ts` - Search functionality
- `src/tools/meteoswiss-fetch.ts` - Content fetching

### Data Access
- `src/data/weather-report-data.ts` - Weather data access functions
- `src/data/meteoswiss-endpoints.ts` - API endpoint definitions

### Support Utilities
- `src/support/environment-validation.ts` - Environment config validation
- `src/support/http-client.ts` - HTTP client with caching
- `src/support/security-middleware.ts` - Security middleware

### Test Fixtures
- `test/__fixtures__/` - Sample data for testing
- `test/integration/` - Integration tests

### Documentation
- `README.md` - Project overview
- `CLAUDE.md` - Claude-specific instructions and commands
- `docs/debugging-guide.md` - MCP debugging guide
- `docs/architecture/` - Architecture documentation
- `docs/analysis/` - Data analysis and schemas
- This file (`AGENTS.md`) - AI assistant guidelines

## MCP Server Debugging

When debugging MCP server connections:

1. Check Claude Desktop logs at `~/Library/Logs/Claude/` for connection errors
2. Use `SSEServerTransport` for HTTP/SSE transport or `StdioServerTransport` for stdio
3. Test your server locally before connecting to Claude Desktop
4. Use the `node:` prefix for Node.js built-in modules when working with ESM
5. See `docs/debugging-guide.md` for detailed debugging steps

## General AI Assistant Guidelines

1. **Be proactive but careful**: Suggest improvements but always explain the reasoning
2. **Follow existing patterns**: Study the codebase before making changes
3. **Test everything**: Run tests after changes, never skip this step
4. **Update documentation**: Keep docs in sync with code changes
5. **Ask when uncertain**: If something is unclear, ask for clarification rather than guessing

## Node.js and TypeScript Requirements

### Version Requirements
- Use Node.js 23.11.0 or later (specified in `.nvmrc` and `package.json` engines field)
- The project uses Node.js native TypeScript support when available
- For environment setup, suggest running `nvm use` to ensure correct Node.js version

### TypeScript Import Guidelines
- Always use the `type` keyword when importing types:
  ```typescript
  // ✅ Correct
  import type { MyType } from './types.ts';
  import { someFunction, type AnotherType } from './module.ts';
  
  // ❌ Incorrect - will cause runtime errors
  import { MyType } from './types.ts';
  ```

### Node.js Native TypeScript Limitations
- Does not support `enum` declarations (without experimental flags)
- No runtime `namespace` declarations
- No parameter properties
- No import aliases or path aliases from tsconfig.json

## Package Management

This project uses pnpm as the package manager. AI assistants should:

### Basic Commands
1. Always suggest pnpm commands instead of npm:
   - `pnpm install` instead of `npm install`
   - `pnpm add <pkg>` instead of `npm i <pkg>`
   - `pnpm run <script>` instead of `npm run <script>`

### Adding Dependencies
- Production dependencies: `pnpm add <package-name>`
- Development dependencies: `pnpm add -D <package-name>`
- Workspace root (if applicable): use `-w` or `--workspace-root` flag

### Best Practices
1. Always commit `pnpm-lock.yaml`
2. Never commit the `.pnpm` directory
3. When migrating from npm: delete `node_modules` and `package-lock.json` first
4. Run `pnpm install` after pulling changes that modify `pnpm-lock.yaml`