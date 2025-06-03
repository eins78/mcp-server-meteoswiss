# Installation

## For Claude Desktop

1. **Start the server** (if not already running):
   ```bash
   npx mcp-server-meteoswiss
   ```
   Or run with Docker:
   ```bash
   docker run -p 3000:3000 meteoswiss-mcp-server
   ```

2. **Configure Claude Desktop**:
   
   Open your Claude Desktop configuration file:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   
   Add the MeteoSwiss server to your MCP servers:
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

3. **Restart Claude Desktop** to load the new configuration.

## For Claude.ai (Custom MCP Integration)

If you're using Claude.ai with a custom MCP integration:

1. **Connect to the server** using the MCP endpoint:
   ```
   http://localhost:3000/mcp
   ```

2. **Use mcp-remote** for the connection:
   ```bash
   npx mcp-remote http://localhost:3000/mcp
   ```

## Running Your Own Instance

### Using Node.js

```bash
# Clone the repository
git clone https://github.com/eins78/mcp-server-meteoswiss.git
cd mcp-server-meteoswiss

# Install dependencies
pnpm install

# Start the server
pnpm start
```

### Using Docker

```bash
# Run the latest version
docker run -p 3000:3000 -e USE_TEST_FIXTURES=false meteoswiss-mcp-server

# Or build your own
docker build -t my-meteoswiss-server .
docker run -p 3000:3000 my-meteoswiss-server
```

### Environment Variables

- `PORT` - Server port (default: 3000)
- `USE_TEST_FIXTURES` - Use test data instead of live API (default: false)
- `DEBUG_MCHMCP` - Enable debug logging (default: false)