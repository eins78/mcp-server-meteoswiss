#!/bin/bash
set -euo pipefail

# Build Docker image with dev tag
echo "Building meteoswiss-mcp-server:dev..."

# Build the Docker image
docker build -t meteoswiss-mcp-server:dev .

echo "✅ Docker image built successfully: meteoswiss-mcp-server:dev"
echo ""
echo "To run the container, use: ./scripts/run-dev.sh"