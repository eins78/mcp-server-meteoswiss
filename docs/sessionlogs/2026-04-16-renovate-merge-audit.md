# Renovate PR Merge Audit

**Date:** 2026-04-16
**Source:** Claude Code (automated)

## Summary

Investigated and merged two blocked Renovate PRs. Both were `BLOCKED` due to `Security & Dependency Check` failure (`pnpm audit --audit-level moderate`). Root causes were in transitive dep overrides in root `package.json`, not in the project's own dependencies. Both PRs required a manual fix before merging.

## PR #67 — chore(deps): update all non-major dependencies

**Result: Fixed and merged (squash)**

**Root cause:** Two security issues:
1. Renovate bumped the `path-to-regexp@<0.1.13` override target from `0.1.13` to `0.2.5` — but `0.2.5` is in the GHSA-9wv6-86v2-598j vulnerable range (`>=0.2.0 <1.9.0`, HIGH severity). This is a known footgun: Renovate treats the override target as "another dep to update" without checking whether the new version re-enters a vulnerable range.
2. The existing `hono: >=4.12.12` override was too permissive. A new advisory (GHSA-458j-xx4x-4375, hono JSX HTML injection, moderate) requires `>=4.12.14`.

**Fix:** Commit `bcd3fbd` on `renovate/all-minor-patch`:
- Reverted `path-to-regexp@<0.1.13` target to `0.1.13`
- Bumped `hono` override from `>=4.12.12` to `>=4.12.14`
- Both vulnerabilities are transitive dev deps: `mcp-remote→express→path-to-regexp` and `@modelcontextprotocol/inspector→sdk→hono`

All checks passed after fix. Squash-merged.

## PR #48 — chore(deps): update node.js to v24

**Result: Merged main → branch, then squash-merged**

**Root cause:** Same `hono <4.12.14` advisory inherited from main (which had the stale override). This PR only touched `.devcontainer/Dockerfile` and `.nvmrc` and didn't update any overrides.

**Fix:** After PR #67 merged (bringing the hono override fix into main), merged `origin/main` into `renovate/node-24.x` to pull in the fix. Audit clean. All checks passed.

**Node 24 consistency review:**
- `pr-ci.yml`: already `node-version: 24` ✓
- Production `Dockerfile`: already `FROM node:24-alpine` ✓
- `package.json engines.node`: `>=22.0.0` (compatible, no change needed) ✓
- `.devcontainer/Dockerfile`: `node:20` → `node:24` (this PR) ✓
- `.nvmrc`: `23.11` → `24.15` (this PR) ✓

Everything consistent. Squash-merged.

## Changes to main after this session

- `pnpm.overrides["path-to-regexp@<0.1.13"]`: `0.2.5` → `0.1.13`
- `pnpm.overrides["hono"]`: `>=4.12.12` → `>=4.12.14`
- `pnpm.overrides["qs@<6.14.2"]`: `6.15.0` → `6.15.1`
- `pnpm.overrides["eslint-plugin-tsdoc>@typescript-eslint/utils"]`: `8.58.1` → `8.58.2`
- `.devcontainer/Dockerfile`: `node:20` → `node:24`
- `.nvmrc`: `23.11` → `24.15`
