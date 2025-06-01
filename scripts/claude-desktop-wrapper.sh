#!/bin/bash
set -eu -o pipefail

# Claude Desktop wrapper script
# Simple version that just ensures correct working directory

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Change to project directory
cd "$PROJECT_ROOT"

# Show debug info to stderr (not stdout!)
echo "=== MCP Server Starting ===" >&2
echo "Node version: $(node --version)" >&2
echo "Working directory: $(pwd)" >&2
echo "==========================" >&2

# Run the server
exec node dist/index.js stdio