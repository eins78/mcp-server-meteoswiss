#!/usr/bin/env bash
# Posts a comment on the open Version Packages PR (if any) announcing a
# freshly-published pre-release, so RC publishes stay visible from the PR
# that will eventually cut the real release. No-ops cleanly if there's no
# open Version Packages PR at the time (nothing pending).
#
# Usage: comment-prerelease-pr.sh <package-name> <version>
set -euo pipefail

PACKAGE_NAME="${1:?usage: comment-prerelease-pr.sh <package-name> <version>}"
VERSION="${2:?usage: comment-prerelease-pr.sh <package-name> <version>}"

PR_NUMBER=$(gh pr list --head changeset-release/main --state open --json number -q '.[0].number')

if [ -z "$PR_NUMBER" ] || [ "$PR_NUMBER" = "null" ]; then
  echo "No open Version Packages PR found for changeset-release/main; skipping comment." >&2
  exit 0
fi

gh pr comment "$PR_NUMBER" --body "$(cat <<EOF
🚀 Published pre-release **${PACKAGE_NAME}@${VERSION}** to npm under the \`next\` dist-tag:
https://www.npmjs.com/package/${PACKAGE_NAME}/v/${VERSION}
EOF
)"
