#!/usr/bin/env bash
# Computes a "release <name> v<version>, <name> v<version>" title for the
# changesets Version Packages PR, by diffing each workspace package's
# package.json against the ref changesets/action just bumped versions on,
# then sets it via `gh pr edit`.
#
# Usage: compute-version-pr-title.sh <git-ref-with-bumped-versions> <pr-number>
set -euo pipefail

REF="${1:?usage: compute-version-pr-title.sh <git-ref-with-bumped-versions> <pr-number>}"
PR_NUMBER="${2:?usage: compute-version-pr-title.sh <git-ref-with-bumped-versions> <pr-number>}"

releases=()
for pkg_json in packages/*/package.json; do
  [ -f "$pkg_json" ] || continue

  is_private=$(jq -r '.private // false' "$pkg_json")
  [ "$is_private" = "true" ] && continue

  name=$(jq -r '.name' "$pkg_json")
  old_version=$(jq -r '.version' "$pkg_json")
  new_version=$(git show "${REF}:${pkg_json}" 2>/dev/null | jq -r '.version // empty' 2>/dev/null || true)

  if [ -n "$new_version" ] && [ "$new_version" != "$old_version" ]; then
    releases+=("${name} v${new_version}")
  fi
done

if [ "${#releases[@]}" -eq 0 ]; then
  echo "No package version changes detected between HEAD and ${REF}; leaving PR title as-is." >&2
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
