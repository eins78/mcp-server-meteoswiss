# v2.3.0 improvement plot-idea + QA-report regression tests

**Date:** 2026-04-18
**Branches:** `idea/v230-improvement-plan`, `infra/v230-qa-regression-tests`
**PRs:** [#84 (draft plan)](https://github.com/eins78/meteoswiss-llm-tools/pull/84), [#85 (tests, ready-for-review)](https://github.com/eins78/meteoswiss-llm-tools/pull/85)

## Context

External QA pass on v2.3.0 by Functional GmbH (2026-04-18) ran 34 test cases across all 7 tools: 25 pass, 7 WARNs, 2 FAILs. Surfaced 10 prioritised recommendations (2× P1, 3× P2, 5× P3).

Session brief: produce two independent deliverables, no fixes.

## What was produced

### PR #84 — plot-idea plan (draft, `docs` type)

- Plan file: `docs/plans/2026-04-18-v230-improvement-plan.md` (148 lines)
- Symlink: `docs/plans/active/v230-improvement-plan.md`
- Content: findings inventory keyed to external IDs, 4 root-cause clusters, PR #82 overlap flag, Options A-D with steelman+critique, recommendation **Option B + C** (2.3.1 patch for the two P1s; 2.4.0 minor as four cluster PRs).
- Deferred decisions: fold REC-05 / REC-09 into PR #82 or keep standalone — left for whoever approves `feature/resolver-unification`.
- No implementation of any REC.

### PR #85 — QA regression tests (non-draft, `infra` type)

- Test file: `packages/meteoswiss-mcp/test/integration/external-qa-report-v230.test.ts` (588 lines, 42 tests)
- Result: 18 passed, 24 skipped, 0 failed
- Skip markers in test name so `jest --list` surfaces the debt:
  - `KNOWN-FAIL` (4) — LF-04, CD-05, CD-06, SR-06 (REC-01, REC-03, REC-05)
  - `KNOWN-WARN` (8) — CW-01, ST-04, PO-derived, CD-derived, SR-03, FE-02, FE-03, CW-derived (REC-02, REC-04, REC-06, REC-07, REC-08, REC-09, REC-10)
  - `SKIP-FIXTURE` (12) — stations / params not covered by current fixture inventory (Davos, Locarno, SMA daily+yearly, SMA/Lugano/JUN forecast rows, etc.)
- Each `it.skip` flips to `it()` when the underlying REC is fixed or the fixture is added.

## Decisions made

- **BAS-as-surrogate for climate tests**: fixture routing in `src/data/ogd-data-store.ts:21-80` maps every NBCN monthly/daily URL to `nbcn-bas-*.csv`. CD-01 and CD-03 (external report used Zurich/SMA) run against BAS with a comment explaining the surrogate. Station-specific behavior (Davos, Locarno, SMA yearly) → `SKIP-FIXTURE`.
- **Fixture policy for this PR**: do not add new fixtures. Skipped-for-fixture tests are documented with `// needs fixture: <name>.csv` — a future PR can unskip them.
- **Skip-marker convention**: `it.skip('XX-NN: KNOWN-FAIL (REC-NN) — <behaviour>', ...)`. Prefix-in-name so regression debt is greppable via `jest --list`. Jest ESM (`ts-jest`) has no `test.fails` / `it.failing`.
- **Branch prefix `infra/`**: repo uses `idea/feature/bug/docs/infra/` (Plot Config in `CLAUDE.md`). Jest test additions are infra, not a bug fix.
- **PR #82 overlap flagged, not folded**: REC-05 (ZUE forecast rejection) and REC-09 (Zürich→KLO) are adjacent to PR #82's geocoding review but concern different resolver layers. Documented in plan, decision deferred.

## Non-goals (held)

- No REC fix
- No 2.3.1 release cut
- No new fixtures
- No changes to tool behavior
- No touch to v2.3.0 tag, PROD, `context/data.yaml`, or home-workspace
- No Telegram messages
- No merge

## Issues hit

- `pnpm run fix` failed on first run — node_modules missing in fresh worktree. Resolved with `pnpm install`.
- 4 initial test failures (LF-03 SMA, LF-05 Lugano, LF-06 JUN, ST-03 "jung" search) — converted to `SKIP-FIXTURE` after confirming those stations aren't in the metadata or forecast-data fixture files.
- Port-mapping test flakes in full CI on macOS parallel Jest — known issue per user memory, not chased.
- First commit attempt failed with nested HEREDOC bash syntax error (`bad substitution: no closing \`)'`). Retried via `git commit --file=/tmp/commit-msg-qa-regression.txt` per global CLAUDE.md guidance ("always use temp files with `--body-file` / `--file` instead of inline shell quoting").

## Follow-ups (for whoever picks this up)

1. Refine plan in PR #84 → `gh pr ready` → `/plot-approve v230-improvement-plan` to merge and start implementation.
2. Cut 2.3.1 for REC-01 + REC-02 (Option B): daily silent-empty fix + daily schema parity doc block. Flips CD-05, CD-06, CD-derived from `it.skip` to `it()`.
3. Decide REC-05 / REC-09 ownership with PR #82 author before starting `feature/resolver-unification`.
4. Add fixtures in a separate PR to unskip the 12 `SKIP-FIXTURE` tests — Davos, Locarno, SMA daily+yearly minimally.

## Links

- External report artifact: https://claude.ai/public/artifacts/fe91e313-04a2-4fd1-b2f1-b6aa3da9a4d0
- Local saved copy: `/tmp/meteo-v230-external-test-report.md`
- Companion to: [PR #82 `idea/geocoding-workarounds-review`](https://github.com/eins78/meteoswiss-llm-tools/pull/82)
