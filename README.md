# MCP Server for MeteoSwiss Data

A Model Context Protocol (MCP) server for MeteoSwiss weather data.

## Overview

This server provides weather data from MeteoSwiss using the [Model Context Protocol](https://github.com/modelcontextprotocol/typescript-sdk) (MCP), allowing AI assistants like Claude to access weather information.

## Features

- Weather reports for regions in Switzerland
- Current weather conditions
- Weather forecasts
- Weather station data

## Development

This project uses Node.js 23's native TypeScript support, which means there's no build step required. TypeScript files are executed directly by Node.js.

### Prerequisites

- Node.js v23.11.0 or later (we recommend using [nvm](https://github.com/nvm-sh/nvm) for Node.js version management)
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
  - `utils/` - Common utilities

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

- `getWeatherReport`: Get weather report for a specific region (north, south, west)

## Debugging

For issues with Claude Desktop connections or other debugging needs, see our [Debugging Guide](docs/debugging-guide.md).

## Contributing

Contributions are welcome! Please ensure you follow the architecture guidelines outlined in the documentation.

## License

ISC

## Acknowledgments

- MeteoSwiss for providing the weather data
- Anthropic for the MCP specification
