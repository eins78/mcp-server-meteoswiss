# Security & functional fix execution (PR #130)

**Date:** 2026-07-12
**Source:** Claude Code (Opus 4.8, autonomous)
**Session:** Reconstructed from 1 compaction · ~90k input / ~40k output tokens

## Summary
Executed the 29-commit FIX PLAN from `docs/reviews/2026-07-11-security-functional-review.md` commit-by-commit on `secreview` (PR #130), running `pnpm run fix && pnpm --filter meteoswiss-mcp run ci` green before each commit. All SEC/FUN/TEST/SKILL/EVAL findings addressed except three low-priority deferrals. Then closed the gap the reviewer flagged: verified the two CI gates that only run on retarget-to-`main`.

## Key Accomplishments
- **Security DoS chain first (priority):** SEC-2 `trust proxy` hop-count, SEC-3 streaming body cap + content-fetch timeout, SEC-1 dead `Promise.race` removed + bounded/parse-once JSDOM, SEC-4/8 redirect re-validation + https/port pin.
- **Remaining hardening (SEC-5/6/7/10/12/13):** disk-cache LRU prune + path sanitize, in-memory HTTP/geocode LRU bounds, CORS `credentials:false`, log-injection sanitization, `tsx`→devDeps, SHA-pinned GitHub Actions.
- **Silently-wrong-data (FUN-1..6):** NBCN resolver anti-junk guards (+ dedup `geocodedNameMatchesQuery`), Europe/Zurich "today" bucketing, ISO-8601 timestamp normalization, pollen fail-loud on total outage, climate date `YYYY-MM-DD` regex, station-forecast date union.
- **Error-handling/cleanup (FUN-7..19):** dead ETag/304 path removed, stop retrying non-retryable 4xx, Zod-validated Solr response, schema `.max()` hardening + `parseNumeric` finiteness, reverse-geo cache-on-success only, STAC fixture fail-fast.
- **Tests/parity/skills/evals:** allowlist/retry/path-safety/timestamp unit tests, search fixture fail-safe + content assertions, parity staleness `exceptions[].skill` check, new `forecast-evals` CI job + EVAL-1 fabrication scan + EVAL-2 walk-hour discriminator, SKILL-1/2/3 (pollen PZH example, script exit-code idiom, side-effect-free `install-skill`).

## Changes Made
- 29 commits `180016a`..`e39285e` on `secreview` (see `.delegate-status.md` for the per-commit map).
- Changesets: `security-hardening.md`, `functional-correctness.md`, `skills-fixes.md`.
- Modified: `.delegate-status.md` (running status + final CI/gate notes).
- Created: unit tests `test/unit/{http-communication,meteoswiss-content-url,ogd-data-store,ogd-timestamp}.test.ts`; `src/support/ogd-timestamp.ts`, `src/support/name-matcher.ts` export.

## Decisions
- **Verified the two retarget-gated CI jobs locally rather than trusting "local ci green":** the `PR CI` workflow is gated to `main`-targeting PRs, so Docker Build Test and the new Forecast Evals job never ran in Actions for #130. Ran a real `docker build` (exit 0) + container `/health` 200 to prove the `tsx`→devDeps move is safe (prod is `node dist/index.js` on `tsc` output, tsx dev-only, correctly excluded by `--production`); ran `pnpm install --frozen-lockfile` + `pnpm test` (40/40) for evals. Parse-checked all three workflow YAMLs.
- **Grouped changesets by theme** (3 files) rather than 25 fragments, for a readable changelog.
- **Flagged three review-only commits** (trust proxy, redirect-follow loop, 503/listener-close) — they compile and don't break existing tests but are unreachable in fixture mode, so they carry no dedicated test; noted for eyeball review.
- **FUN-20 left infeasible:** review said pin `@types/jsdom@^24` but no v24 is published (21.1.x → 27 → 28); the real fix is the blocked jsdom v29 upgrade.
- **FUN-11 deferred / FUN-15 `.refine` not added:** FUN-11 needs a live-STAC check per the review; `.refine` breaks `Schema.shape` tool registration (ZodEffects wrapper) so kept the data-layer guard + documented precedence instead.

## Plan Reference
- Plan: `docs/reviews/2026-07-11-security-functional-review.md` § "FIX PLAN"
- Planned: 29 ordered commits, DoS chain first.
- Executed: all 29 landed (TEST-1 folded into commit 4); FUN-20 infeasible, FUN-11/TEST-6 deferred/partial as noted.

## Next Steps
- [ ] Max reviews & merges #130 (standing policy — agent never merges). Do NOT merge.
- [ ] After #118 merges, retarget #130 to `main` so the gated CI runs; expected green (both gates verified locally).
- [ ] Optional follow-ups: FUN-11 `getLatestItem` ordering (verify live API first); TEST-6 residual disk-cache TTL-refetch case.

## Addendum — 2026-07-12 CI job clarity refinement (post-approval)
Max approved keeping the new `forecast-evals` CI job but asked for two clarity refinements so no
future reader mistakes it for the paid LLM evals:
- **Renamed the CI job** `Forecast Evals Tests` → `Forecast Evals — Scoring Unit Tests (offline,
  no API)` in `.github/workflows/pr-ci.yml`; job id `forecast-evals` kept stable (branch-protection
  matches on id, not display name). Rewrote the inline comment to spell out that `pnpm test` here is
  `node --test src/*.test.ts` (offline, no keys, no cost) and that `pnpm eval`/`smoke`/`eval:judge`
  must never run in CI, pointing at the README.
- **Added a `## CI policy` section** to `packages/meteoswiss-forecast-evals/README.md` — a two-row
  table drawing the boundary (offline `pnpm test` runs in CI as a regression gate; paid LLM evals
  are local-dev-only, need `OPENROUTER_API_KEY`, never in CI). Also tightened the older "Not run in
  CI" line, which was now imprecise (the offline tests _do_ run in CI).
- **Replied on PR #130** (`gh pr comment`) with the rationale: the job runs only offline scoring
  unit tests, previously uncovered by root CI because the package is deliberately not a workspace
  member; linked the new README policy section.
- Verified `pnpm test` green (40/40, no network) before committing. No retarget, no merge.

## Repository State
- Committed: `e39285e` — docs(review): flag retarget-gated CI + review-only commits in status
- Branch: `secreview` (base `worktree-quatico-showcase-docs`, PR #130 OPEN/MERGEABLE), pushed.
- Working tree clean apart from pre-existing node_modules drift (never staged).
