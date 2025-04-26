# MeteoSwiss MCP Server User Guide

This guide explains how to use the MeteoSwiss MCP server with an MCP-compatible client, such as LLMs that support tool calls.

## What is MCP?

The Model Context Protocol (MCP) is a standard for enabling AI systems to access external tools and data. This server implements the MCP specification to provide weather data from MeteoSwiss to language models and other AI systems.

## Available Tools

The current MVP implementation provides the following tool:

### getWeatherReport

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

### Direct HTTP Request

You can make a direct HTTP request to the server using cURL:

```bash
curl -X POST http://localhost:3000/api/tools \
  -H "Content-Type: application/json" \
  -d '{"name":"getWeatherReport","parameters":{"region":"north","language":"en"}}'
```

### Using with an MCP-Compatible LLM

When using with an MCP-compatible LLM, you would typically register the MCP server with the client, which would then allow the model to call the available tools.

Example with a hypothetical MCP client:

```javascript
// Register the MCP server with the client
const mcpClient = new MCPClient({
  baseUrl: 'http://localhost:3000/api'
});

// The LLM can now access the tools
const response = await mcpClient.sendMessage({
  message: "What's the weather forecast for Northern Switzerland?",
  tools: await mcpClient.getAvailableTools()
});
```

## Example Prompts

Here are some example prompts you can use with an MCP-compatible LLM:

- "What's the weather like in Northern Switzerland today?"
- "Get me the weather forecast for Western Switzerland in French."
- "Is it going to rain in Southern Switzerland this week?"
- "What are the temperatures going to be like in the Alps over the next few days?"

## Limitations of the MVP

The current MVP implementation has the following limitations:

1. Only weather reports are available, not current conditions or detailed forecasts
2. Data is static and read from local files, not from a live MeteoSwiss API
3. Only three regions (North, South, West) are supported, not specific locations
4. Limited error handling and validation

These limitations will be addressed in future versions of the MCP server.
