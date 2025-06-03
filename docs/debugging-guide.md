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
   - This server uses HTTP with Server-Sent Events (SSE) for communication
   - The server runs on a configurable port (default: 3000)
   - Connect using mcp-remote:

   ```bash
   npx mcp-remote http://localhost:3000/mcp
   ```

### 3. Testing the Server

Before connecting to Claude Desktop, test the server locally:

```bash
# Start the server
pnpm run start

# In another terminal, test with MCP Inspector
pnpm run dev:inspect
```

Verify there are no errors in the console output.

### 4. Environment Variables

The server supports several environment variables for debugging:

- `DEBUG_MCHMCP=true` - Enables debug logging to file
- `USE_TEST_FIXTURES=true` - Uses local test data instead of live API calls
- `PORT=3000` - Server port (default: 3000)

### 5. Common HTTP Server Issues

1. **Port Already in Use**
   - Check if another process is using the port:
   ```bash
   lsof -i :3000
   ```

2. **Connection Timeouts**
   - SSE connections have a configurable timeout (default: 5 minutes)
   - Check `SESSION_TIMEOUT_MS` environment variable

3. **Rate Limiting**
   - The server implements rate limiting (default: 100 requests/minute)
   - Check `RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_WINDOW_MS`

## MCP Protocol Debugging Resources

For more detailed information on debugging MCP servers, refer to the [official MCP debugging documentation](https://modelcontextprotocol.io/docs/tools/debugging).
