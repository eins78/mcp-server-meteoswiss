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
- **Node.js 22+**: Using `tsx` for TypeScript execution
- **MCP TypeScript SDK 1.28+**: Using `McpServer` class with Streamable HTTP transport (spec 2025-11-25)
- **Zod 4**: For runtime validation and schema definitions
- **Express + Streamable HTTP**: For HTTP transport with MCP Streamable HTTP protocol
- **mcp-remote**: For Claude Desktop integration

### Key Components

1. **Entry Point** (`src/index.ts`): HTTP server with Streamable HTTP transport
2. **Core Server** (`src/server.ts`): MCP server implementation (factory pattern — one instance per session)
3. **Transport** (`src/transports/streamable-http.ts`): HTTP server with Streamable HTTP
   - `/` - Information endpoint
   - `/mcp` - MCP Streamable HTTP endpoint (POST: requests, GET: SSE notifications, DELETE: session termination)
   - `/health` - Health check endpoint
4. **Tools** (`src/tools/`, `src/data/`): MCP tools for weather data
   - `meteoswissLocalForecast`: Multi-day forecasts for ~6000 Swiss locations (postal codes, stations, place names)
   - `meteoswissCurrentWeather`: Real-time measurements from ~160 automatic weather stations
   - `meteoswissStations`: Station discovery and search by name, canton, or coordinates
   - `meteoswissPollenData`: Pollen concentration monitoring from ~15 stations
   - `search`: Search MeteoSwiss website content
   - `fetch`: Fetch full content from MeteoSwiss pages
5. **Data Layer** (`src/data/`): STAC API client, disk-based CSV cache, station resolver, geocoding
6. **Schemas** (`src/schemas/`): Zod schemas for input validation
7. **Support** (`src/support/`): Supporting infrastructure - logging, validation, HTTP communication, session management

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
- **Unknown Types**: Always use `unknown` instead of `any` for external/unknown types. This forces proper type checking before use
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
- **Domain Types Over Loose Types**: Always prefer specific domain types over loose generic types for better type safety and compile-time validation:
  ```typescript
  // ❌ Bad - loose typing allows any string
  const languageMap: Record<string, string> = { de: 'de', fr: 'fr' };
  
  // ✅ Good - using domain type restricts to valid values
  const languageMap: Record<Language, string> = { de: 'de', fr: 'fr' };
  
  // ❌ Bad - loose string parameter
  function processLanguage(lang: string) { ... }
  
  // ✅ Good - using domain type enforces valid input
  function processLanguage(lang: Language) { ... }
  ```

### Testing Strategy
- **Integration tests** in `test/integration/` for all MCP tools
- **Test fixtures** in `test/__fixtures__/` to avoid external dependencies
- Environment variable `USE_TEST_FIXTURES=true` automatically set for Claude Desktop

### Testing Anti-Patterns
- **Never use conditional assertions** (`if (value) expect(value)...`) — these silently pass on the exact failure they should catch. Assert the value must exist, or use `expect.any(Type)`.
- **Assert content, not just structure** — checking `Array.isArray(result)` passes for an array of nulls. Verify at least one entry has the expected non-null fields.
- **Fixture resolver must fail-fast** — when `USE_TEST_FIXTURES=true`, any URL not mapped in `resolveFixturePath` throws. Never fall through to live network in tests.
- **When adding a new data parameter**, always add: (1) the param to `resolveFixturePath`'s allowlist in `ogd-data-store.ts`, (2) a fixture CSV in `test/__fixtures__/ogd/`, (3) test assertions for the new field.

### Code Standards
- Use explicit return types for functions
- JSDoc comments for all exported functions
- Follow existing patterns in codebase
- Never reference `./vendor` files directly in code
- Keep files focused and under 300 lines when possible

### Naming Conventions
- **Variables, parameters, functions**: camelCase
- **Classes, interfaces, types**: PascalCase
- **Constants**: UPPER_CASE
- **Files**: kebab-case for utilities, PascalCase for classes/types
- **Folders**: kebab-case

### Node.js Built-in Imports
Always import Node.js built-in modules with the `node:` prefix for clarity and future compatibility:
- **Correct**: `import * as path from 'node:path'`, `import { readFile } from 'node:fs/promises'`
- **Incorrect**: `import * as path from 'path'`, `import { readFile } from 'fs/promises'`

### File Naming Convention
Follow consistent naming schemes:
- **Functions/utilities**: `kebab-case` (e.g., `ogd-local-forecast.ts`, `http-client.ts`)
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
- **Streamable HTTP**: Server runs on configurable port (default: 3000)
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

### Debug Logging Strategy
The application uses the `debug` npm module for comprehensive production debugging. Debug output can be controlled via environment variables without rebuilding the Docker image.

#### Environment Variables
- **`DEBUG`**: Standard debug module pattern (e.g., `mcp:*` for all, `mcp:transport,mcp:tools` for specific)
- **`DEBUG_MCHMCP`**: Legacy compatibility flag - if set to `true`, enables all `mcp:*` namespaces

#### Debug Namespaces
- `mcp:main` - Application lifecycle, startup/shutdown, configuration
- `mcp:server` - MCP server events, tool registration, protocol operations
- `mcp:transport` - Streamable HTTP transport layer, connections, sessions, rate limiting
- `mcp:tools` - Tool execution, parameters, results, errors
- `mcp:data` - Data fetching, caching, transformation, API calls
- `mcp:http` - HTTP client operations, retries, errors
- `mcp:session` - Session management, cleanup, timeouts
- `mcp:env` - Environment validation, configuration loading

#### What Should Be Logged
- **Lifecycle Events**: Server start/stop, configuration loaded, shutdown initiated
- **Connection Events**: New connections, disconnections, session creation/cleanup
- **Request Flow**: Incoming requests, routing, parameter validation
- **Tool Operations**: Tool invocation, parameters, execution time, results/errors
- **Data Operations**: API calls, cache hits/misses, data transformations
- **Error Conditions**: All errors with context, stack traces for exceptions
- **Performance Metrics**: Request duration, queue sizes, memory usage
- **Security Events**: Rate limit hits, invalid requests, authentication (if added)

#### Production Usage Examples
```bash
# Enable all MCP debugging
docker run -e DEBUG='mcp:*' meteoswiss-mcp

# Debug only transport and tools
docker run -e DEBUG='mcp:transport,mcp:tools' meteoswiss-mcp

# Debug everything except data operations
docker run -e DEBUG='mcp:*,-mcp:data' meteoswiss-mcp

# Use legacy flag
docker run -e DEBUG_MCHMCP=true meteoswiss-mcp
```

### General Debugging
- Logs are written to stderr (using `console.error`) to avoid interfering with MCP communication
- See `docs/debugging-guide.md` for Claude Desktop debugging tips

## Development Workflow

### Mandatory Practices
1. **ALWAYS Fix Before CI**: Run `pnpm run fix` to auto-fix formatting and other fixable lint errors (includes prettier fixes).
2. **ALWAYS Run Full CI Before Committing**: Before any commit, run `pnpm run fix && pnpm run ci` (which runs lint, build, and test). This is CRITICAL.
   - The `fix` script runs ESLint with --fix flag, which fixes both formatting (prettier) and other auto-fixable errors
   - The `ci` script runs: lint (TypeScript + ESLint), build, and test
3. **Commit After Logical Tasks**: Always commit after completing a logical task or set of related changes, ensuring all checks pass before committing. This creates a clean, understandable commit history.
4. **Run Tests After Changes**: After each change, run `pnpm test` to catch regressions early
5. **Dependency Management**: Always use pnpm CLI to add or remove dependencies so correct versions are recorded in `package.json`
6. **Documentation Updates**: Always update documentation when changing code, especially:
   - **README.md**: Update when adding features, changing architecture, or modifying usage instructions
   - **CLAUDE.md**: Update project context, design decisions, and open tasks when making significant changes
   - **JSDoc/TSDoc**: Add comprehensive comments to new types, classes, and functions
   - **Code Examples**: Update examples in README when APIs or usage patterns change

### Package Management
- **Never install packages globally**: Always install dependencies as dev dependencies in the project
- **Running commands**: Use `npx` for one-off commands in shell, or define scripts in `package.json`
- **Example**: Instead of `npm install -g typescript`, use `pnpm add -D typescript` and run with `npx tsc` or via package.json scripts

## Plot Config

- **Branch prefixes:** idea/, feature/, bug/, docs/, infra/
- **Plan directory:** docs/plans/
- **Active index:** docs/plans/active/
- **Delivered index:** docs/plans/delivered/

## Content Guidelines

- When referring to MeteoSwiss products, always say **"MeteoSwiss app and website"** (not just "app"). The data powers both.

## Open Tasks and Issues

- Re-add climate normals tool when MeteoSwiss publishes `ch.meteoschweiz.ogd-climate-normals` data
- Add more forecast parameters to meteoswissLocalForecast (wind, sunshine, cloud cover)
- Add precipitation data to postal code forecasts (hourly aggregation)
- Consider Open-Meteo proxy for NWP model data (ICON-CH1/CH2)

## Design Decisions

- **OGD over HTML scraping**: MeteoSwiss launched Open Government Data in May 2025. All structured data now comes from the STAC API + CSV downloads, not HTML scraping.
- **Disk-based CSV cache**: TTL-tiered (60s realtime, 1h forecast, 24h metadata). Low memory, fast after initial download.
- **Fuzzy station resolution**: Map-indexed exact match (O(1)), then substring with diacritic normalization, then swisstopo geocoding fallback.
- **`meteoswiss` prefix on tools**: LLM tool selection reliability — helps models distinguish weather tools from other MCP servers.

## References

- [MCP Protocol Documentation](https://spec.modelcontextprotocol.io/)
- [MeteoSwiss Open Data Docs](https://opendatadocs.meteoswiss.ch/)
- [MeteoSwiss STAC API](https://data.geo.admin.ch/api/stac/v1/collections)
- [swisstopo API](https://api3.geo.admin.ch/)