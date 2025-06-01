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
- **Start server without hot reloading**: `pnpm run start`
- **Type checking**: `pnpm run lint` (runs both TypeScript and ESLint checks)
- **Run tests**: `pnpm test`
- **Format code**: `pnpm run format`

### Build (when needed)
- **Build project**: `pnpm run build` (macOS/Linux) or `pnpm run build:windows` (Windows)

## Architecture Overview

This is a Model Context Protocol (MCP) server for MeteoSwiss weather data, implemented using:
- **Node.js 23**: Native TypeScript support without build step
- **MCP TypeScript SDK**: Using `McpServer` class with `StdioServerTransport`
- **Zod**: For runtime validation and schema definitions

### Key Components

1. **MCP Server** (`src/index.ts`): Entry point using StdioServerTransport for Claude Desktop integration
2. **Tools** (`src/tools/`): MCP tools for weather data queries
   - `getWeatherReport`: Retrieves weather reports for Swiss regions (north/south/west) in multiple languages
3. **Data Layer** (`src/data/`): Handles fetching from MeteoSwiss HTTP endpoints
4. **Schemas** (`src/schemas/`): Zod schemas for input validation
5. **Utils** (`src/utils/`): HTTP client and other utilities

### Data Flow
1. MCP client (Claude Desktop) connects via stdio
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

### Node.js 23 Limitations
- No `enum` declarations (use string unions instead)
- No runtime `namespace` declarations
- No path aliases from tsconfig.json

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
3. Register tool in `src/index.ts` using `server.tool()`
4. Add integration tests in `test/integration/`
5. Document tool behavior and parameters

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
1. **Run Tests After Changes**: After each change, run `pnpm test` to catch regressions early
2. **Dependency Management**: Always use pnpm CLI to add or remove dependencies so correct versions are recorded in `package.json`
3. **Documentation Updates**: Always update documentation when changing code, especially:
   - **README.md**: Update when adding features, changing architecture, or modifying usage instructions
   - **CLAUDE.md**: Update project context, design decisions, and open tasks when making significant changes
   - **JSDoc/TSDoc**: Add comprehensive comments to new types, classes, and functions
   - **Code Examples**: Update examples in README when APIs or usage patterns change

## Open Tasks and Issues
<!-- Document outstanding tasks, bugs, or technical debt here -->

## Design Decisions
<!-- Document major design or implementation decisions, along with their rationale -->

## References
<!-- Include links to relevant documentation, tickets, or external resources -->
- [MCP Protocol Documentation](https://spec.modelcontextprotocol.io/)
- [MeteoSwiss API Documentation](https://www.meteoswiss.admin.ch/)