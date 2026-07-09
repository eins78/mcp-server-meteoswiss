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

**Verdict: keep local-time labeling (PR #99 as shipped). Do not switch to UTC.** The
core evidence — point-num and range-num alone, ignoring the structurally-rigged dst-trap
question entirely — already shows the effect at its cleanest: 100% local vs. 0% UTC, in **every
tier including frontier**. This is not a weak-model problem; even the strongest models tested got
the UTC→local hour conversion wrong essentially every time it was needed for a precise lookup.
This is drawn from 7 of 13 configured providers (missing: gpt-5.2, gemini-3.1-pro, gpt-5-mini,
gpt-5-nano, mistral-large, mistral-medium-3.1 — all excluded by the account/config issues above,
not by the format being tested) — a full 13-provider rerun after Max adds credits would firm up
the tiny-tier n and add the two missing EU/Mistral providers, but is unlikely to reverse a signal
this large and this consistent across independent tiers. The judge slice (`pnpm run eval:judge`)
was not run — it uses `opus-4.8` as judge, which already showed the same credit-exhaustion
pattern above, so running it now would mostly fail for the same reason; rerun once credits are
added.

**Local-format cleanliness check** (the suite's secondary purpose — catching defects in the
*local* format before release, not just the UTC comparison): tiny tier scored 92.6% (25/27) on
local, not 100%. The 2 misses are scattered, not a pattern — `ministral-8b` missed one
`point-bool` question (misread a boolean), `llama-3.3-70b` missed one `range-num` sum by 0.1mm
(`0.8` vs expected `0.9`) — different models, different families, no shared cause. Read as
ordinary model noise, not a local-format defect worth acting on.
