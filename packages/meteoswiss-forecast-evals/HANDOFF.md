# Handoff

Status as of 2026-07-09: **complete 13-provider sweep + judge slice, all clean (0 API errors),
verdict confirmed. All open questions from earlier partial runs are resolved. Follow-up:
multi-series shape + compact-representation evals run and posted to new issue #101. Follow-up:
6 Copilot review comments on PR #100 addressed, gate numbers reconciled at $0.**

## Follow-up: Copilot review fixes (see PLAN.md "Copilot review fixes" for full detail)

GitHub Copilot left 6 review comments on PR #100. All fixed on this branch, not merged:

1. **`extractJson` multi-block recovery** (score-affecting) — a reasoning-leaking model's earlier
   brace could span the parse and swallow a real trailing answer object. Fixed with a
   balanced-brace scanner (last block first). Reconciled the 3 affected rows (all `gpt-5.2`) via
   a new `summarize.ts --rescore` mode that re-grades every row from its raw stored response with
   the fixed scorer, at **$0** — no re-run. Frontier UTC (primary) moves 25/45→26/45 (55.6%→57.8%);
   `point-num` UTC moves 0%→8% (1/13). **Verdict unchanged**; tiny-tier gate untouched (no
   `gpt-5.2` there); the multi-series Shape A/B and compact-representation numbers above are from
   separate 5-provider runs with no `gpt-5.2` and are unaffected.
2. **`unavailable` hallucination check** and **3. `coerceHour` ISO-timestamp safety** — both
   provably score-neutral (verified against every real response on disk: 0 rows flip either way).
3. **Fail-fast on missing ground truth** in `questions.ts` (`dst-offset`/`availability-day2` no
   longer silently default) — score-neutral, confirmed via a byte-identical `generated/tests.json`
   before/after.
4. **Root `pnpm-lock.yaml`** — reverted unrelated `@swc/core` churn from when the eval package was
   briefly a workspace member.
5. **PR #100 description** — was stale (said the full paid sweep hadn't run); reconciled via
   `gh pr edit` to match the README/PLAN verdict.

## Follow-up: multi-series Shape A/B + compact representation (see PLAN.md for full detail)

Max was happy with the local-vs-UTC verdict and asked for two things ahead of a new GitHub issue
covering the full multi-series expansion (sunshine, wind, temperature hourly series):

1. **Created issue [#101](https://github.com/eins78/meteoswiss-llm-tools/issues/101)** —
   "Implement all hourly time series in getLocalForecast" — references #98/#99/#100, folds in
   #98's station-hourly-precipitation follow-up, and structures the work so evals run BEFORE
   implementation (step 1, already done — see the issue comment).
2. **Made the multi-series Shape A vs B eval more rigorous**: expanded from 5 to 11 questions,
   ran across 5 representative providers (110 calls, 0 errors). **Shape B (unified per-hour
   objects) wins on balance: 84% vs 76%** (46/55 vs 42/55), with the advantage concentrated in
   cross-parameter questions (`ms-compound-argmax`: 1/5→3/5, small n) and no advantage on
   single-parameter lookups — the pattern you'd expect if Shape A's cost is index/timestamp
   alignment across separate arrays. Not unanimous, though: the two tiny-tier models split
   (`gemini-2.5-flash-lite` +3 for B, `gpt-5-nano` -1 for B) — net favors B, but call it
   "B, with consistent theory support," not "conclusively B."
3. **Tested whether a compact/sparse 7-day representation rescues tiny-tier comprehension**
   (the full sweep found ~50% tiny-tier accuracy there). Honest finding after fixing a sample-
   size confound (expanded 2→5 questions, ran both representations apples-to-apples): only a
   **marginal improvement (75%→80% tiny-tier)**, not a rescue — the dominant failure (a 4-hour
   range-sum) persists almost identically on both representations. The original ~50% was mostly
   an artifact of a thin 2-question sample, not broad long-series collapse.
4. **Confirmed the `gemini-3.1-pro-preview` max_tokens fix works**: gave it its own config
   (`max_tokens: 1024`) after tracing its full-sweep truncation issue to a token-budget
   artifact, not comprehension — 100%/100% on both shapes in this run, 0 truncations.
5. Posted the full results as a comment on #101. **Actual spend: ~$0.51** (account usage
   $1.4514 → $1.9574), well under the $1-2 target.

## Headline verdict (see PLAN.md "Full sweep results, complete" for the full breakdown)

**Keep local-time labeling — do not switch PR #99 to UTC.** Confirmed by the complete run across
all 13 configured providers (462 scheduled calls, 0 API errors):

```
tier      variant   accuracy
frontier  local     42/45   93.3%      utc  26/45   57.8%
cheap     local     36/36  100.0%      utc  19/36   52.8%
tiny      local     31/36   86.1%      utc  16/36   44.4%
```

(Frontier UTC corrected from 25/45 to 26/45 after a Copilot-review scorer fix rescued one
`gpt-5.2` row — see "Follow-up: Copilot review fixes" below. Zero-spend offline re-score, no new
API calls; doesn't change the verdict.)

The cleanest, non-confounded evidence: **`point-num`/`range-num`** (exact-value and range-sum
lookups at a specific local hour) score **100% local / ~0% UTC in every tier** (`point-num` UTC is
8%, i.e. 1/13 — one `gpt-5.2` row correctly converted; `range-num` UTC stays a flat 0%), across the
full 13-provider, n=13-per-cell sample (previously a 7-provider partial sample — now complete).
`argmax-time` collapses the same way (100% → 15%). `dst-trap` is excluded from this count as
before: it asks for the UTC offset itself, definitionally unanswerable from the UTC variant by
design. New nuance visible only with the full sample: `argmax-day` and `range-bool` show **no
gap at all** (92%/92%, 100%/100%) — day-level and coarse yes/no-across-a-range questions don't
require pinning a specific hour, so they're insensitive to the labeling choice. The comprehension
gap is specifically about hour-precision lookups, not the format being confusing in general.

**Every one of the 13 real models scores higher on local than UTC, no exceptions** — including
both previously-blocked Mistral models, which track their tier peers closely and show no
format-specific anomaly. One apparent outlier, `gemini-3.1-pro-preview` (67% local, lower than
its frontier peers), traces to a token-budget truncation artifact (its `reasoning.effort:
'minimal'` config still leaks some reasoning tokens as visible `"Thinking: ..."` text that eats
into `max_tokens: 256`, truncating the JSON answer mid-response) — not a comprehension failure.
Full trace in PLAN.md.

**Judge slice: 12/12 passed (100%)**, 0 errors — open-ended, Opus-judged prompts confirm the
local-time format supports genuinely useful, non-hallucinating, timing-aware answers, not just
correct programmatic lookups.

**Cost: ~$0.95 actually spent on this rerun** (eval sweep + judge slice), verified via
OpenRouter's own `/api/v1/auth/key` and `/api/v1/credits` endpoints (account usage
$0.335 → $1.289; promptfoo's own cost field is confirmed non-functional for OpenRouter — see
PLAN.md). Comfortably under the $2-4 target and $10 ceiling.

## Both blockers from the previous partial run are now resolved

1. **OpenRouter credits added by Max** — the account is no longer `is_free_tier`. All 13
   providers completed with 0 API errors this run (previously 61.9% error rate from free-tier
   exhaustion).
2. **ZDR/data-policy setting disabled by Max** — both `mistral-large-2512` and
   `mistral-medium-3.1` completed all 33 calls each this run (previously 100% failure with
   `404 "No endpoints available matching your guardrail restrictions"`).
3. **The `passthrough.reasoning.effort: 'minimal'` fix (already shipped in this PR) works** for
   all four previously-rejecting models (`gpt-5-mini`, `gpt-5-nano`, `gemini-3.1-pro-preview`,
   `gpt-5.2`) — no more 400/402s. One residual nuance: `gemini-3.1-pro-preview` still leaks a
   little visible reasoning text into its completions, occasionally truncating the JSON answer
   under the tight `max_tokens: 256` budget — see PLAN.md for the full trace. Doesn't change the
   verdict; flagged as a possible follow-up (raise `max_tokens` for this one provider) rather
   than fixed here, since it doesn't block the gate decision.

## PR Question A — why `.mjs`/`.cjs` instead of TS?

**Fixed, not just explained.** `scorer.cjs`/`scoring-core.mjs`/`synth-7day-fixture.mjs` are now
plain `.ts` files, no build step. Root cause: promptfoo's docs recommend pre-transpiling
TypeScript assertion files, but that's a recommendation, not a requirement — verified empirically
(a throwaway `.ts` scorer against promptfoo's free `echo` provider worked immediately). promptfoo
just does a dynamic `import()` on the given `file://` path; this repo's pinned Node 24.18 already
resolves `.ts` imports via Node's own native type-stripping (default since Node 23.6, for
"erasable" syntax — which is all this repo ever writes, since TS enums are already banned here).
Full writeup: PLAN.md "Q-A".

## PR Question B — promptfoo dependency bloat on `pnpm install`

**Revised after Max's review, then hardened once more.** The first pass (running promptfoo via
unpinned `npx promptfoo@0.121.18`) was correctly flagged as not reproducible — it only pins the
top-level version, not promptfoo's own transitive tree. Investigated every pnpm mechanism that
could keep it a normal workspace member with a real lockfile-pinned dependency, installed only on
request: `optionalDependencies`, `--filter`, `shared-workspace-lockfile: false` (confirmed
all-or-nothing for the whole workspace via a pnpm maintainer on GitHub), `dependenciesMeta`, a
`.pnpmfile.cjs` hook. **None work.** The fix: this package is excluded from the root workspace
glob and has its own nested `pnpm-workspace.yaml` (`packages: ["."]`), making it an independent
pnpm project with its own real, integrity-hashed `pnpm-lock.yaml`. Root `pnpm install` no longer
sees this package at all — install it with `cd packages/meteoswiss-forecast-evals && pnpm
install`.

**Follow-up fix**: the nested workspace's first standalone install silently skipped promptfoo's
native build scripts (esbuild, sharp, onnxruntime-node, @swc/core, protobufjs,
@playwright/browser-chromium) — pnpm blocks unapproved build scripts by default, and `npx` (the
previous mechanism, with no such gating) had run them unconditionally for every prior sweep.
Fixed by adding an `onlyBuiltDependencies` allowlist to the nested `pnpm-workspace.yaml`, scoped
to this package only. Verified the full paid rerun above completed cleanly with this fix in
place.

Trade-off, unchanged: no longer covered by `pnpm -r lint/build/test` at the repo root (verified
standalone instead) — acceptable since this suite was never wired into CI. Full investigation +
verification: PLAN.md "Q-B (revisited)".

## Rerunning this suite

```bash
cd packages/meteoswiss-forecast-evals
pnpm install            # standalone install (this package is not a workspace member) — only
                         # needed once, or after promptfoo/deps change
cp .env.example .env    # then fill in OPENROUTER_API_KEY (get one at https://openrouter.ai/keys)
pnpm run eval            # full programmatic sweep, all 13 providers
pnpm run eval:judge      # judge slice
pnpm run summarize       # prints the gate table from generated/results.json
```

Cross-check real spend against `curl -s https://openrouter.ai/api/v1/credits -H "Authorization:
Bearer $OPENROUTER_API_KEY"` — promptfoo's own cost field is confirmed non-functional for
OpenRouter.

## Not yet done

- PR #100 has not been merged (explicit constraint — do not merge).
- Acting on the verdict itself (e.g. touching PR #99's schema, or implementing #101) — out of
  scope for this PR, which is evals-only.
- `gemini-3.1-pro-preview`'s `max_tokens` fix is DONE (was "optional, not blocking" — now
  implemented and confirmed working, see above).
- #101's Step 2+ (confirming actual OGD param codes for hourly sunshine/wind, station-hourly
  precip, schema/implementation) — not started, deliberately: #101 is structured so evals come
  first (done) and implementation is a separate, later effort.
- The 6 Copilot review comments on PR #100 are DONE — fixed, tested, gate numbers reconciled via
  a zero-spend offline re-score, PR description reconciled, root lockfile reverted. See
  "Follow-up: Copilot review fixes" above.
