# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

## Debugging
- Logs are written to stderr (using `console.error`) to avoid interfering with MCP communication
- See `docs/debugging-guide.md` for Claude Desktop debugging tips