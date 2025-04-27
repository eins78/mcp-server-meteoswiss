# MeteoSwiss MCP Server

A Model Context Protocol (MCP) server for MeteoSwiss weather data.

## Overview

This server provides weather data from MeteoSwiss using the [Model Context Protocol](https://github.com/modelcontextprotocol/typescript-sdk) (MCP), allowing AI assistants like Claude to access weather information.

## Features

- Weather reports for regions in Switzerland
- Current weather conditions
- Weather forecasts
- Weather station data

## Installation

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

3. Build the project:

```bash
npm run build
```

## Usage

Start the server:

```bash
npm start
```

The server will run on <http://localhost:3000> by default.

## MCP SDK Implementation

This server strictly follows the Model Context Protocol using the official TypeScript SDK. All tools and resources are implemented via the SDK interfaces:

- `McpServer` class for server setup
- `StreamableHTTPServerTransport` for client communication
- Zod schemas for type validation

## Development

To run in development mode with automatic rebuilding:

```bash
npm run dev
```

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
