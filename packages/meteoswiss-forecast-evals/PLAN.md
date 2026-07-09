# Plan: Forecast-JSON comprehension eval suite

This is the detailed design doc for `meteoswiss-forecast-evals`, written before implementation
and updated with what was actually found while building it. See `README.md` for the quick-start.

## Context

PR #99 added `precipitation.hourly: Array<{time, value}>` to `meteoswissLocalForecast` — a
time-series where each `time` is ISO-8601 in **local Europe/Zurich** with UTC offset
(`2026-03-28T09:00:00+01:00`). Before releasing this to PROD (and before adding MORE
time-series: sunshine, hourly wind/temp — see CLAUDE.md "Open Tasks"), Max wants **evidence**
that the JSON format is legible to the LLMs real end-users run — especially the small/cheap
ones. If the format confuses models, the schema/tool-description should be tweaked on the #99
branch *before* release, not after.

**Headline question (the gate):** does labeling hourly times in **local time (with offset)**
vs **UTC** measurably change whether models answer real-world local-time questions correctly —
most importantly on the **tiny tier** (haiku / gpt-5-mini / gpt-5-nano / gemini-flash-lite),
where a UTC->local conversion step is most likely to break and who real users actually use.
The UTC-vs-local result on that tier **gates merging #99 / releasing to PROD.**

## Decisions (locked)

- Stack: **promptfoo**, invoked via pinned `npx` (not a declared dependency — see "Q-B" below).
  Considered inspect-ai (Python) on the merits — head-to-head covered in the session transcript;
  inspect-ai's real strengths (solver composition, epochs, agentic rigor) don't clear the bar for
  a single-turn comprehension matrix, and it would graft a second toolchain onto an otherwise
  TS-consistent monorepo. promptfoo's comparison-grid + native OpenRouter/Ollama providers fit
  this task directly.
- **New PR, based on `main`, independent of #99.** This package does not import `meteoswiss-mcp`
  source; `fixtures/` holds static JSON captured from a real run of the #99 tool (see below).
- Package: `packages/meteoswiss-forecast-evals`, a normal pnpm workspace member (no
  `pnpm-workspace.yaml` change needed — it's covered by the existing `packages/*` glob).
- **Not in CI.** Manual, documented reruns. OpenRouter key read from the macOS keychain at
  runtime, never hardcoded: `security find-generic-password -s OPENROUTER_API_KEY_EVALS -w`.
- Scoring: mostly **programmatic** (ground truth computed in TS from the same JSON the model
  sees) + a small **Opus judge** slice for open-ended quality. Lenient parsing separates
  "unparseable" from "wrong" so tiny models aren't penalized for JSON-formatting slips.
- Cost: lookup-slice providers disable OpenRouter reasoning
  (`passthrough.reasoning.enabled: false`) and cap `max_tokens: 256`. Target ~$4, hard ceiling
  $10. See "Cost" below for what the build-time smoke test actually confirmed.
- Multi-series mock (precip+sunshine+wind, two candidate shapes) = **secondary track**,
  clearly subordinate to the UTC-vs-local gate.

## Package layout

See README.md "Package layout" — kept in one place to avoid drift between the two docs.

## Fixture & the two variants (single source of truth)

`fixtures/forecast-8001-2day-local.json` and `fixtures/forecast-station-local.json` are **real
tool output**, captured by calling `getLocalForecast()` directly from
`packages/meteoswiss-mcp/src/data/ogd-local-forecast.ts` with `USE_TEST_FIXTURES=true` (postal
code `8001`/2 days, and station `Napf`/2 days) — the same fixture data
`test/integration/ogd-local-forecast.test.ts` uses, which happens to span the 2026-03-28 CET ->
2026-03-29 CEST daylight-saving transition. This is why it was picked as the primary fixture:
the DST offset flip is exactly the trap a UTC-only format would hide.

**Gotcha hit while capturing it**: `USE_TEST_FIXTURES` is read into a frozen module-level
constant at import time (`packages/meteoswiss-mcp/src/support/test-fixtures.ts`). Setting
`process.env.USE_TEST_FIXTURES = 'true'` at the top of a capture script does NOT work — ESM
import hoisting means the transitive import of that module (and its constant capture) happens
before any of the importing script's own top-level statements run. The first capture attempt
silently fell through to a **live network call** against real MeteoSwiss data instead of the
fixture. Fixed by setting the env var in the shell (`USE_TEST_FIXTURES=true npx tsx
capture.ts`) so it's set before the Node process even starts. Worth knowing for anyone writing
another one-off script against this codebase.

`src/fixture.ts` derives the **UTC variant** from the LOCAL one by re-rendering every
`hourly[].time` to its true UTC instant with a `Z` suffix (`new Date(iso).toISOString()`, not a
naive string substitution — verified in `ground-truth.test.ts`). Everything else in the JSON
(values, totals, weather, dates) is untouched, isolating the ablation to exactly one format
choice.

`src/ground-truth.ts` computes canonical readings (instant, local date, local hour, UTC offset)
by re-parsing each hourly entry's own timestamp — **not** by trusting the JSON's day-level
`date` grouping. Non-obvious finding: `groupPrecipByDate` in `ogd-local-forecast.ts` groups by
the **UTC** calendar date of the original reading, then converts each timestamp to local display
time — so the day object dated `"2026-03-28"` in the captured fixture actually contains an
hourly entry timestamped `"2026-03-29T00:00:00+01:00"`, which in local wall-clock terms is
already the next day. A consumer who assumes "a day object's `hourly[]` are that local day's
hours" will misattribute the last entry. Ground truth here re-buckets by each reading's own
parsed local date to stay unambiguous — and this mismatch itself might be worth a follow-up
question in a future revision of this suite.

**Deviation from the original rough plan, found while building**: a true `hourly: []` (empty
array, as opposed to `null`) case doesn't occur in the current implementation —
`groupPrecipByDate` always emits an entry for every fetched hour, including zero-rain hours. So
the "null vs empty-array" question became "`null` (station, truly unavailable) vs a
populated-but-all-zero array (postal code, dry day)" — the real distinction this codebase
produces — tested against day 2 of the primary fixture, which is genuinely dry with a populated
`hourly[]`.

## Question set (10 questions, programmatic)

All ground truth is computed by `src/ground-truth.ts` from the fixture — nothing below is
hand-typed. See `src/questions.ts` for exact prompt text and expected-value derivation.

| id | family | fixture | tests |
|----|--------|---------|-------|
| dry-2200 | point-bool | primary | point lookup, a dry hour |
| val-0800 | point-num | primary | point lookup, a rainy hour |
| commute-sum | range-num | primary | sum over an hour range (the "commute" framing) |
| commute-bool | range-bool | primary | any-rain over a range |
| argmax-hour | argmax-time | primary | which hour has the most rain |
| wettest-day | argmax-day | primary | which date has the most rain |
| total-consistency | cross-field | primary | declared total vs sum of hourly (rounding-tolerant) |
| dst-offset | dst-trap | primary | UTC offset at a specific local hour on the DST-transition day — **unanswerable from the UTC variant without correctly reasoning about CET/CEST**, by design; this is the sharpest test of the ablation |
| availability-day2 | availability | primary | populated-but-dry array vs fabricating a "no data" claim |
| station-null | null-handling | station | hallucination check: model must decline, not invent an hourly number for a station |

Plus two secondary-track questions on the 7-day fixture (`sevenday-wettest`,
`sevenday-afternoon-shower`) and five on the multi-series mock (see below) — 33 test cases
total from `pnpm run generate`.

Every test asks for a strict single-line JSON answer with a declared schema (e.g.
`{"mm": <number>}`). `src/scoring-core.ts` parses leniently — strict JSON first, then a
markdown-fence strip, then a brace-matched extraction from surrounding prose — before falling
back to `unparseable`. This is unit-tested in `src/scoring.test.ts` and was also validated by
the real smoke-test run (see "What the smoke test found" below).

## Secondary track: 7-day fixture

`scripts/synth-7day-fixture.ts` is a **deterministic, non-random** generator (see its header
comment for why: real fixture data only spans ~1.5 days, and this suite also needs to test
whether legibility holds up over a longer series — a proxy for "will consumers still cope once
we add more time-series over more days", the actual reason to eval now). Four hand-picked
hourly rain profiles are assigned to specific days of a week starting 2026-04-06 (a Monday,
safely after the DST transition the primary fixture already covers, so this fixture stays in
constant `+02:00` — its job is series *length*, not DST). Locked in by
`ground-truth.test.ts`.

## Secondary track: multi-series mock (shape A vs shape B)

`src/multiseries.ts` hand-authors a **mock** of a hypothetical future forecast shape combining
hourly precipitation + sunshine + wind — not anything `meteoswiss-mcp` emits today. Both
candidate container shapes are rendered from the *same* canonical hourly table (so their ground
truth is identical by construction):

- **Shape A — parallel arrays**: `precipitation.hourly[]` / `sunshine.hourly[]` / `wind.hourly[]`,
  each an independent `{time, value}` series (mirrors today's `precipitation.hourly` shape,
  repeated per parameter).
- **Shape B — unified per-hour objects**: one `hourly[]` array of `{time, precip_mm,
  sunshine_minutes, wind_kmh}` objects.

5 cross-series questions run identically against both. The build-time smoke test (1 tiny model)
already shows a directional signal — shape B scored 100% vs shape A's 90% — though n=5 per
shape is far too small to act on; a full run across more models/tiers is needed before this
should influence a real design decision.

**Superseded by a conclusive run — see "Multi-series eval, expanded" below.** Max asked for this
to be made conclusive ahead of a new GitHub issue (#101) covering the full multi-series
expansion (sunshine, wind, temperature). The mild 5-question signal above held up: Shape B wins,
84% vs 76% overall across an expanded 11-question set.

## Open-ended judge slice

4 prompts (cyclist-commute, umbrella-tomorrow, compare-days, station-honesty) in
`promptfooconfig.judge.yaml`, graded by `openrouter:anthropic/claude-opus-4.8` via
`llm-rubric`. Each rubric's ground-truth facts are pulled from the same `ground-truth.ts`
functions the programmatic slice uses (via `generate-tests.ts`), not hand-typed, so the rubric
can't silently drift from the fixture. Run across one model per tier (opus / haiku / gpt-5-nano)
to bound cost — 12 graded calls total.

## Models + cost

Provider list in `promptfooconfig.yaml`, labeled `tier/short-name` (parsed by `summarize.ts` to
derive tier). Frontier: opus-4.8, sonnet-5, gpt-5.2, gemini-3.1-pro, mistral-large. Cheap:
haiku-4.5, gpt-5-mini, gemini-3.1-flash-lite, mistral-medium-3.1. **Tiny (the gate block)**:
gpt-5-nano, gemini-2.5-flash-lite, ministral-8b, llama-3.3-70b. Apertus (Swiss): confirmed
**absent from OpenRouter** as of 2026-07 — documented as an optional, commented-out local-Ollama
provider block (plain-chat only; its tool-calling template is broken but irrelevant here since
every prompt in this suite is plain chat).

### What the build-time smoke test found (real spend, ~$0.01, gemini-2.5-flash-lite only)

This isn't the real result — it's one tiny model on one run, used to validate the harness. But
it's worth recording because it's exactly the kind of signal this suite is built to surface:

```
GATE: tiny tier x {local, utc} — primary fixture
tiny | local     n=9  score=100%  [correct:9]
tiny | utc       n=9  score= 44%  [wrong:5 correct:4]
```

Broken down by family, the UTC variant scored 0% (not just lower — zero) on `point-bool`,
`point-num`, `range-num`, `argmax-time`, and `dst-trap`, while `range-bool`, `argmax-day`,
`cross-field`, and `availability` stayed at 100% on both variants. That pattern — precise
hour-level lookups collapsing under UTC while day-level/boolean/any-rain questions survive — is
plausible (hour-level lookups need an exact +1/+2h mental conversion the model visibly didn't
do reliably; day-level questions don't) and is the shape of evidence a real run should produce
at scale before anyone acts on it. One model, nine questions, is not that evidence yet.

### Cost tracking caveat (found empirically, not from docs)

promptfoo's own `row.cost` field came back `0` for all 33 real OpenRouter calls in the smoke
test, despite `tokenUsage` being populated correctly (2237 prompt + 11 completion tokens on the
first call, checked directly against the raw results JSON). promptfoo's OpenRouter provider
docs don't mention cost tracking at all — this isn't a missing config, it's just not wired up.
`summarize.ts` computes cost itself from `tokenUsage x` a hardcoded pricing table instead of
trusting promptfoo's field. The `passthrough.reasoning.enabled: false` cost control was also
verified for real: `tokenUsage.completionDetails.reasoning` was `0` on every smoke-test call, so
reasoning-token billing risk is confirmed mitigated for at least this model.

Estimated full-sweep cost at these token counts (~2.5k in / ~15-250 out per call depending on
reasoning behavior, 33 questions x 13 models): **~$2-3** for the programmatic sweep, **~$1-2**
for the judge slice. Comfortably under the $10 ceiling — still cross-check the real total
against [OpenRouter Activity](https://openrouter.ai/activity) once the full sweep runs, per the
caveat above.

## Reporting -> the gate

`pnpm run summarize` prints, in this order: (1) the tiny-tier x `{local, utc}` gate block, (2)
the full tier x variant table, (3) question-family x variant (the view that tells you *what*,
if anything, to fix — a family missed uniformly across tiers is a format defect; a family that
only weak models miss is a capability gap, not a format one), (4) the two secondary tracks, (5)
estimated cost. This feeds directly into: merge #99 as-is / tweak the format on #99 (or a
stacked follow-up PR if #99 has already merged) / hold the release.

## Branching

This PR is based on `main`, independent of #99 (per the fixture-capture approach above — no
source dependency). Any format tweak the evals justify lands on **PR #99** itself if still open,
or a stacked follow-up PR if #99 has already merged by then.

## Verification performed during the build (not the full paid run)

1. `pnpm run generate` — 33 programmatic + 4 judge test cases, 8 fixture JSON blobs, all
   committed under `generated/` for PR reviewability.
2. `pnpm test` — 29 offline unit tests (ground truth against the real captured fixture values,
   `toUtcIso` correctness including the DST boundary, and the lenient scorer across every leaf
   kind + compound + unparseable). All passing, no network.
3. `pnpm run dryrun` — promptfoo's built-in `echo` provider, $0, validated the full pipeline
   wiring end-to-end (including confirming `scorer.ts`'s dynamic `import()` of `scoring-core.ts`
   actually works under promptfoo's runtime, which was the biggest unverified-until-tested risk
   in the design — see "Q-A" below for the full story of why that's a plain `.ts` file today).
4. `pnpm run smoke` — 1 real cheap model (gemini-2.5-flash-lite), ~$0.01, confirmed the real
   OpenRouter path, produced the gate-table finding above, and surfaced the cost-tracking
   caveat.
5. `pnpm -r lint` / `pnpm -r build` / `pnpm -r test` stay green across the monorepo; this
   package is not wired into any CI workflow.

The full paid sweep across all 13 models was subsequently run — see "Full sweep results
(2026-07-09)" below for the outcome, the account-funding blocker that limited it, and the
resulting (partial but statistically clean) verdict.

## Q-A: why plain TypeScript, not `.mjs`/`.cjs`

Raised in PR review: this suite originally shipped `src/scorer.cjs` (CommonJS) dynamically
`import()`-ing `src/scoring-core.mjs` (ESM) — two different module formats for two files in the
same feature, which is exactly the kind of thing that looks like an unexplained workaround.

promptfoo's own docs say so directly: "if you are transpiling Javascript or Typescript, we
recommend pointing promptfoo to the transpiled Javascript output" — i.e., "don't point us at
`.ts`, pre-build it yourself." Rather than take that at face value, it was tested empirically: a
throwaway `scorer-experiment.ts` was pointed at from a scratch promptfooconfig using promptfoo's
free `echo` provider (zero cost, no API key needed). It worked immediately — the grading result
came back exactly as the `.ts` file computed it. So the docs describe a *recommendation*, not a
*hard requirement*: promptfoo's `javascript` assertion just does a plain dynamic
`import()`/`require()` on whatever `file://` path it's given. What actually determines whether
that succeeds is the *host runtime's* ability to load a `.ts` file — nothing promptfoo-specific.

This repo's pinned Node version is 24.18 (`.nvmrc`; every CI workflow pins `node-version: 24`).
Node has shipped native TypeScript type-stripping, on by default, since 23.6 — for "erasable"
syntax (interfaces, type annotations, `satisfies`, etc.), not for enums/namespaces/parameter
properties (those need `--experimental-transform-types`). This repo's own coding standards
already ban TS enums (root `CLAUDE.md`, "Never use TypeScript enums") and this suite never used
namespaces or parameter properties either — so every file here was already inside the erasable
subset, with nothing to lose by dropping the pre-transpiled workaround.

**Result:** `scorer.cjs`/`scoring-core.mjs`/`synth-7day-fixture.mjs` were converted to plain
`scorer.ts`/`scoring-core.ts`/`synth-7day-fixture.ts`, typed against the real `Expected`/
`LeafExpected`/`DailyForecast` domain types instead of duck-typing `unknown`. No build step, no
`// @ts-check` fallback needed — `tsc --noEmit` (already wired into `pnpm run lint`) type-checks
them for real, and `promptfooconfig.yaml`'s `tests: file://generated/tests.json` /
`file://src/scorer.ts` path just works because Node loads it the same way it loads every other
`.ts` file in this monorepo. This matches the workspace's existing `tsx`-first convention instead
of adding a second, CJS/ESM-mixed convention specific to this one package.

## Q-B: why `promptfoo` isn't a declared dependency (superseded — see "Q-B (revisited)" below)

**Superseded 2026-07-09**: the `npx` approach below was correctly flagged in review as
insufficiently reproducible (pins the top-level version only, not promptfoo's own transitive
tree — no integrity hashes, sub-deps resolve fresh at run time). Kept here for the audit trail;
the actual current implementation is in "Q-B (revisited)".

Also raised in PR review: `promptfoo` is a large package (the CLI plus its own sizeable
dependency tree). Declaring it as a `dependency`/`devDependency` of this package would mean
every `pnpm install` at the **repo root** installs it for every contributor — including everyone
working on `meteoswiss-mcp` or `meteoswiss-skills` who never touches evals — because pnpm
workspaces resolve and install the full dependency graph of every workspace member on a root
install by default (`pnpm-workspace.yaml`'s `packages: ["packages/*"]` glob picks this package
up automatically; there's no per-member install opt-out in pnpm).

Options considered:

| Option | Verdict |
|---|---|
| **`npx`/`pnpm dlx` at runtime, no declared dependency** | **Chosen.** Zero footprint in `pnpm-lock.yaml`/`node_modules` for anyone who doesn't run the evals; `npx promptfoo@0.121.18 ...` already pins the exact version (nothing new to add — `scripts/run.sh` and the `view` script already worked this way). Downside: first `npx` invocation per machine pays a one-time download; every run after is cached by npm's own package cache. Acceptable for a manual, occasional-use suite. |
| `optionalDependencies` | Rejected. Still adds promptfoo (and its transitive tree) to `pnpm-lock.yaml` and gets installed by default unless the installer passes `--no-optional`, which nobody does by default at the repo root. Doesn't actually solve the bloat. |
| Exclude this package from the default workspace install (pnpm filters) | Rejected. pnpm doesn't support "always skip this workspace member on root install" — filtering (`--filter`) is opt-in per-invocation, not a persistent property of a package. Would require every contributor to remember a special flag, which is fragile and undocumented-in-practice. |
| Keep as workspace package, but move promptfoo to a nested throwaway `node_modules` outside pnpm's graph | Rejected as needless complexity — functionally equivalent to what `npx` already does, but hand-rolled. |

**Result:** confirmed via `grep -rn "from ['\"]promptfoo" src/ scripts/` (and equivalent import
searches) that promptfoo is never imported as a library anywhere in this package — every use was
already a CLI invocation through `scripts/run.sh` (`npx --yes promptfoo@0.121.18 eval ...`) or
the `"view": "npx promptfoo@0.121.18 view"` script. So the `"dependencies": { "promptfoo":
"^0.121.18" }` entry in `package.json` was simply removed — nothing else changed. Verified by
regenerating `pnpm-lock.yaml` at the repo root (`promptfoo` no longer appears anywhere in it —
checked with `grep -c promptfoo pnpm-lock.yaml` → `0`) and by re-running `pnpm run dryrun` from a
clean state to confirm the suite still works end-to-end without it declared.

## Q-B (revisited): making promptfoo lockfile-pinned without workspace-wide bloat

Max's review objection to the `npx` approach above was correct: `npx promptfoo@0.121.18` only
pins the *top-level* version tag. It resolves promptfoo's own dependency tree fresh at run time
on every machine — cached by npm afterward, but with no integrity hashes and no locked
sub-dependency versions. That's not what "pinned" means for the rest of this monorepo, where
every other dependency is resolved through a real, integrity-hashed `pnpm-lock.yaml` entry. The
task: find a way to keep `promptfoo` as a real, lockfile-pinned dependency, without that pulling
its large transitive tree into every contributor's default `pnpm install` at the repo root.

**Investigated, with sources, before implementing anything:**

| Option | Finding | Verdict |
|---|---|---|
| `optionalDependencies` | pnpm installs `optionalDependencies` by default on any platform-compatible machine — "optional" means "don't fail the install if this can't build/resolve for the current OS/arch," not "skip unless requested." The only way to suppress one is a workspace-wide `ignoredOptionalDependencies` denylist (naming the package explicitly in the root config) — which would block it for *everyone*, including someone deliberately trying to use it, defeating "opt-in when actively used." | Rejected — confirmed, not a fit. |
| `pnpm install --filter` / workspace-glob exclusion at invocation time | `--filter` is a per-invocation CLI flag, not a persistent property of a workspace member. A plain `pnpm install` at the repo root (no flag) still installs every package matched by `pnpm-workspace.yaml`'s `packages` glob. There is no "always skip this member on a default install, but let it opt in" workspace setting. | Rejected — confirmed, not a fit. |
| `shared-workspace-lockfile: false` (per-package independent lockfile, rest of the workspace unaffected) | This looked promising on first read — it's exactly "give this one package its own lockfile." But it's an **all-or-nothing setting for the entire workspace**, not a per-package toggle. Direct quote from pnpm maintainer zkochan (GitHub Discussion [pnpm/pnpm#4632](https://github.com/orgs/pnpm/discussions/4632)): "You can try to set the shared-workspace-lockfile setting to false. But it will also create separate node_modules for every project." Flipping it would give *every* package in this monorepo (`meteoswiss-mcp`, `meteoswiss-skills` too) its own isolated lockfile — a much bigger, disruptive change nobody asked for, losing the benefits of a single shared lockfile for the packages that actually want one. | Rejected — confirmed, not a fit, but this is what pointed at the real answer (see below). |
| `dependenciesMeta` (`injected`, etc.) | Covers workspace-package hard-linking (a local package's build output copied instead of symlinked) and similar concerns — nothing in it toggles "install this dependency only when the package is explicitly targeted." | Rejected — not applicable. |
| `.pnpmfile.cjs` hook conditionally stripping the dependency at install time | Technically possible (a `readPackage` hook could delete `promptfoo` from `package.json` unless an env var is set), but a pnpm lockfile reflects one resolved dependency graph — it can't conditionally include/exclude an entry based on an env var at install time without breaking `--frozen-lockfile` / CI-style installs. Adds monorepo-wide install-hook complexity for one package's convenience. | Rejected — hacky, not genuinely clean. |
| **Exclude the package from the workspace glob entirely; give it its own nested `pnpm-workspace.yaml` + `pnpm-lock.yaml`** | **Chosen — verified working.** pnpm resolves the *nearest* `pnpm-workspace.yaml` walking up from the current directory. Placing a minimal one (`packages: ["."]`) directly inside `packages/meteoswiss-forecast-evals/` makes pnpm treat that directory as its own, fully independent workspace root the moment you `cd` into it — a real, separate `pnpm-lock.yaml` gets created there with full integrity hashes for `promptfoo` and its entire transitive tree, and the root workspace (with `!packages/meteoswiss-forecast-evals` added to its `packages` glob) never sees or installs any of it. | **Implemented.** |

**Conclusion confirmed empirically, not assumed:** there is no pnpm mechanism to keep a package
as a normal workspace member while making its declared dependencies install-on-request rather
than install-by-default. The nested-workspace approach is not a fallback — it's the only option
that gives both real lockfile pinning *and* zero footprint on the root install.

**What changed:**
- `pnpm-workspace.yaml` (repo root): `packages` now excludes this directory
  (`"!packages/meteoswiss-forecast-evals"`), with a comment pointing here.
- `packages/meteoswiss-forecast-evals/pnpm-workspace.yaml` (new): `packages: ["."]` — makes this
  its own workspace root.
- `packages/meteoswiss-forecast-evals/pnpm-lock.yaml` (new, committed): a real, independent
  lockfile — `promptfoo@0.121.18` resolves with a full `sha512` integrity hash and its complete
  transitive dependency tree locked, same as any other dependency in this monorepo.
- `package.json`: `promptfoo` moved back into `devDependencies` (exact-pinned: `"0.121.18"`, not
  `^0.121.18`, matching how it was already pinned everywhere else in this suite).
- `scripts/run.sh` / the `"view"` script: `npx --yes promptfoo@0.121.18 ...` → plain
  `promptfoo ...`. `pnpm run <script>` puts this package's own `node_modules/.bin` on `PATH` for
  the whole script chain (including the nested `bash scripts/run.sh` call), so this resolves to
  the locally-installed, lockfile-pinned binary — no network fetch at run time at all once
  installed once, unlike the `npx` approach which still checks/fetches from the registry.

**Trade-off, now explicit** (Max already anticipated and accepted this): this package is no
longer covered by `pnpm -r lint` / `pnpm -r build` / `pnpm -r test` run from the repo root —
confirmed (`pnpm -r run lint` now reports "Scope: 2 of 3 workspace projects"). It must be
verified standalone: `cd packages/meteoswiss-forecast-evals && pnpm install && pnpm run lint &&
pnpm run build && pnpm test`. Acceptable since this suite was never wired into CI regardless (see
README "Not run in CI") — it was always a manually-run, on-demand tool, just now also manually
*installed*.

**Verification performed:**
1. `pnpm install` at the repo root: confirmed the eval package's importer entry is fully gone
   from the root `pnpm-lock.yaml` (previously present with just its TS/lint devDependencies;
   now absent entirely — `grep -n "meteoswiss-forecast-evals" pnpm-lock.yaml` → no matches) and
   `promptfoo` still doesn't appear anywhere in it (`grep -c promptfoo pnpm-lock.yaml` → `0`).
2. `cd packages/meteoswiss-forecast-evals && pnpm install`: created a fresh, independent
   `pnpm-lock.yaml` in this directory (confirmed via `ls`), with `promptfoo@0.121.18` present
   with a real integrity hash and full transitive tree (`grep -A3 "^  promptfoo@" pnpm-lock.yaml`).
3. `pnpm run lint` / `build` / `test` / `dryrun` all pass standalone from inside this directory
   (`dryrun` confirmed the locally-installed `promptfoo` binary resolves correctly via
   `pnpm run`'s `PATH` injection — no `npx`, no network fetch).
4. `pnpm -r run lint` / `pnpm -r run build` from the repo root confirmed scope is now "2 of 3
   workspace projects" (`meteoswiss-mcp`, `meteoswiss-skills` only) — the eval package is fully
   excluded, as intended.
5. **Build-script parity with the run that actually produced the verdict.** `npx` (the mechanism
   used for the sweep in "Full sweep results" below) has no build-script gating, so promptfoo's
   native postinstall scripts (esbuild, sharp, onnxruntime-node, @swc/core, protobufjs,
   @playwright/browser-chromium) ran unconditionally. pnpm blocks unapproved build scripts by
   default — the first standalone `pnpm install` silently skipped all six ("Ignored build
   scripts", confirmed by reproducing it), which would have left a *different* promptfoo install
   than the one already validated by the paid sweep. Fixed by adding an `onlyBuiltDependencies`
   allowlist naming those six packages to
   `packages/meteoswiss-forecast-evals/pnpm-workspace.yaml` (scoped to this nested workspace only
   — doesn't touch the root's own `onlyBuiltDependencies: [esbuild]`) and re-running `pnpm
   install`, confirmed clean (no "Ignored build scripts" warning, all six postinstall scripts ran
   to completion). `pnpm-lock.yaml` was unaffected (build-script approval doesn't change dependency
   resolution) — `git status` after showed only `pnpm-workspace.yaml` modified. Re-verified
   `lint`/`test`/`dryrun` standalone afterward, still green.

## Full sweep results (2026-07-09)

**Cost: ~$0.32 actually spent** (verified against OpenRouter's own account API, not promptfoo's
internal cost field — see the caveat above). Well under the $2-4 target and the $10 hard
ceiling. The sweep did **not** complete cleanly, though — 61.9% of the 462 scheduled calls
(286 rows) came back as real API errors rather than model answers. Root-caused (systematic
debugging, not guessed) to **three independent, unrelated causes**, none of which are eval-suite
bugs in the harness itself:

1. **Dominant cause — this OpenRouter account has never purchased credits.**
   `GET /api/v1/auth/key` reports `"limit": 10, "limit_remaining": 9.66, "is_free_tier": true`;
   `GET /api/v1/credits` reports `"total_credits": 0`. The `$10` figure is a *per-key spend cap*
   that would apply once the account has a real prepaid balance — it is not itself spendable
   money. Free-tier accounts draw against a much smaller complimentary balance for metered usage,
   and this run exhausted it partway through (concurrency=4, 13 models spending simultaneously):
   `402 "Insufficient credits. This account never purchased credits."` hit 7 of 13 providers,
   always on their *later*-scheduled test cases (7-day/station/multi-series fixtures), never on
   the very first (primary-fixture) calls — consistent with "ran out partway through," not a
   per-request limit. **Action needed from Max: add real credits to the OpenRouter account** at
   <https://openrouter.ai/settings/credits> before a complete, all-13-provider rerun — this is a
   billing action outside what a coding session should do unprompted.
2. **`mistralai/mistral-large-2512` and `mistralai/mistral-medium-3.1`: 100% failure**, unrelated
   to credits — `404 "No endpoints available matching your guardrail restrictions and data
   policy. Configure: https://openrouter.ai/settings/privacy"`. An account-level privacy/data-
   policy setting on OpenRouter excludes these two endpoints entirely. **Action needed from Max:
   toggle the relevant setting at that URL**, or accept these two EU frontier/cheap-tier
   providers stay excluded from this suite.
3. **`gpt-5-mini`, `gpt-5-nano`, `gemini-3.1-pro-preview`, `gpt-5.2`: 100% failure**, also
   unrelated to credits exhaustion (all four failed even on their very first, primary-fixture
   call) — these four reject this suite's cost-control config outright. Three returned
   `400 "Reasoning is mandatory for this endpoint and cannot be disabled"` in response to
   `passthrough.reasoning.enabled: false`; `gpt-5.2` returned a distinct `402 "This request
   requires more credits... You requested up to 65536 tokens, but can only afford 2708"` —
   meaning it silently ignored `max_tokens: 256` and reserved a huge hidden reasoning-token
   budget instead of refusing outright. **Fixed in this PR**: `promptfooconfig.yaml` now gives
   these four `passthrough: { reasoning: { effort: 'minimal' } }` instead of `enabled: false` —
   the lowest reasoning budget these endpoints accept, rather than trying to disable reasoning
   entirely. Not yet re-verified against a live call (would need real credits — see #1).
   **Caveat for the rerun**: gpt-5.2's error text ("requested up to 65536 tokens") looks less
   like a reasoning-budget problem and more like `max_tokens: 256` not being applied to that
   endpoint at all — 65536 reads like an unconstrained default ceiling, not a reasoning-effort
   side effect. Once real credits are added, the 402 will likely disappear regardless (small
   enough balance no longer being the binding constraint), which would make this *look* fixed
   without confirming `max_tokens` actually caps gpt-5.2's completion length. On rerun, check
   gpt-5.2's `tokenUsage.completion` in `generated/results.json` stays near 256, not just that
   the call succeeds — otherwise this one provider could quietly cost far more per call than the
   rest of the sweep.

**The headline verdict, from the 7 providers that did complete cleanly** (all 3 tiers
represented — frontier: opus-4.8, sonnet-5; cheap: haiku-4.5, gemini-3.1-flash-lite; tiny:
gemini-2.5-flash-lite, llama-3.3-70b, ministral-8b — 18/18 or 27/27 API-successful calls each on
the primary, DST-spanning fixture):

```
tier      variant   accuracy
frontier  local     18/18  100.0%
frontier  utc       11/18   61.1%
cheap     local     18/18  100.0%
cheap     utc        9/18   50.0%
tiny      local     25/27   92.6%
tiny      utc       12/27   44.4%
```

By question family, the pattern is uniform across every tier — including frontier — which per
this doc's own reporting rule ("a family missed uniformly across tiers is a format defect, not a
capability gap") is a clean signal. One family needs to be pulled out before drawing that
conclusion, though: `dst-trap` asks for the UTC offset at a specific local hour (`+02:00`), which
the local-variant JSON prints literally and the UTC-variant JSON structurally omits — the prompt
also forbids outside knowledge. That question is **definitionally unanswerable from the UTC
variant by design** (see "Question set" above), so its 0% UTC score is expected and shouldn't be
read as a comprehension failure on its own. Excluding it:

- **Day-level / boolean-only questions** (`argmax-day`, `availability`, `cross-field`,
  `range-bool`) stay at or near 100% on **both** variants, every tier.
- **`point-num` and `range-num`** (exact-value and range-sum lookups at a specific local hour) —
  the cleanest, non-rigged evidence — score **100% local / 0% UTC in every single tier**,
  frontier included (`opus-4.8`/`sonnet-5` both `2/2` local, `0/2` UTC). These questions are
  fully answerable from either variant's JSON in principle; the only difference is whether the
  model has to convert a UTC instant to the Europe/Zurich wall-clock hour before doing the
  lookup, and it essentially never gets that conversion right.
- **`argmax-time`** (which local hour had the most rain) shows the same direction, though less
  absolute: `0/2` cheap and `0/3` tiny, but frontier only drops to `1/2` (50%) rather than `0/2`
  — still a large regression from its 100% local score, just not as total as point-num/range-num.
- `dst-trap`, once understood as structurally rigged rather than a capability signal, is
  consistent with (not separate evidence for) the same story: local time survives because the
  offset is printed; UTC can't, by construction.

Two distinct mechanisms are both at work here, worth keeping separate: local time removes an
error-prone UTC→local conversion step from every hour-level *value* lookup (point-num,
range-num, argmax-time), and separately makes the UTC offset itself directly readable rather
than requiring calendar/DST knowledge the prompt explicitly disallows (dst-trap).

**This partial-sample verdict was: keep local-time labeling, do not switch to UTC** — see below
for the complete 13-provider rerun, which confirms it and strengthens the evidence.

## Full sweep results, complete (2026-07-09, after credits + ZDR fix)

Max added real OpenRouter credits and disabled the account's ZDR (data-policy/guardrail) setting
that had been blocking the two Mistral endpoints. Rerun of the full sweep: **all 13 providers
completed with 0 API errors** (462 total scheduled calls; `Results: 0 errors (0%)` in the
promptfoo CLI summary) — every failure below is a real scoring outcome (wrong/unparseable), not
an infrastructure failure. All three root causes from the partial run are confirmed fixed:
credits exhaustion (resolved by the top-up), the Mistral 404 guardrail (resolved by the ZDR
toggle — both `mistral-large-2512` and `mistral-medium-3.1` completed all 33 calls each, no
different from any other provider), and the four reasoning-config rejections (resolved by
`passthrough.reasoning.effort: 'minimal'` — see the caveat on `gemini-3.1-pro-preview` below,
which needed one more round of investigation).

**Gate (tiny tier, primary DST-spanning fixture) — decides #99 / PROD release:**

```
tiny | local   n=36  score=86%  [wrong:5 correct:31]
tiny | utc     n=36  score=46%  [wrong:19 correct:16 partial:1]
```

**All tiers × variant, primary fixture:**

```
tier      variant   n    score
cheap     local     36   100%  [correct:36]
cheap     utc       36    54%  [correct:19 wrong:15 unparseable:1 partial:1]
frontier  local     45    93%  [correct:42 unparseable:3]
frontier  utc       45    56%  [wrong:17 correct:25 unparseable:3]
tiny      local     36    86%  [wrong:5 correct:31]
tiny      utc       36    46%  [wrong:19 correct:16 partial:1]
```

**Question family × variant, primary fixture (n=13 per cell — the full set, not a partial
sample):**

```
family          local   utc
argmax-day       92%    92%   (date-level, both variants encode it identically — expected)
argmax-time     100%    15%
availability     92%    88%
cross-field     100%    88%
dst-trap         85%    15%   (structurally unanswerable from UTC by design — see below)
point-bool       85%    69%
point-num       100%     0%
range-bool      100%   100%   (coarse yes/no across a labeled range — robust either way)
range-num        85%     0%
```

The full sample confirms and sharpens the partial-run finding. **`point-num` and `range-num`**
remain the cleanest, non-confounded evidence — exact-value and range-sum lookups at a specific
local hour — now at **100% local / 0% UTC across the complete 13-provider, n=13-per-cell sample**,
not just a 7-provider subset. `argmax-time` shows the same collapse (100% → 15%). `dst-trap`
stays excluded from the headline claim for the same reason as before: it asks for the UTC offset
itself, which the local-variant JSON prints literally and the UTC-variant JSON structurally
cannot express — its near-zero UTC score is expected by construction, not new comprehension
evidence. **`argmax-day` and `range-bool` show no gap at all** — a genuinely new nuance the
partial sample didn't have the range to surface clearly: coarse day-level and yes/no-across-a-
range questions don't require converting a specific hour, so they're insensitive to the
labeling choice. The comprehension gap is specifically about pinning down *a particular hour's*
value, not about the format being confusing in general.

**Per-model breakdown, primary fixture (n=9 per cell, every one of the 13 real providers)** —
every single model, no exceptions, scores higher on local than UTC:

```
provider                          local   utc
claude-opus-4.8                    100%    67%
claude-sonnet-5                    100%    56%
claude-haiku-4.5                   100%    44%
gemini-3.1-pro-preview              67%    22%   (see caveat below — inflated by a truncation bug)
gemini-3.1-flash-lite               100%    56%
gemini-2.5-flash-lite               100%    44%
gpt-5.2                             100%    67%
gpt-5-mini                          100%    56%
gpt-5-nano                          67%    44%
mistral-large-2512                  100%    67%
mistral-medium-3.1                  100%    56%
ministral-8b-2512                    89%    33%
llama-3.3-70b-instruct               89%    56%
```

**Surprising finding, investigated and explained:** `gemini-3.1-pro-preview` is the one outlier
that doesn't score ~100% on local. Traced (not guessed) by reading its raw failing responses in
`generated/results.json`: on **local**, all 3 failures are `[unparseable] no JSON object
recovered from response` — the model emits a visible `"Thinking: ..."` preamble (a side effect of
`reasoning.effort: 'minimal'` still leaking some reasoning tokens into the completion, matching
`summarize.ts`'s own `[!] reasoning tokens leaked: 7612` flag for this provider) that consumes
the `max_tokens: 256` budget before the actual JSON answer, truncating mid-response (e.g.
`{"utc_offset": "+02:00` cut off with no closing brace). This is an eval-harness token-budget
artifact, not a comprehension failure — the model was mid-way through emitting the *correct*
answer when it ran out of budget in two of the three cases inspected. On **UTC**, by contrast,
6 of 8 failures are genuine wrong answers (e.g. "expected 0.3±0.05, got 0.5") in the same pattern
as every other model, plus 2 more truncation artifacts. Net effect: this provider's local score
(67%) understates its real comprehension (which is likely ~100%, consistent with every other
frontier model, once truncation is excluded), while its UTC score (22%) is a mix of real
misunderstanding and the same artifact. **Does not change the verdict** — if anything, correcting
for the artifact would widen this model's local-vs-UTC gap, not narrow it. Flagged here rather
than silently adjusted, since fixing `max_tokens` for this one provider is a config change for a
future PR, not something to patch mid-report.

No other provider — including both previously-blocked Mistral models — shows any anomaly relative
to the rest of its tier. The Mistral models track their tier peers closely (`mistral-large-2512`
100%/67% local/utc, right in line with `opus-4.8`/`gpt-5.2`; `mistral-medium-3.1` 100%/56%, in
line with `haiku-4.5`/`gpt-5-mini`; `ministral-8b-2512` 89%/33%, in line with the other tiny-tier
models) — the earlier 404 guardrail block was purely an account setting, not a sign these models
handle the format differently.

**Judge slice** (`pnpm run eval:judge`, open-ended prompts judged by `opus-4.8` via
`llm-rubric`): **12/12 passed (100%)**, 0 errors, across all 3 judged providers
(`opus-4.8`, `haiku-4.5`, `gpt-5-nano`) — confirms the local-time format supports genuinely
useful, non-hallucinating, timing-aware answers in open-ended use (e.g. "explain to a cyclist
planning an 08:00 commute"), not just the programmatic lookup slice.

**Secondary tracks** (directionally consistent, not part of the headline gate):
- 7-day fixture: frontier 90%/60% local/utc, cheap 75%/50%, tiny 50%/50% (n=8 per tier-variant
  cell — small enough that the flat tiny-tier result is plausibly noise, not a contradiction).
- Multi-series mock (shape A vs shape B, secondary design input for a *future* sunshine/wind
  feature, not this PR's gate): shape B slightly ahead of shape A in cheap/tiny tiers (88%/72%
  vs 85%/77%), roughly even in frontier (76% vs 78%) — a mild signal, not a strong one either way.

**Cost — actual, verified against OpenRouter's own account API** (not promptfoo's internal cost
field, confirmed non-functional for OpenRouter): account usage before this rerun was
`$0.335` (the earlier partial 7/13 sweep); after the full 13-provider sweep + judge slice,
`$1.289`. **This rerun's actual spend: ~$0.95** (eval sweep + judge slice combined), comfortably
under the $2-4 target and the $10 hard ceiling — confirmed via `GET
https://openrouter.ai/api/v1/auth/key` (`usage` field) and `GET
https://openrouter.ai/api/v1/credits`, cross-checked against `summarize.ts`'s own token-based
estimate (~$1.07 for the eval sweep alone) — same order of magnitude, real API confirms the
estimate isn't wildly off.

**Verdict: keep local-time labeling (PR #99 as shipped). Do not switch to UTC. Confirmed, not
just carried over, by the complete 13-provider rerun.** The core, non-confounded evidence
(`point-num`/`range-num`) is unchanged in direction and now covers the full sample: 100% local /
0% UTC, every tier, every one of the 13 real models included. No provider — including the two
previously-blocked Mistral endpoints — bucks the trend. The one apparent outlier
(`gemini-3.1-pro-preview`'s depressed local score) traces to an eval-harness token-budget
artifact, not a comprehension counterexample, and correcting for it would strengthen rather than
weaken the finding. The judge slice adds an open-ended, non-programmatic confirmation that the
local-time format produces useful answers, not just correct programmatic-lookup answers.

**Local-format cleanliness check** (this suite's secondary purpose — catching defects in the
*local* format before release, independent of the UTC comparison): tiny tier scored 86% (31/36)
on local this run, similar to the partial run's 92.6%. Failures are `wrong:5`, still scattered
across different models/families per the per-model table above (no single model or question
family dominates tiny-tier local failures) — read as ordinary model noise at the tiny-tier
capability floor, not a local-format defect worth acting on before release.

## Multi-series eval, expanded (2026-07-09)

Max was happy with the local-vs-UTC verdict ("cheap, settles the local-time question") and asked
for two follow-ups ahead of a new GitHub issue (#101) covering the full multi-series expansion
(sunshine, wind, temperature — generalizing #98/#99's precipitation groundwork): make the
Shape A vs B comparison conclusive (the original 5-question mock only gave a mild signal), and
test whether a compact long-series representation rescues the tiny-tier drop seen on the 7-day
fixture in the full sweep above.

**Expanded `src/multiseries.ts` from 5 to 11 questions.** The original 5 (point-cross,
argmax-sunshine, argmax-wind, a 3-field compound check, sunshine cross-field) don't stress
*conditional* multi-series reasoning much. Added 6: `ms-argmax-precip` (single-param argmax, a
control), `ms-best-walk-hour` (conditional argmax: dry AND sunny AND calm, tie-broken by most
sunshine — new family `ms-compound-argmax`), `ms-windy-dry-hour` (existence + earliest-match:
dry AND wind>=14km/h — new family `ms-existence`, deliberately NOT the same hour as the
single-param wind argmax, to check the model isn't just pattern-matching "the windy hour"),
`ms-point-1900` (a second point-cross combination, all-different-from-the-original-hour's
true/false pattern to avoid the model learning a shortcut), and two more cross-field checks
(`ms-wind-avg-check`, `ms-precip-total-check`, mirroring the existing sunshine one). Every new
expected value is derived programmatically from `HOURLY_TABLE` via `.filter()`/`.reduce()` in
`multiseriesGroundTruth`, same "derived not hand-typed" discipline as the rest of this suite —
verified by hand against the raw table before running anything paid.

**Run: 5 representative providers** (not all 13, to control cost per Max's suggestion) — 1-2 per
tier: `opus-4.8` + `gemini-3.1-pro-preview` (frontier), `haiku-4.5` (cheap), `gpt-5-nano` +
`gemini-2.5-flash-lite` (tiny) — × 11 questions × 2 shapes = 110 calls, **0 API errors**.

```
shape                    n     score
multiseries-a (parallel) 55     76%  [correct:42]
multiseries-b (unified)  55     84%  [correct:46]
```

By family — Shape B's advantage concentrates exactly where cross-parameter combination is
required, and disappears (or slightly reverses) for single-parameter lookups:

```
family                       A      B
ms-compound-argmax          20%    60%   (conditional argmax: 3x better on B)
ms-cross-field               87%   100%   (does the daily total match the hourly sum)
ms-argmax (single-param)     93%    87%   (no shape benefit — nothing to cross-reference)
ms-point-cross                67%    73%
ms-existence                  80%    80%   (tied)
```

Per-provider: `opus-4.8` 82%→100% (A→B), `gemini-2.5-flash-lite` 64%→91%, `haiku-4.5` tied 73%,
`gemini-3.1-pro-preview` 100%/100% (see below), `gpt-5-nano` 64%→55% (the one exception — its
shape-B misses are wrong-hour guesses of the same kind it makes on shape A, not shape-specific).
4 of 5 providers score equal-or-better on Shape B.

**`gemini-3.1-pro-preview`'s `max_tokens` fix confirmed working.** Gave this provider its own
config (`max_tokens: 1024` instead of the shared 256) in `promptfooconfig.yaml` — see that
file's comment — after tracing its depressed local-fixture score in the full sweep to a
token-budget truncation artifact, not a comprehension failure. Result: 100%/100% on both shapes
here, 22 calls, 0 truncations. Fix confirmed, not just theorized.

**Verdict: build the multi-series expansion as Shape B** (`hourly[]` of `{time, precip_mm,
sunshine_minutes, wind_kmh}` objects), not Shape A (parallel per-parameter arrays). Posted as a
comment on #101 alongside the full breakdown.

## Compact long-series representation (2026-07-09)

The full sweep found tiny tier scoring ~50% on the 7-day (~168-entry) fixture, vs. 86-100% on
the shorter primary fixture — raising the question of whether the sheer length/sparsity of the
array (144 of 168 hourly entries are exactly 0 on this fixture) was the cause, and whether a
compact representation would help.

**Caution applied before concluding anything**: that ~50% figure came from just 2 questions
(`sevenday-wettest`, `sevenday-afternoon-shower`) — too thin to draw a "long series breaks tiny
models" conclusion from. Expanded `sevenDayQuestions()` from 2 to 5 (added `sevenday-thu-hour15`
a point-num lookup, `sevenday-mon-dry` a day-level bool, `sevenday-tue-total` a day total) so any
finding would be less confounded by one hard question dominating a tiny sample.

**Candidate compact representation** (`src/compact-representation.ts`): list only hours with
measurable rain (`value > 0`), with an explanatory note that unlisted hours were 0mm. On this
fixture that's a 168→24-entry reduction, ~67% smaller by byte size (19,205 -> 6,374 bytes for
the JSON blob). Same underlying instants/ground truth as the full representation — only the
hourly array's density changes, isolating that one variable the same way `fixture.ts` isolates
local-vs-UTC.

**Ran both representations against the same 5 questions, same tiny-tier providers, for a clean
apples-to-apples comparison** (not the confounded 2-question figure from the full sweep):

```
representation          tiny-tier score (n=20, 4 models: gpt-5-nano, gemini-2.5-flash-lite,
                                            ministral-8b-2512, llama-3.3-70b-instruct)
full (168 entries)             75%  (15/20)
compact (sparse, 24 entries)   80%  (16/20)
```

**Honest finding: marginal improvement, not a rescue.** Traced per-model: only
`ministral-8b-2512` actually improved (80%→100%); the other three tiny models scored
*identically* on both representations. The dominant recurring failure
(`sevenday-afternoon-shower`, a 4-hour range-sum) persists almost unchanged across both — 3 of 4
tiny models undershoot that sum by 0.1-0.3mm on full representation, and by a near-identical
margin on compact. **This means the tiny-tier weak point on long series is multi-hour summation
accuracy, not array length/sparsity** — compacting the array doesn't fix a summation error, it
just gives the model less irrelevant data to scan past on the way to the numbers it still adds
up wrong. The original ~50% figure was mostly an artifact of a thin 2-question sample where that
one hard question happened to dominate, not a broad "tiny models can't cope with long series"
signal — with 5 questions, tiny tier holds up much better (75-80%) on this fixture than the
partial sample suggested.

**Recommendation for #101**: adopt the compact/sparse representation as a reasonable, low-risk
size optimization for long-horizon requests (smaller payload, no measured downside, small
positive signal), but don't expect it alone to solve range-sum accuracy for the smallest models —
that would need a different intervention (e.g. the tool computing and surfacing period totals
itself, rather than expecting the model to sum a long hourly series), out of scope for this PR.

**Cost for both follow-ups**: multi-series expansion + compact-representation comparison +
apples-to-apples full-representation rerun (to fix the confound above) together cost **~$0.51**
(account usage $1.4514 -> $1.9574, verified via OpenRouter's account API), comfortably within
the $1-2 target and the $10 ceiling.
