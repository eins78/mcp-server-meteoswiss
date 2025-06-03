#!/bin/bash
set -euo pipefail

# Default values
PORT="${PORT:-3000}"
USE_TEST_FIXTURES="${USE_TEST_FIXTURES:-false}"
DEBUG_MCHMCP="${DEBUG_MCHMCP:-false}"

# Container name
CONTAINER_NAME="meteoswiss-mcp-server-dev"

# Stop and remove existing container if it exists
if docker ps -a | grep -q "$CONTAINER_NAME"; then
    echo "Stopping existing container..."
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    docker rm "$CONTAINER_NAME" 2>/dev/null || true
fi

echo "Starting meteoswiss-mcp-server:dev..."
echo "Port: $PORT"
echo "Use test fixtures: $USE_TEST_FIXTURES"
echo "Debug mode: $DEBUG_MCHMCP"
echo ""

# Run the container
docker run \
    --name "$CONTAINER_NAME" \
    -p "$PORT:$PORT" \
    -e PORT="$PORT" \
    -e USE_TEST_FIXTURES="$USE_TEST_FIXTURES" \
    -e DEBUG_MCHMCP="$DEBUG_MCHMCP" \
    --rm \
    -it \
    meteoswiss-mcp-server:dev

echo ""
echo "Container stopped."