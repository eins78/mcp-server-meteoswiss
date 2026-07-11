# Skills↔MCP Parity Lint — Structural Gate (STEP B)

**Date:** 2026-07-11
**Model:** Claude Fable 5 (worktree `skills-mcp-parity`, branch `infra/skills-parity-lint`)
**Plan:** `docs/plans/2026-07-11-skills-mcp-parity.md` (PR #119), resolved decisions 2, 3, 5
**Prerequisite:** PR #125 (`registerTool()` + output schemas, STEP A) — merged as `49949f6`
**Related sessionlogs:** `2026-07-11-skills-mcp-parity-proposal.md` (plan, rounds 1–4),
`2026-07-11-register-tool-output-schemas.md` (STEP A)

## What this delivers

A hard-blocking CI lint that keeps `packages/meteoswiss-skills` structurally in sync with the MCP
server's tool surface. Source of truth is **generated, never hand-maintained**: the server's own
`tools/list` response, captured in-process (`createServer()` → `InMemoryTransport` →
`Client.listTools()`; no network — tool registration is static, so no fixtures needed either).
Because STEP A landed first, that inventory carries full output schemas, not just input params.

- `packages/meteoswiss-mcp/scripts/skills-parity-lib.ts` — pure logic (inventory building,
  marker/provenance extraction, the `checkParity` finding engine). Type-checked via ts-jest.
- `packages/meteoswiss-mcp/scripts/lint-skills-parity.ts` — CLI: lint mode (exit 1 on findings)
  and `--update` (regenerate the snapshot).
- `packages/meteoswiss-mcp/parity/tool-inventory.json` — committed generated snapshot, diffed
  against the live server every run. Drift (tool added/removed/renamed, param/description/output
  schema changed) fails the lint until `parity:update` is run in the same change, with a message
  naming the added/removed/changed tools.
- Coverage markers `<!-- mcp-tool: name -->` in `SKILL.md`/`REFERENCE.md` — completeness (every
  in-scope tool marked) and staleness (no marker without a live tool) both fail the lint.
- `packages/meteoswiss-mcp/parity/parity-exceptions.yml` — the only hand-written residual:
  `excluded-tools` (`search`/`fetch` with the resolved-decision-2 rationale: website-content
  extensions, intentionally no OGD-skill equivalent) and non-schema `exceptions`
  (`weather-icons.ts` value table, Latin1 CSV gotcha). Every entry staleness-checked; an excluded
  tool that disappears, an exception source that no longer exists, or the skill's own pre-existing
  `<!-- Canonical source: … -->` comments pointing at deleted files all fail the lint. An
  excluded-but-marked tool is flagged as a contradiction.

Wiring: `lint:parity` joined the package `lint` chain (so it runs in the **Lint, Build & Test**
job and locally in every `pnpm run ci`) plus a dedicated **Skills-MCP parity (structural gate)**
step in the **Skill Validation** job for visible attribution. Both are hard-blocking. 18 unit
tests cover every finding kind; two live tests re-run the real generation and pin the committed
snapshot + full parity, so drift also fails the test suite.

## The red→green proof (resolved decision 5), as it actually ran

1. **The first commit landed the gate intentionally RED**: markers were added for the four
   documented tools only — `meteoswissClimateData`, the known pre-existing gap the skill's own
   README admitted, got none. Local characterization before pushing: tsc, eslint, build all green;
   222/224 tests passing; the *only* failures were the parity lint (`missing-marker:
   meteoswissClimateData`) and the live-parity test asserting the same thing.
2. **CI on PR #128 went red exactly as designed**: `Lint, Build & Test` failed (lint chain) and
   `Skill Validation` failed (dedicated step); Docker and security passed. The guard demonstrably
   catches a real, pre-existing gap — on the record in this PR's CI history.
3. **Commit 2 closed the gap**: new `## 5. Get Climate Data` section in `SKILL.md` (with marker),
   a Climate Parameters (NBCN) table in `REFERENCE.md` + TOC entry + `ogd-nbcn-precip` in the STAC
   table, Quick Reference row, and a README gap-note update (climate *series* covered; only
   *normals* remain pending upstream). Lint output flipped to
   `OK — 7 tools, 2 excluded, 5 covered by markers`.

## Decisions and rationale

- **Markers + snapshot instead of literal name-matching** — the plan's round-3 finding: the skill
  mentions zero MCP tool names (capability-organized, teaches curl) and its vocabulary is OGD
  parameter codes, so name-matching would have failed all five OGD tools forever. Markers are
  co-located coverage declarations (an evolution of the skill's existing Canonical-source comment
  convention); the snapshot is the drift tripwire. Both generated-in-spirit; the exceptions file
  stays tiny and is itself linted.
- **Structural, explicitly not semantic** — the gate proves coverage/no-dead-refs/acknowledged
  drift; it cannot prove the prose still correctly *describes* a tool. Stated in the lib header
  and the plan; the advisory agent judge for semantic parity remains a follow-on.
- **Skill content verified live before documenting** — every URL/column in the new climate section
  was exercised against the real OGD endpoints first (monthly + yearly CSVs for SMA/BAS, the STAC
  metadata asset href, Latin1 encoding of the station metadata confirmed empirically, the exact
  curl example run verbatim). The MCP data module (`ogd-climate-data.ts`) supplied the URL pattern
  and column codes; live checks confirmed them.
- **`scripts/` stays outside `src/`** — parity tooling isn't server runtime code and must not ship
  in `dist`/Docker. The lib gets type-checked through ts-jest (tests import it); the thin CLI is
  exercised on every `pnpm run lint`.
- **`js-yaml` (+types) added as devDependency** via pnpm CLI — already pinned in the workspace via
  the security override (`js-yaml@4.3.0`), so no new resolution.
- **Markdown-table pitfall caught**: the Quick Reference climate row originally used
  `{m|y|d_recent}` in a table cell — pipes inside backticks still split GitHub table cells;
  reworded to `{res}` with the values listed outside the braces.

## Verification

- `pnpm run fix && pnpm run ci` green on the final state: 23 suites, 223 passed, 1 pre-existing
  skip; `skills-parity: OK — 7 tools, 2 excluded, 5 covered by markers`.
- `pnpm --filter meteoswiss-skills test` (skill format validation) green with the new section.
- Snapshot determinism verified: re-running `parity:update` produces a byte-identical file.
- Exit codes verified explicitly: lint mode exits 1 on findings, 0 when clean; `--update` exits 0.
- The red CI run on PR #128 is the end-to-end proof of the failure path.

## Changeset

`meteoswiss-skills`: minor (new climate-data skill capability). The lint/CI tooling itself needs
no changeset per repo policy (CI config / dev tooling).

## Copilot review fixes

Copilot's review produced one inline finding on `resolveReferencedPath()`: that absolute or
`..`-traversing referenced paths could match files outside the repo and wrongly pass the
staleness check. Verified before implementing: the claimed mechanism was half-wrong —
`path.join()` does NOT discard its base for absolute second arguments (that's `path.resolve()`)
— but the traversal half is real, so the guard is worth having. Fix: reject absolute paths and
any path containing a `..` segment (they now resolve to no candidates → flagged stale rather
than silently matching outside the repo). Lint + parity tests re-run green.

Round 2 added one more legitimate finding (raised twice, once per entry type): the Zod schema
accepted empty/whitespace-only `reason` strings, letting the YAML satisfy the lint without
actually documenting the decision. Fixed with a shared `ReasonSchema` (`trim().min(10)`) on both
`excluded-tools` and `exceptions` entries, plus tests rejecting blank/whitespace/too-short
reasons. Full CI re-run green (23 suites, 224 passed).

Round 4 (on the folded tip) found one more genuine gap: `scripts/` was neither tsc-checked
(package tsconfig includes only `src/**`) nor eslint-covered, and `tsx` transpiles without
type-checking — so script type errors could surface only at runtime. Fixed with
`tsconfig.scripts.json` (noEmit, includes `scripts/**` + `src/**`) chained into `lint:ts`.
The new check immediately caught two real `noUncheckedIndexedAccess` violations in
`skills-parity-lib.ts` regex-match indexing that ts-jest had not flagged — fixed with guards.

Round 3 found one minor doc inconsistency: the Quick Reference climate row said "Updates: Daily"
while covering monthly/yearly resolutions too. Reworded to "Daily (`d_recent`); `m`/`y` as
periods close". Loop capped here per instruction — three rounds, findings trending from real
(path traversal) through hardening (blank reasons) to wording; converged.

## Delivery

Copilot loop capped at three rounds (converged). Per Max's direction, the review-fix churn
commits were folded back into their originals — the two linter-hardening fixes into the RED
commit, the wording fix into the GREEN commit — while the **red→green pair itself was kept
intact and unfolded**: it is the deliverable's proof-of-function (resolved decision 5), and the
red CI run on the PR is its visible record. Rebased onto latest `main`, CI green on the tip,
merged with a merge commit (no squash).

## Pending / follow-ups
- [ ] Follow-on (out of scope, per plan): advisory agent judge for *semantic* parity on release PRs.
- [ ] Follow-on: `_d_historical` daily climate files are mentioned but not exemplified in the
      skill; extend if agents turn out to need pre-2-year daily data often.
