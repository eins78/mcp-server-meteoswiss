#!/usr/bin/env bash
# Computes a "release <name> v<version>, <name> v<version>" title for the
# changesets Version Packages PR, by diffing each workspace package's
# package.json between two git refs, then sets it via `gh pr edit`.
#
# Both sides are read via `git show <ref>:<path>` rather than local disk,
# because `changesets/action` runs its version script in place: by the time
# this script runs, the checked-out working tree is already sitting on the
# bumped `changeset-release/main` commit, not on the pre-bump base branch.
# Comparing local disk to that same commit always finds zero diff.
#
# Usage: compute-version-pr-title.sh <before-ref> <after-ref> <pr-number>
set -euo pipefail

BEFORE_REF="${1:?usage: compute-version-pr-title.sh <before-ref> <after-ref> <pr-number>}"
AFTER_REF="${2:?usage: compute-version-pr-title.sh <before-ref> <after-ref> <pr-number>}"
PR_NUMBER="${3:?usage: compute-version-pr-title.sh <before-ref> <after-ref> <pr-number>}"

releases=()
for pkg_json in packages/*/package.json; do
  [ -f "$pkg_json" ] || continue

  after_json=$(git show "${AFTER_REF}:${pkg_json}" 2>/dev/null) || continue

  is_private=$(echo "$after_json" | jq -r '.private // false')
  [ "$is_private" = "true" ] && continue

  name=$(echo "$after_json" | jq -r '.name')
  new_version=$(echo "$after_json" | jq -r '.version // empty')

  before_json=$(git show "${BEFORE_REF}:${pkg_json}" 2>/dev/null || true)
  old_version=$(echo "${before_json:-}" | jq -r '.version // empty' 2>/dev/null || true)

  if [ -n "$new_version" ] && [ "$new_version" != "$old_version" ]; then
    releases+=("${name} v${new_version}")
  fi
done

if [ "${#releases[@]}" -eq 0 ]; then
  echo "No package version changes detected between ${BEFORE_REF} and ${AFTER_REF}; leaving PR title as-is." >&2
  exit 0
fi

printf -v joined '%s, ' "${releases[@]}"
joined="${joined%, }"
title="release ${joined}"

# Keep the title readable even with many packages in the release.
MAX_LEN=200
if [ "${#title}" -gt "$MAX_LEN" ]; then
  more=$(( ${#releases[@]} - 1 ))
  title="release ${releases[0]} and ${more} more package(s)"
fi

echo "Setting PR #${PR_NUMBER} title to: ${title}"
gh pr edit "${PR_NUMBER}" --title "${title}"
