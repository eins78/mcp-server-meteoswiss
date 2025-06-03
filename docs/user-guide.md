# MeteoSwiss MCP Server User Guide

This guide explains how to use the MeteoSwiss MCP server with an MCP-compatible client, such as LLMs that support tool calls.

## What is MCP?

The Model Context Protocol (MCP) is a standard for enabling AI systems to access external tools and data. This server implements the MCP specification to provide weather data from MeteoSwiss to language models and other AI systems.

## Available Tools

The current MVP implementation provides the following tool:

### meteoswissWeatherReport

Retrieves the latest weather report for a specified region of Switzerland.

**Parameters:**

- `region` (required): The region to get the report for
  - Options: `north`, `south`, `west`
- `language` (optional): The language for the report
  - Options: `de` (German), `fr` (French), `it` (Italian), `en` (English)
  - Default: `en`

**Response Format:**

```json
{
  "region": "north",
  "language": "en",
  "title": "Weather forecast for Northern Switzerland",
  "updatedAt": "Updated on Saturday, April 26, 2025, 16:49",
  "content": "Full text content of the report...",
  "forecast": [
    {
      "day": "Today Saturday",
      "description": "In the evening, quite sunny in the lowlands...",
      "temperature": "Temperature in the lowlands around 7 degrees in the morning..."
    },
    {
      "day": "Sunday",
      "description": "In the morning, quite sunny in the lowlands and inner-alpine regions...",
      "temperature": "Temperature in the lowlands around 7 degrees in the morning..."
    },
    // Additional days...
  ]
}
```

## Example Usage

Below are examples of how to use the MCP server with different clients.

### Using with MCP Inspector

The easiest way to test the server is with the MCP Inspector:

```bash
# Start the server
pnpm start

# In another terminal, launch the inspector
pnpm run dev:inspect
```

This will open a web interface where you can test the available tools.

### Using with Claude Desktop

To use the server with Claude Desktop, you need to use `mcp-remote` to connect:

1. Start the server:
   ```bash
   pnpm start
   ```

2. In Claude Desktop, configure the MCP server:
   ```json
   {
     "mcpServers": {
       "meteoswiss": {
         "command": "npx",
         "args": ["mcp-remote", "http://localhost:3000/mcp"]
       }
     }
   }
   ```

3. Restart Claude Desktop to load the new configuration.

### Using with MCP SDK

When building your own MCP client:

```javascript
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

// Create SSE transport
const transport = new SSEClientTransport(
  new URL('http://localhost:3000/mcp')
);

// Create and connect client
const client = new Client({ name: 'weather-client', version: '1.0.0' });
await client.connect(transport);

// Call the weather tool
const result = await client.callTool('meteoswissWeatherReport', {
  region: 'north',
  language: 'en'
});
```

## Example Prompts

Here are some example prompts you can use with an MCP-compatible LLM:

- "What's the weather like in Northern Switzerland today?"
- "Get me the weather forecast for Western Switzerland in French."
- "Is it going to rain in Southern Switzerland this week?"
- "What are the temperatures going to be like in the Alps over the next few days?"

## Environment Variables

The server supports several environment variables for configuration:

- `PORT` - Server port (default: 3000)
- `USE_TEST_FIXTURES` - Use local test data instead of live API (default: false)
- `DEBUG_MCHMCP` - Enable debug logging (default: false)
- `BIND_ADDRESS` - Interface to bind to (default: 0.0.0.0)
- `MAX_SESSIONS` - Maximum concurrent SSE sessions (default: 100)
- `SESSION_TIMEOUT_MS` - Session timeout in milliseconds (default: 300000)

For production deployments, additional rate limiting and CORS configuration is available.

## Current Features

The server provides:

1. Weather reports for three regions of Switzerland (North, South, West)
2. Multi-language support (German, French, Italian, English)
3. Structured forecast data with daily breakdowns
4. Real-time data from MeteoSwiss API (when not using test fixtures)
5. HTTP/SSE transport for remote access
6. Session management and rate limiting for production use
