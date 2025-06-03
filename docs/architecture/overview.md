# MCP Server Architecture Overview

This document provides an overview of the architecture for the MeteoSwiss MCP server.

## System Components

The MCP server will consist of the following main components:

1. **MCP Server Core**: Implements the Model Context Protocol interface
2. **Data Fetcher**: Fetches weather data from MeteoSwiss HTTP endpoints
3. **Data Transformer**: Transforms raw data into the schema format
4. **Data Cache**: Caches transformed data for efficient access
5. **Resource Providers**: Providers for each resource type (current weather, forecasts, etc.)
6. **Tools Provider**: Provides tools for LLMs to query the weather data

```
┌─────────────────────────────────────────────────┐
│                  MCP Server                      │
│                                                  │
│  ┌──────────────┐          ┌───────────────┐    │
│  │ MCP Protocol │          │   Resource    │    │
│  │  Interface   │◄────────►│   Providers   │    │
│  └──────────────┘          └───────┬───────┘    │
│          ▲                         │            │
│          │                         ▼            │
│  ┌──────────────┐          ┌───────────────┐    │
│  │    Tools     │          │     Data      │    │
│  │   Provider   │◄────────►│     Cache     │    │
│  └──────────────┘          └───────┬───────┘    │
│                                    │            │
│                                    ▼            │
│                           ┌───────────────┐     │
│                           │     Data      │     │
│                           │  Transformer  │     │
│                           └───────┬───────┘     │
│                                   │             │
│                                   ▼             │
│                           ┌───────────────┐     │
│                           │     Data      │     │
│                           │    Fetcher    │     │
│                           └───────────────┘     │
│                                   │             │
└───────────────────────────────────┼─────────────┘
                                    ▼
                           ┌───────────────┐
                           │   MeteoSwiss  │
                           │  HTTP APIs    │
                           └───────────────┘
```

## Technology Stack

The server will be built using the following technology stack:

- **Node.js v18+**: Modern JavaScript runtime with:
  - Built-in fetch API for HTTP requests
  - Full ESM support for cleaner module imports
  - Stable performance and long-term support

- **TypeScript**: For type safety and better developer experience
  - Using a strict configuration for maximum type safety
  - Leveraging modern TypeScript features like template literal types and satisfies operator

- **MCP TypeScript SDK**: For implementing the Model Context Protocol
  - Using the high-level McpServer class for simplified server setup
  - Implementing tools and resources via the SDK interfaces
  - Utilizing HTTP with Server-Sent Events (SSE) for real-time communication

- **Zod**: For runtime type validation and schema definition
  - Defining schemas for input validation on tools
  - Creating type-safe transformers for data
  - Generating TypeScript types from Zod schemas

## Component Responsibilities

### MCP Server Core

- Implements the MCP protocol interface using the TypeScript SDK
- Manages connections with LLM clients
- Routes resource and tool requests to the appropriate providers
- Implements the McpServer class from the SDK

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from 'express';

const server = new McpServer({
  name: "meteoswiss-weather-server",
  version: "1.0.0"
});

// Register tools
server.tool('meteoswissWeatherReport', weatherReportSchema, meteoswissWeatherReportHandler);

// Set up HTTP server with SSE
const app = express();
app.get('/mcp', (req, res) => {
  const transport = new SSEServerTransport('/messages', res);
  await server.connect(transport);
});
```

### Data Fetcher

- Fetches raw weather data from MeteoSwiss HTTP endpoints
- Manages rate limiting and error handling
- Ensures data freshness by monitoring update times
- Uses Node.js native fetch API for HTTP requests
- Implements retry logic and error handling
- Supports both live API calls and test fixtures for development

### Data Transformer

- Transforms raw MeteoSwiss data into the defined schema format
- Applies mappings between different data types
- Converts units and formats as necessary
- Uses Zod for schema validation and transformation

```typescript
import { z } from "zod";

// Define schema with Zod
const CurrentWeatherSchema = z.object({
  location: z.object({
    name: z.string(),
    zip: z.string(),
    coordinates: z.object({
      lat: z.number(),
      lon: z.number()
    })
  }),
  timestamp: z.number(),
  measurements: z.object({
    temperature: z.object({
      value: z.number(),
      unit: z.string()
    }),
    // ... other measurements
  }),
  condition: z.object({
    id: z.string(),
    description: z.string()
  })
});

// Type derived from schema
type CurrentWeather = z.infer<typeof CurrentWeatherSchema>;

// Transform function with validation
function transformCurrentWeather(rawData: unknown): CurrentWeather {
  // Transform the raw data
  const transformed = {
    // ... transformation logic
  };
  
  // Validate and return
  return CurrentWeatherSchema.parse(transformed);
}
```

### Data Cache

- Caches transformed data for efficient access
- Implements cache invalidation based on data update schedules
- Provides fast access to frequently requested data

### Resource Providers

- Provide access to the different resource types:
  - Current Weather Provider
  - Weather Forecast Provider
  - Weather Station Provider
  - Weather Parameter Provider

### Tools Provider

- Implements tools that LLMs can use to query the weather data using SDK's tool interface:
  - `getCurrentWeather`: Get current weather for a location
  - `getWeatherForecast`: Get forecast for a location
  - `findWeatherCondition`: Find locations with specific weather conditions
  - `meteoswissWeatherReport`: Textual weather report for a region

```typescript
import { z } from "zod";

// Tool definition with Zod schema for parameters
const getCurrentWeatherTool = server.tool(
  "getCurrentWeather",
  {
    location: z.string(),
    language: z.enum(["en", "de", "fr", "it"]).optional().default("en")
  },
  async ({ location, language }) => {
    // Implementation
    const weather = await weatherService.getCurrentWeather(location, language);
    return { weather };
  }
);
```

## Data Flow

1. LLM client connects to the MCP server
2. LLM requests resources or tools from the server
3. Server routes the request to the appropriate provider
4. Provider retrieves data from the cache
5. If data is not in cache or is stale:
   a. Data fetcher retrieves raw data from MeteoSwiss
   b. Data transformer converts raw data to schema format
   c. Data is stored in cache
6. Provider returns data to the MCP server
7. MCP server returns data to the LLM client

## Implementation Considerations

### TypeScript Configuration

The project will use a strict TypeScript configuration based on best practices:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "declaration": true,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Data Update Strategy

- **Current Weather**: Update every 10 minutes
- **Forecasts**: Update every hour
- **Station Metadata**: Update daily
- **Parameter Definitions**: Update weekly

### Error Handling

- Implement robust error handling for data fetch failures
- Provide fallback data when sources are unavailable
- Log errors and monitor system health
- Use Zod's error handling for validation failures

### Security Considerations

- No authentication required (public data)
- Implement rate limiting to prevent abuse
- Monitor for unusual access patterns

## Production Considerations

### Session Management

- Sessions are managed with automatic cleanup based on activity
- Timeout mechanism resets on each message to keep active connections alive
- Memory cleanup ensures no resource leaks on connection close
- Maximum session limit prevents resource exhaustion

### Error Handling Improvements

- **Port Validation**: Command-line port arguments are validated to prevent NaN errors
- **Type Safety**: Runtime type checking for session retrieval prevents type assertion errors
- **Graceful Shutdown**: Signal handlers properly await cleanup with timeout protection
- **JSON Parsing**: All JSON parsing wrapped in try-catch blocks with descriptive errors
- **HTML Parsing**: Robust DOM parsing with fallbacks for missing elements

### Data Handling Robustness

- **Defensive HTML Parsing**: No assumptions about DOM structure, with sensible defaults
- **Enum Validation**: Runtime validation of region and language parameters
- **Missing Data Handling**: Graceful degradation when expected elements are not found
- **Error Context**: Detailed error messages include context about what failed

### Known Issues Fixed

1. **SSE Timeout Bug**: Fixed timeout mechanism that only cleared but never reset
2. **Memory Leak**: Fixed missing timeout cleanup on connection close
3. **Type Assertions**: Replaced unsafe type assertions with runtime validation
4. **Brittle Parsing**: Made HTML parsing resilient to structure changes
5. **Invalid Ports**: Added validation for command-line port arguments

## Next Steps

1. ~~Implement the MCP server core using the SDK~~ ✓
2. ~~Implement the data fetcher for each data source~~ ✓
3. ~~Implement the data transformer according to the schema~~ ✓
4. ~~Implement the resource and tool providers~~ ✓
5. ~~Set up testing and deployment infrastructure~~ ✓
6. Monitor production for any edge cases in data parsing
7. Consider implementing request/response logging for debugging
8. Add metrics collection for monitoring system health
