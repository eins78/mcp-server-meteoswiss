#!/bin/bash
set -euo pipefail

# Check if tag is provided
if [ $# -eq 0 ]; then
    echo "Error: No tag provided"
    echo "Usage: $0 <tag>"
    echo "Example: $0 v1.0.0"
    exit 1
fi

TAG=$1
DOCKER_REPO="${DOCKER_REPO:-meteoswiss-mcp-server}"

# Check if user is logged in to Docker Hub
if ! docker info 2>/dev/null | grep -q "Username"; then
    echo "Error: Not logged in to Docker Hub"
    echo "Please run: docker login"
    exit 1
fi

echo "Publishing $DOCKER_REPO with tag: $TAG"
echo ""

# Build the image first
echo "Building Docker image..."
docker build -t "$DOCKER_REPO:$TAG" .

# Tag as latest if it's not a pre-release
if [[ ! "$TAG" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+-.*$ ]]; then
    echo "Tagging as latest..."
    docker tag "$DOCKER_REPO:$TAG" "$DOCKER_REPO:latest"
fi

# Push to Docker Hub
echo ""
echo "Pushing to Docker Hub..."
docker push "$DOCKER_REPO:$TAG"

if [[ ! "$TAG" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+-.*$ ]]; then
    docker push "$DOCKER_REPO:latest"
fi

echo ""
echo "✅ Successfully published $DOCKER_REPO:$TAG to Docker Hub"

# Show the pull command
echo ""
echo "To pull this image:"
echo "  docker pull $DOCKER_REPO:$TAG"