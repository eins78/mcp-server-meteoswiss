# Handoff

Status as of 2026-07-09: **full sweep run, partial-but-clean verdict produced, two PR questions
answered, one blocker needs Max's action before a complete rerun.**

## Headline verdict (see PLAN.md "Full sweep results" for the full breakdown)

**Keep local-time labeling — do not switch PR #99 to UTC.** From 7 of 13 providers that
completed cleanly (all 3 tiers represented, including frontier):

```
tier      variant   accuracy
frontier  local     18/18  100.0%      utc  11/18   61.1%
cheap     local     18/18  100.0%      utc   9/18   50.0%
tiny      local     25/27   92.6%      utc  12/27   44.4%
```

Hour-level questions (exact-time/range lookups, argmax-time, the DST-offset trap) collapse to
~0% under UTC in nearly every tier, **including frontier models** (opus-4.8, sonnet-5 both got
0/2 on point-num and range-num under UTC). Day-level/boolean questions stay ~100% on both
variants, every tier. Uniform-across-tiers-including-frontier is this doc's own signal for "format
defect, not capability gap" — the effect is large and mechanistically exactly what you'd predict
(hour lookups need a UTC→local conversion models don't reliably do; day-level questions don't
need it and aren't affected).

**Cost: ~$0.32 actually spent**, verified via OpenRouter's own `/api/v1/auth/key` and
`/api/v1/credits` endpoints (not promptfoo's internal cost field, which is confirmed non-
functional for OpenRouter — see PLAN.md). Comfortably under the $2-4 target and $10 ceiling.

## Why only 7 of 13 providers, and what's needed to complete it

The sweep hit 61.9% API-error rate (286/462 calls), root-caused to **three independent, unrelated
causes** (systematic-debugging process, not guessed — full detail in PLAN.md "Full sweep
results"):

1. **This OpenRouter account has never purchased credits** (`total_credits: 0`,
   `is_free_tier: true` — confirmed via the account API directly). The `$10` figure on the key is
   a spend *cap*, not a real balance; the account draws against a much smaller free-tier
   allowance that ran dry mid-sweep. Hit 7 providers, always on their later-scheduled calls, never
   on the first (primary-fixture) ones — consistent with "ran out partway through 13 models
   spending concurrently," not a per-request limit.
   **→ Needs Max to add real credits at <https://openrouter.ai/settings/credits> before a
   complete rerun.** Not something this session should do unprompted (billing action).
2. **`mistral-large-2512` / `mistral-medium-3.1`: 100% failure**, unrelated to credits — `404
   "No endpoints available matching your guardrail restrictions and data policy"`.
   **→ Needs Max to toggle a setting at <https://openrouter.ai/settings/privacy>**, or accept
   these two providers stay excluded.
3. **`gpt-5-mini`/`gpt-5-nano`/`gemini-3.1-pro-preview`/`gpt-5.2`: 100% failure**, also unrelated
   to credits exhaustion (failed on their very first call) — these four reject
   `passthrough.reasoning.enabled: false` outright (400) or silently balloon the token budget
   past what the account can afford (gpt-5.2's 402 said "You requested up to 65536 tokens").
   **→ Fixed in this PR**: `promptfooconfig.yaml` now uses
   `passthrough.reasoning.effort: 'minimal'` for these four instead of `enabled: false`. Not yet
   re-verified live (needs #1 resolved first).

The judge slice (`pnpm run eval:judge`) was **not** run — its judge model (`opus-4.8`) already
showed the same credit-exhaustion pattern in the programmatic sweep, so running it now would
mostly fail for the same reason. Rerun after credits are added.

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

**Fixed.** `promptfoo` was never imported as a library — only invoked via already-pinned `npx
promptfoo@0.121.18 ...` in `scripts/run.sh` and the `view` script. Removed the
`"dependencies": { "promptfoo": "^0.121.18" }` entry from `package.json` entirely; regenerated
the root `pnpm-lock.yaml` (confirmed `promptfoo` no longer appears anywhere in it). `optionalDependencies`
and workspace-install exclusion were considered and rejected (both still add it to the lockfile
in some form). Full writeup: PLAN.md "Q-B".

## To resume the full sweep (after Max adds credits + optionally toggles the Mistral setting)

```bash
cd packages/meteoswiss-forecast-evals
pnpm run eval          # full programmatic sweep — should now complete cleanly for all 13
pnpm run eval:judge    # judge slice
pnpm run summarize     # prints the gate table from generated/results.json
```

Cross-check real spend against `curl -s https://openrouter.ai/api/v1/credits -H "Authorization:
Bearer $(security find-generic-password -s OPENROUTER_API_KEY_EVALS -w)"` — promptfoo's own cost
field is confirmed non-functional for OpenRouter.

## Not yet done

- PR #100 has not been merged (explicit constraint — do not merge).
- A complete 13-provider rerun (blocked on Max adding credits; see above). Given the current
  signal's size and cross-tier consistency, unlikely to reverse the verdict, but would firm up
  tiny-tier `n` and add the two Mistral/EU providers.
- Judge slice.
- Acting on the verdict itself (e.g. touching PR #99's schema) — out of scope for this PR, which
  is evals-only and independent of #99.
