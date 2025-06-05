# Usage

This MeteoSwiss MCP server is hosted and ready to use. No installation required!

## Claude Desktop

Add the MeteoSwiss server to your Claude Desktop configuration:

1. Open your configuration file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add this configuration:

```json
{
  "mcpServers": {
    "meteoswiss": {
      "command": "npx",
      "args": ["mcp-remote", "https://meteoswiss-mcp-demo.cloud.kiste.li/mcp"]
    }
  }
}
```

3. Restart Claude Desktop

That's it! You can now ask Claude about Swiss weather.

## Claude.ai

To use with Claude.ai:

1. Go to your Claude.ai settings
2. Navigate to the "MCP Servers" or "Integrations" section
3. Add a new MCP server with the URL: `https://meteoswiss-mcp-demo.cloud.kiste.li/mcp`
4. Save your settings

The MeteoSwiss weather data will now be available in your Claude.ai conversations.

## Example Questions

Once configured, you can ask Claude questions like:

- "What's the weather forecast for Northern Switzerland?"
- "Show me the weather in Western Switzerland in French"
- "Is it going to rain in Southern Switzerland this week?"
- "Get me the weather report for the Alps region"

## For Developers

Want to run your own instance? Check out the [GitHub repository](https://github.com/eins78/mcp-server-meteoswiss) for instructions on self-hosting.
