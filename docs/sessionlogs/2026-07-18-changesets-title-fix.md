# Fix: dynamic Version Packages PR title always fell back to the static default

**Date:** 2026-07-18
**Source:** Claude Code (Opus 4.8, autonomous)
**Session:** Follow-up to PR #135, triggered by Max asking to verify the merged feature actually worked

## Summary
Max merged #135 (dynamic "Version Packages" PR title + RC visibility comments) and asked me to verify it against a real trigger: PR #131 merged right after, carrying a `meteoswiss-skills` changeset, which caused `version-packages.yml` to run for real. The dynamic-title step ran without erroring, but PR #117's title stayed the static `"Version Packages"` — the feature silently no-op'd instead of firing. Root-caused and fixed in this PR.

## Root Cause
`compute-version-pr-title.sh` compared **local disk** `package.json` files (as the "before" state) against `origin/changeset-release/main` (the "after" state). This assumption was wrong: `changesets/action`'s "Create or update version PR" step does its version bump **in place** in the same job's working tree — its own log shows `git checkout -b changeset-release/main`, `git reset --hard <trigger-sha>`, runs `pnpm run version` (bumping local `package.json` files), commits, then `git push origin HEAD:changeset-release/main --force`. By the time my follow-up step ran, local disk was *already* sitting on the bumped `changeset-release/main` commit — identical to what I was diffing it against. The comparison was always `X == X`, so the script always reported "no changes detected" and left the static title in place. Confirmed directly from the Actions log of the run triggered by PR #131's merge (`gh run view 29649585326 --log`).

## Fix
Changed the script to take two explicit git refs (`<before-ref> <after-ref>`) instead of one ref + local disk, and read **both** sides via `git show <ref>:<path>` — never touching local disk state. The workflow now passes `github.sha` (this push's guaranteed pre-bump commit) as `BEFORE_SHA` and `HEAD` as the after-ref (which, per the trace above, is reliably the bumped commit once `changesets/action` has run). This also let me drop the now-unnecessary `git fetch origin changeset-release/main` step — `HEAD` already has everything needed locally.

## Verification
- `shellcheck` and `actionlint` (same setup as PR #135) both clean.
- Reproduced the **exact** original bug via git plumbing: built two throwaway commits (`git hash-object` / `update-index --cacheinfo` / `commit-tree`, never touching the real working tree) — one at the real pre-bump `main` HEAD (`7eba09e`, the actual commit PR #131 merged into), one with mocked bumped versions. Running the *fixed* script with `(before, after)` = `(7eba09e, mock-bump)` correctly produced `release meteoswiss-mcp v3.0.0, meteoswiss-skills v1.1.0`. Running it with `(before, after)` = `(mock-bump, mock-bump)` — simulating the exact "local disk already bumped" condition that broke production — reproduced the original silent no-op, confirming the root cause.
- Private-package exclusion (`meteoswiss-forecast-evals`) and the no-op/truncation paths are unchanged logic and were re-verified in the same dry-run.
- Did not trigger a real release to test, per the same constraint as PR #135 — the next real merge with a pending changeset is the real integration test.

## What This Means For PR #117 Right Now
PR #117 ("Version Packages") is still titled `Version Packages` on `main` as of this fix — that's expected; nothing will retitle it until the next push to `main` re-runs `version-packages.yml` with this fix in place. The RC pre-release-comment feature (the other half of #135) hasn't been exercised yet either way, since no RC has been published since #135 merged — it's independent of this bug and still believed correct (it doesn't do a before/after `package.json` diff at all, just reads the tag-derived version straight from `steps.version.outputs.version`).

## Next Steps
- Max reviews and merges. The next `main` push carrying a changeset (or the next Version Packages PR update) is what will actually confirm the fix in production — worth checking PR #117's title again after that.
