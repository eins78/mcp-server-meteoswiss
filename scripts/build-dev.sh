#!/bin/bash
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-meteoswiss-mcp-server}"

# Build Docker image with dev tag
echo "Building ${IMAGE_NAME}:dev..."

# Build the Docker image
docker build -t ${IMAGE_NAME}:dev .

echo "✅ Docker image built successfully: ${IMAGE_NAME}:dev"
echo ""
echo "To run the container, use: ./scripts/run-dev.sh"
