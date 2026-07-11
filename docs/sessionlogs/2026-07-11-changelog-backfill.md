# CHANGELOG Backfill & Correction (meteoswiss-mcp)

**Date:** 2026-07-11
**Model:** Claude Opus 4.8 (worktree `changelog-backfill`, branch `worktree-changelog-backfill`)
**PR:** _(see PR link once opened)_

## Motivation

`packages/meteoswiss-mcp/CHANGELOG.md` only covered releases from 2.1.0 up to 2.3.2, and even
that range had drifted out of sync with the actual git tags and published GitHub release notes.
The goal: reconstruct the missing historical entries from the git/PR record, in a standalone PR,
without touching changesets config, the release workflow, or `package.json` versions (that
skills↔changesets work is owned by a parallel branch — `infra/skills-changesets-release`).

## What the record showed

Surveying `git tag`, `gh release list/view`, and the changelog revealed **five** released
versions with no correct entry: `1.0.0`, `2.0.0`, `2.0.1`, `2.0.2`, and `2.2.1`. RC pre-release
tags and the `meteoswiss-skills` package (only `1.0.0` released, already in its own changelog)
were confirmed out of scope.

## Design decision: the 2.2.0 / 2.2.1 / 2.3.0 tangle was a misfiling, not just a gap

The `## 2.2.0` section listed two blocks — a Tier-1 OGD features minor (`615eb7a`) and a
fetch/pollen/forecast patch (`32373ae`) — and there was no `## 2.2.1` heading at all. Cross-
checking each hash against commit dates and the published GitHub release notes proved the whole
region was mislabeled:

| Version | Should contain | Was showing |
|---------|----------------|-------------|
| 2.3.0   | **Minor:** Tier-1 features (`615eb7a`) + **Patch:** location resolver (`de9c937`) | only the patch |
| 2.2.1   | **Patch:** fetch/pollen/forecast fixes (`32373ae`) | *(missing — folded into 2.2.0)* |
| 2.2.0   | **Minor:** opt-in Prometheus metrics (`ff0cf3b`, #58) | Tier-1 + fetch fixes (both wrong) |

The decisive evidence was **commit-authoring dates**: `615eb7a` (Tier-1) was authored
`2026-04-08 16:52`, two minutes before tag `2.3.0-rc.1` (`16:54`) and a full five days *after*
tag `2.2.0` (`2026-04-03`). A commit authored April 8 physically cannot be in an April 3 release,
regardless of its "for v2.2.0 minor release" commit message. Three independent signals agreed:
commit dates, GitHub release notes (2.2.0=metrics, 2.2.1=fetch, 2.3.0=resolver), and semver
bump arithmetic (every bump now has a matching change of the right type).

## What was done

- **Relocated verbatim** (exact hashes + wording preserved, so the diff reads as cut/paste):
  - Tier-1 block (`615eb7a`) → new `### Minor Changes` under `## 2.3.0`, above the existing
    `de9c937` patch.
  - Fetch-fixes block (`32373ae`) → new `## 2.2.1`.
- **Wrote the genuinely-new 2.2.0 entry** — opt-in Prometheus metrics (`ff0cf3b`, #58) — from
  the tag contents and GitHub release notes.
- **Backfilled the four old versions** (`1.0.0`, `2.0.0`, `2.0.1`, `2.0.2`), each anchored to
  its real tag commit SHA for verifiability:
  - `1.0.0` (`74b8c37`) — initial MVP: `meteoswissWeatherReport`, DE/EN/FR/IT, HTTP/SSE + Docker.
  - `2.0.0` (`d6b1c62`, #43) — OGD rewrite, monorepo, new tool set, `meteoswissWeatherReport`
    removed, SSE→Streamable HTTP, Zod 4.
  - `2.0.1` (`63f6f7f`, #50) — automated release pipeline (npm OIDC + multi-arch GHCR), npm
    package size fix.
  - `2.0.2` (`a976037`) — MCP Registry metadata + registration.

## Format & accuracy notes

- Mirrors the existing **changesets** style (`## version` → `### Major/Minor/Patch Changes` →
  `- <sha>: …`), **not** Keep-a-Changelog `Added/Changed/Fixed` — the file was never in that
  style. `1.0.0` and `2.0.x` predate changesets (removed in #50, re-added later), so they never
  had changeset hashes; the tag-commit SHA is used as a real, verifiable anchor instead.
- Marketing prose from the GitHub release pages (taglines, quick-start blocks, tool tables) was
  distilled to factual bullets. Only claims supported by the git/PR/release record were kept.
- Because `changeset version` only *prepends* new sections below the H1 and never rewrites
  existing ones, these hand-authored historical entries are safe from being clobbered by future
  automated releases.

## Confidence

All ten versions reconstructed with high confidence — every entry is triangulated against commit
dates, GitHub release notes, and semver bump type. No version was left uncertain.

## Follow-up: dated version headers

Per Max's request, every version header was changed from bare `## X.Y.Z` to
`## X.Y.Z - YYYY-MM-DD` using the tag creation dates
(`git tag --format='%(refname:short) %(creatordate:short)'`), unbracketed to match the
changesets header style. This keeps the past entries (hand-authored here) consistent with the
format %6's automation will apply to future releases.

Dates applied: 2.3.2 → 2026-04-20; 2.3.1 / 2.3.0 → 2026-04-18; 2.2.1 / 2.2.0 → 2026-04-03;
2.1.0 / 2.0.2 / 2.0.1 / 2.0.0 / 1.0.0 → 2026-03-29.

One caveat worth recording: `1.0.0`'s *tag* date is 2026-03-29 (the tags were recreated during
the monorepo restructure), whereas the original MVP was published 2025-06-09. Tag dates were
used as instructed, so the header reads 2026-03-29.
