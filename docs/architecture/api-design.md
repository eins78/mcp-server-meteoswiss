# MeteoSwiss MCP Server API Design

This document outlines the API design for the MeteoSwiss MCP (Multimodal Chat Protocol) server, which provides structured access to weather data from MeteoSwiss.

## MCP Resources vs Tools

The MCP server implements both Resources and Tools to provide optimal access to weather data:

- **Resources**: Client-controlled, read-only data that provides context (weather station metadata, parameter definitions)
- **Tools**: Model-controlled functions that the AI can autonomously invoke to retrieve specific weather information or perform searches

This dual approach allows both client applications to explicitly select relevant weather data as context and enables AI models to autonomously query for specific weather information as needed.

## MCP Tool Interface

The server implements the MCP protocol, exposing a set of tools that can be called by client applications to retrieve weather data.

### Base URL

```
https://api.meteoswiss.ch/mcp/v1
```

## Available Tools

### getCurrentWeather

Retrieves current weather conditions for a specified location.

**Parameters:**

```typescript
{
  location: string; // Location name or postal code
  language?: "de" | "fr" | "it" | "en"; // Default: "en"
}
```

**Response:**

Returns a `CurrentWeather` object as defined in the data schema.

**Example Request:**

```json
{
  "name": "getCurrentWeather",
  "parameters": {
    "location": "Zurich",
    "language": "en"
  }
}
```

### getWeatherForecast

Retrieves weather forecast for a specified location.

**Parameters:**

```typescript
{
  location: string; // Location name or postal code
  days?: number; // Number of days to forecast (1-10, default: 7)
  includeHourly?: boolean; // Whether to include hourly forecast (default: false)
  language?: "de" | "fr" | "it" | "en"; // Default: "en"
}
```

**Response:**

Returns a `WeatherForecast` object as defined in the data schema.

**Example Request:**

```json
{
  "name": "getWeatherForecast",
  "parameters": {
    "location": "Geneva",
    "days": 5,
    "includeHourly": true,
    "language": "fr"
  }
}
```

### findWeatherCondition

Searches for locations matching specific weather conditions.

**Parameters:**

```typescript
{
  condition: string; // Weather condition (e.g., "rain", "snow", "sunny")
  date?: string; // Date for the condition (ISO format or "today", "tomorrow")
  region?: string; // Limit search to region (e.g., "north", "south", "alps")
  language?: "de" | "fr" | "it" | "en"; // Default: "en"
}
```

**Response:**

```typescript
{
  locations: Array<{
    name: string;
    condition: {
      code: string;
      description: string;
    };
    timestamp: string; // ISO 8601 format
  }>;
}
```

**Example Request:**

```json
{
  "name": "findWeatherCondition",
  "parameters": {
    "condition": "snow",
    "date": "tomorrow",
    "region": "alps",
    "language": "de"
  }
}
```

### getWeatherReport

Retrieves the latest weather report for a specified region.

**Parameters:**

```typescript
{
  region: "north" | "south" | "west"; // Region for the report
  language?: "de" | "fr" | "it" | "en"; // Default: "en"
}
```

**Response:**

Returns a `WeatherReport` object as defined in the data schema.

**Example Request:**

```json
{
  "name": "getWeatherReport",
  "parameters": {
    "region": "north",
    "language": "en"
  }
}
```

### listWeatherStations

Lists weather stations with optional filtering.

**Parameters:**

```typescript
{
  canton?: string; // Filter by canton (e.g., "ZH", "GE")
  type?: string; // Filter by station type
  parameter?: string; // Filter by available parameter
  language?: "de" | "fr" | "it" | "en"; // Default: "en"
}
```

**Response:**

```typescript
{
  stations: Array<WeatherStation>; // As defined in data schema
}
```

**Example Request:**

```json
{
  "name": "listWeatherStations",
  "parameters": {
    "canton": "TI",
    "type": "automatic",
    "language": "it"
  }
}
```

### getStationData

Retrieves historical measurement data for a specific station and parameter.

**Parameters:**

```typescript
{
  stationId: string; // Station identifier
  parameter: string; // Parameter to retrieve (e.g., "temperature", "precipitation")
  interval: "10min" | "hour" | "day" | "month" | "year"; // Time interval
  startDate: string; // Start date (ISO format)
  endDate: string; // End date (ISO format)
  language?: "de" | "fr" | "it" | "en"; // Default: "en"
}
```

**Response:**

Returns a `StationData` object as defined in the data schema.

**Example Request:**

```json
{
  "name": "getStationData",
  "parameters": {
    "stationId": "LUG",
    "parameter": "temperature",
    "interval": "hour",
    "startDate": "2025-04-01",
    "endDate": "2025-04-07",
    "language": "it"
  }
}
```

## Error Handling

The API follows standard HTTP status codes for error responses:

- `200 OK`: Successful request
- `400 Bad Request`: Invalid parameters
- `404 Not Found`: Requested resource not found
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

Error response format:

```typescript
{
  error: {
    code: string; // Error code
    message: string; // Human-readable error message
    details?: any; // Additional error details
  };
}
```

## Authentication

The API requires authentication using an API key provided in the HTTP header:

```
X-API-Key: your_api_key_here
```

## Rate Limiting

The API implements rate limiting to ensure fair usage:

- 100 requests per minute per API key
- 5,000 requests per day per API key

Rate limit information is provided in the response headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1619766913
```

## Versioning

The API is versioned through the URL path. The current version is `v1`. Breaking changes will be introduced in new API versions.

## Language Support

All text responses can be localized by specifying the `language` parameter. Supported languages are:

- `de`: German
- `fr`: French
- `it`: Italian
- `en`: English (default)

## Response Format

All responses are in JSON format with the `Content-Type: application/json` header.

## MCP Protocol Compliance

This API follows the Multimodal Chat Protocol specification, allowing it to be integrated with MCP-compatible clients.

The server response format follows the MCP tool response structure:

```json
{
  "tool_response": {
    "name": "getCurrentWeather",
    "content": {
      // Response data specific to the tool
    }
  }
}
```

## Implementation Considerations

1. The server will cache responses to minimize requests to the MeteoSwiss data sources
2. Data transformations will convert raw MeteoSwiss data to the documented schema
3. Server-side validation will ensure response data conforms to the defined schemas
