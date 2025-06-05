# Available Tools

## meteoswissWeatherReport

Retrieves the latest weather report for a specified region of Switzerland.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `region` | string | Yes | The region to get the report for: `north`, `south`, or `west` |
| `language` | string | No | Language for the report: `de`, `fr`, `it`, or `en` (default: `en`) |

### Response

The tool returns a structured weather report containing:

- **title**: The report title
- **region**: The requested region
- **language**: The language used
- **updatedAt**: When the report was last updated
- **content**: Full text content of the report
- **forecast**: Array of daily forecasts with:
  - **day**: Day name (e.g., "Monday", "Tomorrow")
  - **description**: Weather conditions
  - **temperature**: Temperature information

### Example Usage

**In Claude Desktop or Claude.ai:**

Simply ask questions like:
- "What's the weather in Northern Switzerland?"
- "Show me the weather forecast for Western Switzerland in French"
- "Is it going to rain in Southern Switzerland this week?"

**Direct tool call:**
```json
{
  "tool": "meteoswissWeatherReport",
  "parameters": {
    "region": "north",
    "language": "en"
  }
}
```

### Example Response

```json
{
  "region": "north",
  "language": "en",
  "title": "Weather forecast for Northern Switzerland",
  "updatedAt": "Updated on Saturday, April 26, 2025, 16:49",
  "content": "Today Saturday: In the evening, quite sunny in the lowlands...",
  "forecast": [
    {
      "day": "Today Saturday",
      "description": "In the evening, quite sunny in the lowlands...",
      "temperature": "Temperature in the lowlands around 7 degrees..."
    },
    {
      "day": "Sunday",
      "description": "In the morning, quite sunny weather...",
      "temperature": "Temperature around 7 degrees in the morning..."
    }
  ]
}
```