#!/bin/bash
set -eu -o pipefail

# Claude Desktop wrapper script
# This ensures we use the correct Node version and working directory

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOME="${HOME:-"/Users/mfa"}"

# Change to project directory
cd "$PROJECT_ROOT"

# Explicitly set the Node version
export NVM_DIR="$HOME/.nvm"
# Only source nvm if it exists
if [ -s "$NVM_DIR/nvm.sh" ]; then
    source "$NVM_DIR/nvm.sh"
    # Try to use Node v24 if nvm is available
    # Redirect ALL output to stderr to avoid corrupting stdio
    if command -v nvm &> /dev/null; then
        nvm use 24.1.0 >&2 2>&1 || nvm use default >&2 2>&1
    fi
fi

# Show debug info
echo "=== Wrapper Debug Info ===" >&2
echo "Node version: $(node --version)" >&2
echo "NPM version: $(npm --version)" >&2
echo "Which node: $(which node)" >&2
echo "Working directory: $(pwd)" >&2
echo "=========================" >&2

# Run the server
exec node dist/index.js stdio
