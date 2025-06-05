# (Demo) MCP Server for MeteoSwiss Data

A Model Context Protocol (MCP) server for MeteoSwiss weather data.

## Overview

This server provides weather data from MeteoSwiss using the [Model Context Protocol](https://github.com/modelcontextprotocol/typescript-sdk) (MCP), allowing AI assistants like Claude to access weather information.

## Features

- Weather reports for regions in Switzerland (North, South, West)
- Multi-language support (German, French, Italian)
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

## Available Tools

### meteoswissWeatherReport

Get official MeteoSwiss weather reports with detailed daily forecasts for Swiss regions.

**Parameters:**
- `region` (required): The Swiss region
  - `north`: Northern Switzerland (Zurich, Basel, Bern, Swiss Plateau)
  - `south`: Southern Switzerland (Ticino and southern valleys)
  - `west`: Western Switzerland (Romandy - Geneva, Lausanne, western Alps)
- `language` (optional, default: 'de'): Report language
  - `de`: German (primary for northern regions)
  - `fr`: French (primary for western regions)
  - `it`: Italian (primary for southern regions/Ticino)
  
  **Note**: English is not available. MeteoSwiss only provides weather reports in Switzerland's official languages.

**Returns:**
- Title and update timestamp
- Full weather report content
- Structured daily forecasts (3-5 days)
- Temperature ranges and conditions

## Available Prompts

The server provides pre-configured prompts for common weather queries:

### German Prompts
- `wetterNordschweiz`: Current weather report for Northern Switzerland in German
- `wetterbericht`: Flexible weather report with region and language parameters


### French Prompt
- `meteoSuisseRomande`: Current weather report for Western Switzerland (Romandy) in French

### Italian Prompt
- `meteoTicino`: Current weather report for Southern Switzerland (Ticino) in Italian

See the [API documentation](docs/architecture/api-design.md) for detailed specifications.

## Debugging

For issues with Claude Desktop connections or other debugging needs, see our [Debugging Guide](docs/debugging-guide.md).

## Running Your Own Instance

### Using Node.js

```bash
# Clone the repository
git clone https://github.com/eins78/mcp-server-meteoswiss.git
cd mcp-server-meteoswiss

# Install dependencies
pnpm install

# Start the server
pnpm start

# The server will be available at http://localhost:3000
```

### Using Docker

```bash
# Run the latest version
docker run -p 3000:3000 -e USE_TEST_FIXTURES=false meteoswiss-mcp-server

# Or build your own
docker build -t my-meteoswiss-server .
docker run -p 3000:3000 my-meteoswiss-server

# Run with custom external port mapping
# Internal port 3000 mapped to external port 8080
docker run -p 8080:3000 -e PUBLIC_URL=http://localhost:8080 my-meteoswiss-server

# Run with custom hostname
docker run -p 80:3000 -e PUBLIC_URL=http://meteoswiss.example.com my-meteoswiss-server
```

### Environment Variables

- `PORT` - Server port (default: 3000)
- `PUBLIC_URL` - Full public URL including protocol and port for URL generation
- `USE_TEST_FIXTURES` - Use test data instead of live API (default: false)
- `DEBUG_MCHMCP` - Enable debug logging (default: false)
- `BIND_ADDRESS` - Interface to bind to (default: 0.0.0.0)
- `MAX_SESSIONS` - Maximum concurrent sessions (default: 100)
- `SESSION_TIMEOUT_MS` - Session timeout in milliseconds (default: 300000)

#### Docker Port Mapping

When running in Docker with port mapping (e.g., `-p 8080:3000`), use the `PUBLIC_URL` environment variable to ensure URLs reflect the external port:

```bash
# Server listens on port 3000 internally, but is accessible on port 8080 externally
docker run -p 8080:3000 -e PORT=3000 -e PUBLIC_URL=http://localhost:8080 my-server

# For production with a domain name
docker run -p 443:3000 -e PORT=3000 -e PUBLIC_URL=https://api.example.com my-server
```

### Local MCP Configuration

To use your local instance with Claude Desktop, add this to your configuration:

```json
{
  "mcpServers": {
    "meteoswiss-local": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:3000/mcp"]
    }
  }
}
```

## Contributing

Contributions are welcome! Please ensure you follow the architecture guidelines outlined in the documentation.

## License

ISC

## Acknowledgments

- MeteoSwiss for providing the weather data
- Anthropic for the MCP specification
