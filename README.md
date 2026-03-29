# (Demo) MCP Server for MeteoSwiss Data

A Model Context Protocol (MCP) server for MeteoSwiss weather data.

## Overview

This server provides weather data from MeteoSwiss using the [Model Context Protocol](https://github.com/modelcontextprotocol/typescript-sdk) (MCP), allowing AI assistants like Claude to access weather information.

## Features

- Multi-day forecasts for ~6000 Swiss locations (postal codes, stations, place names)
- Real-time measurements from ~160 automatic weather stations (updated every 10 minutes)
- Station discovery and search by name, canton, or coordinates
- Pollen concentration monitoring from ~15 stations
- Search MeteoSwiss website content across multiple topics
- Fetch full content from MeteoSwiss pages with format conversion
- Disk-based CSV caching with configurable TTL
- Fuzzy station name matching with diacritics support and geocoding fallback
- Test fixtures for development

Data sourced from [MeteoSwiss Open Data](https://opendatadocs.meteoswiss.ch/) — the same data powering the MeteoSwiss app and website.

## Architecture

This MCP server runs as an HTTP service using the MCP Streamable HTTP transport. It's designed to be accessed remotely using `mcp-remote` for Claude Desktop integration.

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

- Node.js v22.0.0 or later (we recommend using [nvm](https://github.com/nvm-sh/nvm) for Node.js version management)
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

The server runs as an HTTP service with Streamable HTTP transport:

```bash
# Start the server (default port 3000)
pnpm start

# Or specify a custom port
PORT=8080 pnpm start
```

The HTTP server provides (MCP Streamable HTTP transport):
- GET `/` - Server information
- POST `/mcp` - MCP JSON-RPC requests (server responds, possibly as SSE stream)
- GET `/mcp` - SSE stream for server-to-client notifications
- DELETE `/mcp` - Session termination
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

### meteoswissLocalForecast
Get a multi-day weather forecast for any Swiss location.

**Parameters:**
- `location` (required): Postal code ("8001"), station abbreviation ("ZUE"), or place name ("Zurich")
- `days` (optional): Number of forecast days, 1-9 (default: 5)

**Returns:** Daily forecasts with temperature, precipitation, and weather descriptions.

### meteoswissCurrentWeather
Get real-time weather measurements from Swiss automatic weather stations.

**Parameters:**
- `station` (optional): Station name ("Zurich"), abbreviation ("SMA"), or address ("Bahnhofplatz 1 Bern")
- `coordinates` (optional): `{ lat, lon }` — finds nearest station

**Returns:** Temperature, precipitation, wind, humidity, pressure, sunshine, and more. Updated every 10 minutes.

### meteoswissStations
List and search MeteoSwiss automatic weather stations.

**Parameters:**
- `search` (optional): Search by station name
- `canton` (optional): Filter by 2-letter canton code (e.g., "ZH", "BE")
- `limit` (optional): Max results, 1-200 (default: 20)

### meteoswissPollenData
Get current pollen concentration data from MeteoSwiss monitoring stations.

**Parameters:**
- `station` (optional): Filter by station name or abbreviation

### search
Search MeteoSwiss website content with pagination and multi-language support.

### fetch
Retrieve full content from MeteoSwiss pages in various formats (markdown, text, HTML).

## Available Prompts

Pre-configured prompts for common weather queries using MeteoSwiss Open Data:

### German
- `wetterNordschweiz`: Forecast and current weather for Northern Switzerland
- `wetterSchweiz`: Weather for any Swiss location (by city, postal code, or station)

### French
- `meteoSuisseRomande`: Forecast and current weather for Western Switzerland (Romandy)

### Italian
- `meteoTicino`: Forecast and current weather for Southern Switzerland (Ticino)

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

When making user-facing changes, add a changeset (`pnpm changeset`) to your PR. See [docs/releasing.md](docs/releasing.md) for the full release process.

## License

ISC

## Acknowledgments

- MeteoSwiss for providing the weather data
- Anthropic for the MCP specification
