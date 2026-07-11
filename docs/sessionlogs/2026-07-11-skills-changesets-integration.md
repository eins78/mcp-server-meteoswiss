# Integrate meteoswiss-skills into the Changesets release flow

**Date:** 2026-07-11
**Model:** Claude Opus 4.8 (worktree `changeset-release-fix`, branch `infra/skills-changesets-release`)
**PR:** [#123](https://github.com/eins78/meteoswiss-llm-tools/pull/123)

## Motivation

The Version Packages PR (#117) only ever released `meteoswiss-mcp`. Max wanted `meteoswiss-skills`
to be a first-class release citizen too, modeled on how his `eins78/agent-skills` repo wires skills
into changesets.

## What agent-skills actually does (reference研究)

Dispatched a research subagent to read `eins78/agent-skills` end to end. Key finding: it is **not a
workspace** — one root `package.json`, and skills are just `skills/<name>/` directories whose version
lives in `SKILL.md` frontmatter (`metadata.version`). Because changesets can't see individual skills
in a single-package repo, agent-skills encodes per-skill bumps in an HTML comment inside each
changeset body:

```markdown
---
"@eins78/agent-skills": patch
---
Brief description
<!--
bumps:
  skills:
    skill-name: patch
-->
```

Its root `version` script wraps changesets: `bump-skill-versions.sh` (parse the comments, bump each
SKILL.md) → `changeset version` (root package + CHANGELOG) → `sync-versions.sh` (propagate root
version into `plugin.json`/`cursor-plugin`/`marketplace.json`). Its `publish:` step is a bash script
that creates git tags (`v3.1.0` + per-skill `pandoc@1.3.0`) and a GitHub Release — **no npm publish**;
distribution is the git-based Claude Code plugin marketplace.

## The gap here was smaller than agent-skills'

meteoswiss is a **real pnpm workspace**. `meteoswiss-skills` is already a first-class changesets
package (its `CHANGELOG.md` is changeset-generated; a `meteoswiss-skills-v1.0.0` tag exists), so the
`<!-- bumps -->` hack is unnecessary — a plain `"meteoswiss-skills": patch` changeset frontmatter
bumps its `package.json` natively (exactly what the pending #122 does).

The only real gap: the skill is also a Claude Code / Cursor plugin, so its version is mirrored in four
files changesets doesn't manage, all stuck at `1.0.0` while `package.json` would bump:
`.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` (`plugins[]`),
`.cursor-plugin/plugin.json`, and `skills/*/SKILL.md` (`metadata.version`).
(`meteoswiss-forecast-evals` is `private: true`, so changesets correctly ignores it.)

## Decision: version-sync only (asked Max)

agent-skills auto-creates tags + a GitHub Release in its `publish:` step. meteoswiss releases both
packages manually. Surfaced this as the one real design choice; Max chose **version-sync only** —
keep the manual release flow, just make `changeset version` sync the manifests. Consistent with his
earlier "keep it manual" stance on the release pipeline.

## Implementation

Ported only the sync half of agent-skills' `version`-script wrap:

- `scripts/sync-skill-manifest-versions.mjs` — treats `package.json` as the single source of truth and
  propagates its version into the four mirrors via **targeted string edits** (find `"version": "<old>"`
  → replace), preserving each file's formatting rather than reserializing (which would reflow inline
  arrays like `keywords`). No-op when already in sync.
- Root `version` script → `changeset version && node scripts/sync-skill-manifest-versions.mjs`
  (the CHANGELOG date-stamping step below is appended too); and `version-packages.yml` now calls
  `pnpm run version` instead of `pnpm changeset version`.
- CLAUDE.md documents the skills-changeset convention + "don't hand-edit the mirror version fields".

## Verification

- Simulated bump (`package.json` → 1.0.1) then a full `pnpm run version` with a temp
  `"meteoswiss-skills": patch` changeset: `package.json` + `CHANGELOG.md` → 1.0.1 and all four mirrors
  → 1.0.1, diff limited to version lines only. MCP independently bumped 2.3.2 → 2.4.0 from the real
  pending changesets. Reverted the test artifacts.
- MCP-only path: sync reports `0 file(s) updated` → clean no-op, no spurious diffs.
- `pnpm install --frozen-lockfile` green; `pnpm --filter meteoswiss-mcp run ci` 22 suites / 202 tests;
  `pnpm --filter meteoswiss-skills test` green.

## Interaction with #122

#122 adds a `"meteoswiss-skills": patch` changeset. No conflict — once it merges, the next Version
Packages run bumps `meteoswiss-skills 1.0.0 → 1.0.1` and the sync propagates it to every mirror.

## Also in this PR: correct the #110 changeset bump (minor → major)

`.changeset/qa-sweep-issue-110-fixes.md` was `"meteoswiss-mcp": minor`, but its body lists two
explicit `**BREAKING:**` changes (`fetch` drops the duplicate `content` field; `search` drops the
`pageSize` parameter). Per semver that's a `major`. Bumped it to `major`. `pnpm changeset status`
(read-only) confirms `meteoswiss-mcp` now computes at major. Combined with #101's own `major`
changeset on #122, the next MCP release is **3.0.0** (from 2.3.2), not 2.4.0. Cutting that release
remains Max's call — this PR only fixes the changeset metadata.

## Also in this PR: CHANGELOG date stamping

`.changeset/config.json` uses `@changesets/cli/changelog`, which writes bare `## X.Y.Z` headers with
no date. Added `scripts/stamp-changelog-dates.mjs` (wired into the root `version` script after the
sync step) that rewrites each **newly-added** header to `## X.Y.Z - YYYY-MM-DD` — the exact
unbracketed format the historical backfill (#124) uses, so past and future match.

"Newly added" is detected via `git diff HEAD` restricted to CHANGELOG files, so it only stamps the
header(s) *this* `changeset version` run introduced — never a pre-existing entry, and (critically)
never a historical undated header lower in the file. It's idempotent: an already-dated header won't
re-match, and a run with no bumps is a no-op.

Verified in the same dry-run: the new `## 3.0.0` (mcp) and `## 1.0.1` (skills) headers came out as
`## 3.0.0 - 2026-07-11` / `## 1.0.1 - 2026-07-11`, while the historical `## 2.3.2`/`## 2.3.1`/`## 2.3.0`
and `## 1.0.0` headers were left bare/untouched.

## Not done (deliberately)

Per the chosen scope: no auto-tagging, no auto-GitHub-Release, no per-skill `<skill>@<version>` tags,
no marketplace.json regeneration-from-scratch. The single skill/plugin doesn't warrant agent-skills'
full machinery; revisit if the package grows to multiple independently-versioned skills.
