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

The cleanest, non-confounded evidence: **`point-num`/`range-num`** (exact-value and range-sum
lookups at a specific local hour) score **100% local / 0% UTC in every tier, frontier included**
(opus-4.8/sonnet-5 both 2/2 local, 0/2 UTC). `argmax-time` shows the same direction (0% cheap/
tiny, 50% frontier — still a large drop from 100%). One family, `dst-trap`, is excluded from this
count: it asks for the UTC offset itself, which is definitionally unanswerable from the UTC
variant by design (the local JSON prints it literally; the UTC JSON structurally can't) — its 0%
UTC score is expected, not a comprehension failure, so it's not used as evidence here even though
it points the same direction. Day-level/boolean questions stay ~100% on both variants, every
tier. Uniform-across-tiers-including-frontier on the non-rigged families is this doc's own signal
for "format defect, not capability gap." Local format itself checked clean too: tiny tier's 2
local misses (92.6%, not 100%) are scattered across different models and question families
(a `point-bool` misread, a `range-num` off by 0.1mm) — ordinary noise, not a shared defect.

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
   re-verified live (needs #1 resolved first). **Caveat**: gpt-5.2's specific error ("requested
   up to 65536 tokens") looks more like `max_tokens: 256` not being applied to that endpoint at
   all than a reasoning-budget issue — adding credits will likely make the 402 disappear either
   way, which would look like this fix worked without confirming it. On rerun, check gpt-5.2's
   `tokenUsage.completion` in `generated/results.json` actually stays near 256 rather than just
   checking the call succeeds.

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

**Revised after Max's review.** The first pass (running promptfoo via unpinned `npx
promptfoo@0.121.18`) was correctly flagged as not reproducible — it only pins the top-level
version, not promptfoo's own transitive tree (no integrity hashes, sub-deps resolve fresh each
time). Investigated every pnpm mechanism that could keep it a normal workspace member with a
real lockfile-pinned dependency, installed only on request: `optionalDependencies` (installed by
default on any compatible platform — not opt-in), `--filter` (a per-invocation flag, not
persistent), `shared-workspace-lockfile: false` (confirmed via a pnpm maintainer on GitHub —
all-or-nothing for the *whole* workspace, not settable per-package), `dependenciesMeta` (doesn't
cover this), a `.pnpmfile.cjs` conditional-strip hook (hacky, breaks frozen-lockfile installs).
**None work.** The one approach that gives both real pinning and zero root-install footprint:
this package is now excluded from the root workspace glob and has its own nested
`pnpm-workspace.yaml` (`packages: ["."]`), making it an independent pnpm project with its own
real, integrity-hashed `pnpm-lock.yaml` (`promptfoo` back in `devDependencies`, exact-pinned).
Root `pnpm install` no longer sees this package at all — install it with
`cd packages/meteoswiss-forecast-evals && pnpm install`. Trade-off: no longer covered by
`pnpm -r lint/build/test` at the repo root (verify standalone instead) — acceptable since it was
never in CI regardless. Full investigation + verification: PLAN.md "Q-B (revisited)".

## To resume the full sweep (after Max adds credits + optionally toggles the Mistral setting)

```bash
cd packages/meteoswiss-forecast-evals
pnpm install           # standalone install (this package is no longer a workspace member —
                        # only needed once, or after promptfoo/deps change)
pnpm run eval           # full programmatic sweep — should now complete cleanly for all 13
pnpm run eval:judge     # judge slice
pnpm run summarize      # prints the gate table from generated/results.json
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
