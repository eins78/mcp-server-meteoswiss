#!/bin/bash
set -euo pipefail

# Release: version bump → commit → tag → Docker publish
#
# Prerequisites:
#   - Clean working tree (no uncommitted changes)
#   - Pending changesets in .changeset/
#   - Docker Hub login (`docker login`)
#
# Usage:
#   ./scripts/release.sh            # bump, tag, and publish
#   ./scripts/release.sh --dry-run  # show what would happen, don't push

DOCKER_REPO="${DOCKER_REPO:-eins78/meteoswiss-mcp-server}"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
    echo "==> DRY RUN — no changes will be pushed"
    echo ""
fi

# Guard: clean working tree
if [[ -n "$(git status --porcelain)" ]]; then
    echo "Error: Working tree is not clean. Commit or stash changes first."
    exit 1
fi

# Guard: pending changesets
CHANGESET_FILES=$(find .changeset -name '*.md' ! -name 'README.md' 2>/dev/null || true)
if [[ -z "$CHANGESET_FILES" ]]; then
    echo "Error: No pending changesets found. Run 'pnpm changeset' first."
    exit 1
fi

echo "==> Pending changesets:"
echo "$CHANGESET_FILES"
echo ""

# Step 1: Version bump (consumes changesets, updates package.json + CHANGELOG.md)
echo "==> Running changeset version..."
pnpm changeset version

# Read the new version from package.json
NEW_VERSION=$(node -p "require('./package.json').version")
TAG="v${NEW_VERSION}"

echo ""
echo "==> New version: ${NEW_VERSION} (tag: ${TAG})"
echo ""

# Step 2: Commit the version bump
echo "==> Committing version bump..."
git add -A
git commit -m "Version ${NEW_VERSION}"

# Step 3: Tag
echo "==> Tagging ${TAG}..."
git tag "${TAG}"

if [[ "$DRY_RUN" == true ]]; then
    echo ""
    echo "==> DRY RUN complete. To finish the release:"
    echo "    git push && git push --tags"
    echo "    ./scripts/publish.sh ${TAG}"
    exit 0
fi

# Step 4: Push commit and tag
echo "==> Pushing to origin..."
git push
git push --tags

# Step 5: Docker build and publish
echo ""
echo "==> Building and publishing Docker image..."
./scripts/publish.sh "${TAG}"

echo ""
echo "✅ Released ${TAG}"
echo "   - CHANGELOG.md updated"
echo "   - Git tag pushed"
echo "   - Docker image published: ${DOCKER_REPO}:${TAG}"
