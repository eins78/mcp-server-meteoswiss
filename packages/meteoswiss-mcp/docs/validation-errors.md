# Improved Validation Error Messages

This document shows examples of the improved validation error messages for the MeteoSwiss MCP server.

## Weather Report Tool

### Invalid Region
**Input:** `{ "region": "east", "language": "de" }`
**Error:** 
```
Invalid arguments for tool meteoswissWeatherReport: Region must be one of: 'north' (Northern Switzerland including Zurich, Basel, Bern), 'south' (Ticino and southern valleys), or 'west' (Romandy including Geneva, Lausanne). Received: 'east'
```

### English Language Not Supported
**Input:** `{ "region": "north", "language": "en" }`
**Error:**
```
Invalid arguments for tool meteoswissWeatherReport: English is NOT supported by MeteoSwiss. Please use one of the Swiss official languages: 'de' (German), 'fr' (French), or 'it' (Italian). For Zurich, use 'de'.
```

### Missing Required Field
**Input:** `{ "language": "de" }`
**Error:**
```
Invalid arguments for tool meteoswissWeatherReport: Region is required. Please specify 'north', 'south', or 'west'
```

## Search Tool

### Empty Query
**Input:** `{ "query": "", "language": "de" }`
**Error:**
```
Invalid arguments for tool search: Search query cannot be empty. Please provide at least one character.
```

### Invalid Page Number
**Input:** `{ "query": "weather", "page": 0 }`
**Error:**
```
Invalid arguments for tool search: Page number must be greater than 0
```

### Page Size Too Large
**Input:** `{ "query": "weather", "pageSize": 150 }`
**Error:**
```
Invalid arguments for tool search: Page size cannot exceed 100 results per page
```

## Fetch Tool

### Empty Content ID
**Input:** `{ "id": "" }`
**Error:**
```
Invalid arguments for tool fetch: Content ID cannot be empty. Please provide a valid content ID or path.
```

### Invalid Format
**Input:** `{ "id": "some-id", "format": "html" }`
**Error:**
```
Invalid arguments for tool fetch: Format must be either 'markdown' or 'text'. Received: 'html'
```

## Benefits of Custom Error Messages

1. **Clear Guidance**: Users get specific instructions on what values are valid
2. **Context-Aware**: Special handling for common mistakes (e.g., trying to use English)
3. **Helpful Details**: Enum errors show all valid options with descriptions
4. **User-Friendly**: Technical terms are explained in plain language