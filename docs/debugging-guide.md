# Debugging Guide for MCP Server

This document provides information on how to debug the MCP server, particularly when using Claude Desktop.

## Debugging Claude Desktop Connection Issues

When encountering "server disconnected" errors in Claude Desktop, follow these steps to diagnose and resolve the issue:

### 1. Check Claude Desktop Logs

Claude Desktop logs are stored in:

```
~/Library/Logs/Claude/
```

Two important log files:

- `mcp-server-meteoswiss-weather.log` - Contains specific logs for our MCP server
- `mcp.log` - Contains general MCP framework logs

View the logs with:

```bash
cat ~/Library/Logs/Claude/mcp-server-meteoswiss-weather.log | tail -n 50
cat ~/Library/Logs/Claude/mcp.log | tail -n 20
```

### 2. Common Issues and Solutions

1. **Module Not Found Errors**
   - When using ES modules (ESM), always use the `node:` prefix for built-in modules:

   ```typescript
   // Correct
   import fs from 'node:fs/promises';
   import path from 'node:path';
   import { fileURLToPath } from 'node:url';
   
   // Incorrect
   import fs from 'fs/promises';
   ```

2. **Syntax Errors**
   - Ensure TypeScript is compiling to the correct target in `tsconfig.json`
   - ES2022 or higher is required for optional chaining (`?.`) and nullish coalescing (`??`)

3. **Transport Issues**
   - Claude Desktop requires the `StdioServerTransport` for communication
   - Make sure the server is properly connecting with:

   ```typescript
   const transport = new StdioServerTransport();
   await server.connect(transport);
   ```

### 3. Testing the Server

Before connecting to Claude Desktop, test the server locally:

```bash
npm run build
npm run start
```

Verify there are no errors in the console output.

## MCP Protocol Debugging Resources

For more detailed information on debugging MCP servers, refer to the [official MCP debugging documentation](https://modelcontextprotocol.io/docs/tools/debugging).
