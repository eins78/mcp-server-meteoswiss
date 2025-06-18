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
- `src/index.ts` - Main entry point
- `src/server.ts` - MCP server implementation
- `package.json` - Project metadata and dependencies

### Schemas
- `src/schemas/weather-report.ts` - Weather report data schemas

### Tools
- `src/tools/get-weather-report.ts` - Weather report MCP tool

### Data Access
- `src/data/weather-report-data.ts` - Weather data access functions

### Documentation
- `README.md` - Project overview
- `CLAUDE.md` - Claude-specific instructions
- `docs/` - Detailed documentation
- This file (`AGENTS.md`) - AI assistant guidelines

## General AI Assistant Guidelines

1. **Be proactive but careful**: Suggest improvements but always explain the reasoning
2. **Follow existing patterns**: Study the codebase before making changes
3. **Test everything**: Run tests after changes, never skip this step
4. **Update documentation**: Keep docs in sync with code changes
5. **Ask when uncertain**: If something is unclear, ask for clarification rather than guessing

## Node.js Version Requirements

- Use Node.js 23.11.0 or later (specified in `.nvmrc` and `package.json` engines field)
- The project uses Node.js native TypeScript support when available
- For environment setup, suggest running `nvm use` to ensure correct Node.js version

## Package Management

This project uses pnpm. AI assistants should:
1. Always suggest pnpm commands instead of npm
2. Use `pnpm add` for dependencies, `pnpm add -D` for dev dependencies
3. Remind users to commit `pnpm-lock.yaml` but not `.pnpm` directory