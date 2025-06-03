# MCP Server for MeteoSwiss Data

A Model Context Protocol (MCP) server for MeteoSwiss weather data.

## Overview

This server provides weather data from MeteoSwiss using the [Model Context Protocol](https://github.com/modelcontextprotocol/typescript-sdk) (MCP), allowing AI assistants like Claude to access weather information.

## Features

- Weather reports for regions in Switzerland (North, South, West)
- Multi-language support (German, French, Italian, English)
- Weather forecasts with daily breakdowns
- Test fixtures for development

## Architecture

This MCP server runs as an HTTP service with Server-Sent Events (SSE) for real-time communication. It's designed to be accessed remotely using `mcp-remote` for Claude Desktop integration.

## Quick Start

This server runs as an HTTP service and can be accessed using `mcp-remote`:

```bash
# Start the server
npm start  # or: pnpm start

# In Claude Desktop, use:
npx mcp-remote http://localhost:3000/mcp
```

### Development Mode

For development with auto-reload:

```bash
# Start with file watching
npm run dev  # or: pnpm dev

# Test with MCP Inspector
npm run dev:inspect
```

## Development

This project uses `tsx` for TypeScript execution, providing a smooth development experience with hot reloading.

### Prerequisites

- Node.js v18.0.0 or later (we recommend using [nvm](https://github.com/nvm-sh/nvm) for Node.js version management)
- [pnpm](https://pnpm.io/) for package management

### Setting up the development environment

1. Clone the repository:

   ```bash
   git clone https://github.com/eins78/mcp-server-meteoswiss-data.git
   cd mcp-server-meteoswiss-data
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Use the correct Node.js version:

   ```bash
   nvm use
   ```

### Running the application

#### Running the Server

The server runs as an HTTP service with Server-Sent Events (SSE):

```bash
# Start the server (default port 3000)
pnpm start

# Or specify a custom port
PORT=8080 pnpm start
```

The HTTP server provides:
- GET `/` - Server information
- GET `/mcp` - MCP SSE endpoint for client connections
- POST `/messages?sessionId=...` - Message handling endpoint
- GET `/health` - Health check endpoint

#### Development Mode

Start the development server with hot reloading:

```bash
pnpm run dev
```

Or run the application without hot reloading:

```bash
pnpm run start
```

### Type checking

Check TypeScript types without emitting JavaScript files:

```bash
pnpm run lint
```

## Project Structure

- `src/` - Source code
  - `index.ts` - Application entry point
  - `data/` - Data access and transformation
  - `schemas/` - Zod schemas for data validation
  - `tools/` - Utility tools and scripts
  - `support/` - Supporting infrastructure (logging, validation, etc.)

## Documentation

- `docs/` - Project documentation
  - `architecture/` - Architecture diagrams and descriptions
  - `analysis/` - Data analysis and insights

## MCP SDK Implementation

This server strictly follows the Model Context Protocol using the official TypeScript SDK. All tools and resources are implemented via the SDK interfaces:

- `McpServer` class for server setup
- `StreamableHTTPServerTransport` for client communication
- Zod schemas for type validation

## Tools

The server provides the following MCP tools:

- `meteoswissWeatherReport`: Weather report for a specific region (north, south, west)

## Debugging

For issues with Claude Desktop connections or other debugging needs, see our [Debugging Guide](docs/debugging-guide.md).

## Contributing

Contributions are welcome! Please ensure you follow the architecture guidelines outlined in the documentation.

## License

ISC

## Acknowledgments

- MeteoSwiss for providing the weather data
- Anthropic for the MCP specification
