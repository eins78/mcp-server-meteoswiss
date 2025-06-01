#!/bin/bash

# This script prepares the environment for Claude Desktop
# It compiles TypeScript and copies test fixtures to the expected location

# Stop on errors
set -e

# Log what we're doing
echo "Preparing MCP server for Claude Desktop..."

# Build the TypeScript code
echo "Building TypeScript code..."
pnpm install
pnpm run build

# Create the dist directory if it doesn't exist
mkdir -p dist/test/__fixtures__

# Copy test fixtures to the dist directory
echo "Copying test fixtures to dist directory..."
cp -r test/__fixtures__/weather-report dist/test/__fixtures__/

# Check if the test fixtures were copied successfully
if [ -d "dist/test/__fixtures__/weather-report" ]; then
  echo "✓ Test fixtures copied successfully"
else
  echo "✗ Failed to copy test fixtures"
  exit 1
fi

# List the contents of the fixtures directory
echo "Contents of dist/test/__fixtures__/weather-report:"
ls -la dist/test/__fixtures__/weather-report

echo "Environment is prepared for Claude Desktop"
echo "When running in Claude Desktop, ensure USE_TEST_FIXTURES=true is set" 
