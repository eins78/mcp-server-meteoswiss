# meteoswiss-forecast-evals

Eval suite measuring how well LLMs **understand** the JSON returned by `meteoswissLocalForecast`
— especially the new `precipitation.hourly` time-series added in
[PR #99](https://github.com/eins78/meteoswiss-llm-tools/pull/99). See [`PLAN.md`](./PLAN.md)
for the full design and rationale. This is a standalone package: it does **not** depend on
`meteoswiss-mcp`'s source, only on a static JSON sample captured from it (see `fixtures/`).

**Not run in CI.** This is a manual, on-demand suite — run it when you're about to change the
forecast JSON shape, or periodically to catch regressions in legibility as models change.

**Not a pnpm workspace member.** This package is deliberately excluded from the root
`pnpm-workspace.yaml` (`!packages/meteoswiss-forecast-evals`) and has its **own**
`pnpm-workspace.yaml` + `pnpm-lock.yaml`, making it an independent, self-contained npm project
nested inside the monorepo. See "Why this package isn't a workspace member" below for why, and
run `pnpm install` **inside this directory**, not from the repo root — root `pnpm install`
never touches it.

## The headline question

Does labeling hourly timestamps in **local time with a UTC offset** (what PR #99 ships,
e.g. `"2026-03-28T09:00:00+01:00"`) vs **UTC** (`"2026-03-28T08:00:00Z"`) change whether models
— especially the small/cheap ones real users actually run — can correctly answer real-world
local-time questions about the forecast. That result gates merging PR #99 / releasing the
hourly-precipitation feature to PROD.

## Quick start

```bash
cd packages/meteoswiss-forecast-evals   # this package is NOT installed by a root `pnpm install`
pnpm install                  # standalone install — own pnpm-lock.yaml, own node_modules
pnpm run generate            # builds generated/tests.json + generated/judge-tests.json from fixtures/
pnpm test                    # offline unit tests (ground truth + scorer), no network, no cost
pnpm run dryrun               # promptfoo's built-in `echo` provider — validates the whole
                              # pipeline (fixtures -> prompts -> scorer -> results file) for $0
pnpm run smoke                # ONE cheap model, real OpenRouter spend (~1-2 cents) — sanity
                              # check before committing to a full paid run
pnpm run eval                 # FULL programmatic sweep across all configured models (~$2-3, see PLAN.md)
pnpm run eval:judge            # small open-ended judge slice (~$1-2)
pnpm run summarize             # prints the gate table from the most recent generated/results.json
pnpm run view                  # opens promptfoo's local web UI over past runs
```

`pnpm run eval` / `smoke` / `eval:judge` all read the OpenRouter API key from the macOS
keychain at runtime (`scripts/keychain-openrouter.sh`) — **never hardcode or commit it**:

```bash
security find-generic-password -s OPENROUTER_API_KEY_EVALS -w
```

If that lookup fails, set `OPENROUTER_API_KEY` in the environment yourself before running.

## Reading the output

`pnpm run summarize` prints, in order:

1. **THE GATE** — tiny tier x `{local, utc}` on the primary (DST-spanning) fixture. This is
   the number that decides #99 / PROD.
2. Full tier x variant breakdown.
3. Question family x variant — tells you *what* is confusing (if anything), not just how much.
4. Secondary tracks: the 7-day longer-horizon fixture, and the multi-series mock (shape A vs
   shape B, a design input for the *next* feature — sunshine/wind time-series).
5. Estimated cost per provider (see the caveat below).

### Known limitation: promptfoo's own cost field is empty for OpenRouter

Confirmed empirically during the build smoke test: `promptfoo`'s `row.cost` comes back `0` for
every OpenRouter call, even though `tokenUsage` is populated correctly. `summarize.ts` computes
an estimated cost itself from `tokenUsage x` a hardcoded pricing table (checked against
`openrouter.ai/api/v1/models` when this suite was built). Cross-check the real total against
[OpenRouter's Activity page](https://openrouter.ai/activity) before trusting it hard against the
$10 ceiling, especially after OpenRouter re-prices any model.

## Package layout

```
fixtures/                    committed, static, captured-or-hand-authored JSON samples
generated/                   committed: exact prompts/expected-answers (reviewable in the PR)
                              gitignored: results*.json (run outputs — may contain model text)
src/
  types.ts                   forecast JSON shape (duplicated from meteoswiss-mcp on purpose —
                              see PLAN.md "why this package doesn't depend on #99's code")
  fixture.ts                 load fixtures; derive the UTC variant from the LOCAL one
  ground-truth.ts            canonical per-hour readings + answer functions, single source of truth
  questions.ts                the 10-question programmatic set (primary + 7-day + station)
  multiseries.ts              secondary track: shape A vs shape B mock
  generate-tests.ts           ties it together -> generated/{tests,judge-tests}.json
  scoring-core.ts              lenient parsing + comparison (plain TypeScript, unit-tested directly)
  scorer.ts                    promptfoo javascript-assertion entrypoint (plain TypeScript — see
                              its header comment for why no build step is needed)
  summarize.ts                 the gate table + cost report
  *.test.ts                    offline unit tests (node:test), run via `pnpm test`
scripts/
  synth-7day-fixture.ts        one-off, deterministic generator for the 7-day fixture
  keychain-openrouter.sh       prints the OpenRouter key from the keychain
  run.sh                       wraps `promptfoo eval`, wiring in the key
promptfooconfig.yaml           programmatic (lookup) slice — the primary eval
promptfooconfig.judge.yaml     open-ended, Opus-judged slice — secondary quality check
pnpm-workspace.yaml            makes this directory its OWN pnpm workspace root, independent
                              of the repo root's — see "Why this package isn't a workspace
                              member" below. Also allowlists promptfoo's native build scripts
                              (esbuild, sharp, etc.) via `onlyBuiltDependencies` — pnpm blocks
                              unapproved build scripts by default, and the previous `npx`-based
                              run had no such gating
pnpm-lock.yaml                  this package's own lockfile, incl. promptfoo + its full
                              transitive tree with real integrity hashes
```

Every `.ts` file in `src/` and `scripts/` runs directly with no build step — including
`scorer.ts`, which promptfoo itself dynamically imports at grading time. See "Why plain
TypeScript, no `.mjs`/`.cjs`" below.

## Extending this suite

- **New question**: add it to `src/questions.ts` (or `src/multiseries.ts` for the secondary
  track), computing `expected` from `src/ground-truth.ts` — never hand-type an expected value.
- **New fixture**: capture real tool output the way `fixtures/forecast-8001-2day-local.json`
  was captured (see PLAN.md "Fixture & the two variants" for the exact gotcha to avoid), or
  follow `scripts/synth-7day-fixture.ts`'s pattern for a synthesized one (deterministic, no
  `Math.random`/`Date.now`, documented provenance in a header comment).
- **New model**: add a provider block to `promptfooconfig.yaml`, following the existing
  `tier/short-name` label convention — `summarize.ts` derives the tier from that prefix.

## Why plain TypeScript, no `.mjs`/`.cjs`

promptfoo's own docs say external assertion files must be pre-transpiled JS ("if transpiling
TypeScript, point promptfoo to the transpiled output"), which is why this suite originally
shipped `scorer.cjs` / `scoring-core.mjs`. That turned out to be unnecessary: promptfoo just
does a plain dynamic `import()`/`require()` on the `file://` path it's given. On this repo's
pinned Node version (24.18, see `.nvmrc`; every CI workflow pins `node-version: 24`), that
resolves through Node's own native TypeScript support — type-stripping for "erasable" syntax,
on by default since Node 23.6. This repo already forbids the handful of TS constructs that
*aren't* erasable (enums, namespaces, parameter properties — see the root `CLAUDE.md`), so
every file here was already inside that subset. Verified empirically (a throwaway `.ts` scorer
against promptfoo's free `echo` provider, before converting the real files) rather than taken on
faith from promptfoo's docs. Net effect: `scorer.ts` and `scoring-core.ts` run with **no build
step**, matching the rest of this monorepo's `tsx`-first convention, instead of needing to be
hand-maintained in two module formats.

## Why this package isn't a workspace member

`promptfoo` (the CLI) is large — pulling it in as a real `devDependency` of a normal workspace
member would mean every `pnpm install` at the repo root installs its full transitive tree for
every contributor, even ones who never touch this package, since pnpm workspaces install the
full dependency graph of every workspace member by default.

An earlier version of this fix ran promptfoo via `npx promptfoo@0.121.18` instead of declaring
it — zero footprint on the root install, but only the top-level version was pinned. `npx`
resolves promptfoo's own dependency tree fresh at run time (cached, but with no integrity hashes
and no locked sub-dependency versions), which is not the reproducibility a real lockfile entry
gives you. Max flagged this correctly in review.

The actual fix: this package is **excluded from the root workspace glob**
(`pnpm-workspace.yaml`: `"!packages/meteoswiss-forecast-evals"`) and has its **own**
`pnpm-workspace.yaml` (`packages: ["."]`), which makes pnpm treat it as an independent,
self-contained project — its own `pnpm-lock.yaml`, fully integrity-hashed, including
`promptfoo` and its complete transitive tree, resolved and installed only when you run
`pnpm install` **inside this directory**. Root `pnpm install` never sees it at all.

Other options were investigated and rejected — see `PLAN.md` "Q-B (revisited)" for the full
writeup with sources, but in short: `optionalDependencies` are installed by default in pnpm on
any compatible platform (skipping them entirely requires a workspace-wide
`ignoredOptionalDependencies` denylist, which isn't "opt-in when needed"); `--filter` exclusion
is a per-invocation flag, not a persistent property of a package, so a plain `pnpm install` at
the root would still install it; and `shared-workspace-lockfile: false` is an all-or-nothing
setting for the *entire* workspace (confirmed by a pnpm maintainer) — there's no way to give just
one package its own lockfile while the rest of the monorepo keeps sharing the root one, short of
what this package now does: leaving the workspace and defining its own, nested one.

**Trade-off**: this package is no longer covered by `pnpm -r lint` / `pnpm -r build` /
`pnpm -r test` at the repo root — verify it standalone (`cd` in, then the usual `pnpm run lint`
/ `build` / `test`). Acceptable here since it was never wired into CI anyway (this is a manual,
on-demand suite — see the top of this README).
