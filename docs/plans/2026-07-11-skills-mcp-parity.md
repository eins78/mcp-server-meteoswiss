# Plan: Skills ↔ MCP Parity Enforcement

> Keep `packages/meteoswiss-skills` in sync with `packages/meteoswiss-mcp` by generating the parity contract from the live MCP tool list (not a hand-maintained manifest), and linting it for completeness + staleness as a required, build-failing CI check.

## Status

- **Phase:** Approved (Max answered all five open questions on PR #119, 2026-07-11 — resolutions baked in below)
- **Type:** infra
- **Sprint:** —

## Changelog

- (no user-facing change — this plan is CI tooling. Per `CLAUDE.md`, CI-config/dev-tooling PRs skip changesets; the lint script and workflow wiring land without one when implemented.)

## Motivation

Two independently-versioned public packages must stay in sync: `packages/meteoswiss-mcp` (the MCP server, ~7 tools) and `packages/meteoswiss-skills` (the single `meteoswiss-ogd` skill, which teaches an agent to hit the same OGD data directly via curl when no MCP server is available). Nothing today enforces that a server-side change to parameters, output shape, or value tables (e.g. weather icon codes) is reflected in the skill. The one skill-visible admission that drift already happened: `meteoswissClimateData` has a full MCP tool with zero skill coverage (`packages/meteoswiss-skills/skills/meteoswiss-ogd/README.md`, "Known Gaps").

This is round 2 of this plan. Round 1 shipped as a free-form proposal (`docs/proposals/skills-mcp-parity.md`, PR #119) recommending a hand-authored `parity-map.yml` manifest as the source of truth for a path-diff gate, with a bounded/advisory Claude judge as an optional Phase 2. Max reviewed it and pushed back on one specific point: **skepticism of a hand-maintained YAML manifest as the source of truth**, plus two structural asks — reframe as a Plot plan (this document, replacing the proposal doc), and make the lint a **hard, build-failing requirement**, not an advisory nice-to-have. He also gave a concrete lean to investigate seriously: map against the **MCP server's tool surface** (not raw source files), **generate** that mapping from the MCP inspector rather than hand-write it, and lint for **completeness** (every tool/param has a skill counterpart) and **staleness** (nothing in the mapping that no longer exists).

This plan pursues that lean, verifies it against the actual installed SDK rather than assuming, and reports where it holds fully, partially, and where a small human-authored residual still has to survive.

## Design

### Round 2 finding: the MCP tool list is already a generated artifact, and it's inspectable today

Verified directly against the SDK version this repo has pinned (`@modelcontextprotocol/sdk@1.28.0`, `packages/meteoswiss-mcp/package.json`) by downloading and reading the actual published package (not relying on memory of the spec):

- `McpServer`'s `tools/list` handler (`server/mcp.js`, `ListToolsRequestSchema` handler) builds each tool's advertised `inputSchema` from the registered Zod shape via `toJsonSchemaCompat(...)`, for **every** tool regardless of whether it was registered with the old `server.tool(name, description, schema.shape, handler)` call (what this repo currently uses in `src/server.ts` for all 7 tools) or the newer `server.registerTool(name, config, handler)`. Per-field `.describe()` text (already used throughout `src/schemas/*.ts`, e.g. `location: z.string().describe('Swiss location: postal code...')` in `ogd-local-forecast.ts`) round-trips into the JSON Schema `description` field automatically. **This means today, right now, with zero code changes, every tool name, tool description, and input parameter (name + type + human-readable description) is mechanically dumpable — nothing about it needs to be hand-transcribed into a manifest.**
- The same handler also emits `tool.outputSchema` when one is registered (`if (tool.outputSchema) { toolDefinition.outputSchema = toJsonSchemaCompat(...) }`) — but **only** for tools registered via the newer `registerTool()` API with an explicit Zod `outputSchema`. This repo's 7 tools are all registered via the older `server.tool()` signature and their outputs are plain TypeScript types with JSDoc (`LocalForecastResponse`, `DailyForecast`, etc. in `src/schemas/ogd-local-forecast.ts`), not Zod. **So output shape is not protocol-visible today.** It could become so by migrating to `registerTool()` + declared Zod output schemas — a real, SDK-supported option, but a separate, larger change than this plan covers (see Open Questions).
- Two ways to pull the generated `tools/list` payload, both concrete and already available in this repo:
  1. **`@modelcontextprotocol/inspector` CLI mode** — already a devDependency (`packages/meteoswiss-mcp/package.json`, used today for `pnpm run dev:inspect`). Its documented CLI mode (`npx @modelcontextprotocol/inspector --cli <server> --method tools/list`) is explicitly built for "CI/CD pipelines, batch processing" per its own README, and returns exactly this JSON. This is the literal "MCP inspector" Max named.
  2. **In-process SDK dump** (recommended for the CI script itself) — the SDK ships `InMemoryTransport` (`inMemory.js`) and a `Client` with `listTools()`. A ~20-line script can call `createServer()` directly, connect a linked in-memory client/server pair, call `client.listTools()`, and get the identical payload the inspector CLI would show — without spawning a subprocess, opening a port, or taking a network dependency on `npx` fetching a package in CI. Same data source, faster and more reliable in CI; the inspector CLI remains the right tool for a human checking a single tool by hand locally (`pnpm run dev:inspect` already does this).

### What this settles, and what it doesn't

| Candidate source of truth | Verdict | Why |
|---|---|---|
| Hand-written `parity-map.yml` (round-1 proposal) | **Rejected as source of truth** | Exactly Max's objection: a second hand-maintained artifact that itself goes stale, with nothing forcing it to track either side. Demoted to a small exceptions file (below). |
| Raw TypeScript source files (`src/schemas/*.ts`, `src/support/*.ts`) | **Rejected** | Requires re-deriving "is this file user-facing" by file-path convention or human judgment — the same crude/precise tension round 1 already flagged, just moved one layer down. Also can't distinguish input-shape (already protocol-visible) from internal plumbing (session mgmt, HTTP retries) without a human-maintained list of "which files count," which is the manifest problem again. |
| Live MCP tool list (`tools/list`), generated in-process from `createServer()` | **Recommended — the source of truth for tool/param completeness** | Not hand-maintained; cannot drift from the server, because it *is* the server's own advertised contract, captured mechanically. Covers all 7 tool names, descriptions, and every input parameter's name/type/description today, with zero code changes. |
| Same, extended to output shape via `registerTool()` + Zod `outputSchema` | **Resolved (decision 1): prerequisite sub-task, lands FIRST as its own PR** | Confirmed the SDK supports it (`tool.outputSchema` flows into `tools/list`). Migrating all 7 registrations makes output shape (e.g. `DailyForecast.precipitation.hourly`) generated/machine-checked too — a real dependency of the lint, so it precedes the parity check. Branch: `feature/register-tool-output-schemas`. |

**Residual that no schema can express**, regardless of the above: value-level content, not shape. Concretely, `src/support/weather-icons.ts` is a 119-entry `Record<number, string>` — a lookup table, not a schema shape, so it never appears in `tools/list` no matter how the tool is registered. Same for prose tribal knowledge the skill documents that has no schema analogue at all (`REFERENCE.md`'s Latin1-encoding note, the STAC asset-key "forcasting" typo). These two or three items are the **only** things left needing a hand-authored pointer.

### Recommendation

1. **Source of truth for tool/param completeness = the generated `tools/list` output**, produced in-process from `createServer()` (SDK `Client` + `InMemoryTransport`), not from source files and not from a hand-written map.
2. **A small `parity-exceptions.yml` survives, for two narrow purposes only** — (a) the non-schema-representable residual (the icon-code table, prose-only gotchas with zero schema counterpart), and (b) **deliberate tool exclusions with rationale** (per resolved decision 2: `search` and `fetch` are excluded — the parity focus is OGD data; those two are experimental extensions surfacing MeteoSwiss *website content*, intentionally without an OGD-skill equivalent). It is explicitly *not* consulted for in-scope tool/param completeness — that's fully generated. E.g.:

   ```yaml
   # Exclusions + non-schema residual only. Tool/param parity is generated from tools/list — do not add entries for those here.
   excluded-tools:
     - name: search
       reason: experimental website-content extension — OGD data is the parity focus; intentionally no OGD-skill equivalent
     - name: fetch
       reason: same as search — fetches MeteoSwiss web pages, not OGD data
   exceptions:
     - source: packages/meteoswiss-mcp/src/support/weather-icons.ts
       skill: packages/meteoswiss-skills/skills/meteoswiss-ogd/REFERENCE.md#icon-codes
       reason: value-level lookup table, not a schema shape — invisible to tools/list
     - source: packages/meteoswiss-mcp/src/support/ogd-csv-parser.ts
       skill: packages/meteoswiss-skills/skills/meteoswiss-ogd/SKILL.md
       reason: "Latin1 CSV encoding gotcha — tribal knowledge, no schema analogue"
   ```
   Staleness applies to `excluded-tools` too: an excluded tool that no longer exists in the inventory fails the lint.

3. **Matching mechanism — corrected by a round-3 finding.** This plan originally specified literal name-matching ("assert every tool/param name is mentioned in `SKILL.md`/`REFERENCE.md`"). Measured against the actual skill before building, that does **not** hold: the skill mentions **zero** MCP tool names (it is organized by capability — `## 1. Get Current Weather` — and teaches direct curl, never naming the tools), and its vocabulary is raw OGD parameter codes (`tre200s0`) and CSV columns, not the tool interface (`location`, `days`, `coordinates`, `canton`, `resolution`, `start_date`, `end_date` all appear 0 times). Literal matching would fail all 5 OGD tools on day one; a param-alias table to bridge the vocabularies would recreate the hand-maintained manifest this plan rejects, at param granularity. The corrected mechanism, two generated-in-spirit pieces:
   - **Per-tool coverage markers in the skill**: an HTML comment `<!-- mcp-tool: meteoswissCurrentWeather -->` placed on the skill section that covers each tool's capability — a direct evolution of the skill's *existing* `<!-- Canonical source: … -->` convention, co-located with the content so it can't silently drift. **Completeness** = every in-scope tool from the generated inventory has at least one marker across `SKILL.md`/`REFERENCE.md`. **Staleness** = every marker names a tool that still exists in the inventory. Add a tool → red until a marked section exists; rename/remove a tool → stale marker → red.
   - **A committed, generated inventory snapshot** (`packages/meteoswiss-mcp/parity/tool-inventory.json`, produced by a script — never hand-edited): the linter regenerates the inventory from the live server on every run and diffs it against the committed snapshot. Any server-surface change (tool added/renamed, param added/removed/retyped, description changed, output schema changed) fails the lint until the snapshot is regenerated in the same PR — forcing the parity surface to be consciously acknowledged, with the inventory diff visible to the reviewer right next to the skill diff (or its conspicuous absence). Staleness of the snapshot itself is structurally impossible: it is re-derived and compared on every run.
4. **Lint, hard-blocking (fails the build on drift):** one script (`packages/meteoswiss-mcp/scripts/lint-skills-parity.ts`, since it needs to import `createServer()`), running: inventory-vs-snapshot diff, marker completeness, marker staleness, and exceptions-file staleness (every `source:` path in `parity-exceptions.yml` must still exist; the skill's existing "Canonical source" provenance comments are parsed and checked the same way — the skill's own convention becomes part of the enforced contract). Wired into CI alongside the existing `skill-validation` job in `.github/workflows/pr-ci.yml`.
5. **Scoped as a *structural* gate, explicitly.** These checks prove *coverage* (every tool has a marked skill section), *no dead references*, and *acknowledged drift* (snapshot regenerated when the surface changed). They do **not** prove the skill's prose still correctly *describes* the tool's behavior — that is semantic parity, which no static check can verify. A follow-on layer — an agent that reads the inventory + the skill and judges semantic parity on release PRs, advisory rather than blocking — is anticipated but deliberately out of this plan's scope.

### Enforcement — hard requirement, not advisory

Max's directive supersedes round 1's "advisory-first" phasing: the lint fails the build on drift, full stop, once it lands. The only softening this plan proposes is mechanical, not a policy exception: a one-time bake-in **inside the implementation PR itself** (resolved decision 3 — not a separate PR), generating the initial snapshot, markers, and `parity-exceptions.yml` against the current codebase so day one doesn't fail on pre-existing, legitimate exceptions. Per resolved decision 5, the bake-in deliberately happens in a specific order: the lint lands and runs **red** on `meteoswissClimateData`'s known documentation gap first — proving in CI history that the guard catches a real, pre-existing gap — and only then is the gap closed (a climate section + marker added to the skill) to turn it green. After that, the check is blocking from the next PR onward. This mirrors how `pr-ci.yml`'s other jobs (`lint-build-test`, `docker-build`) already work — required, not advisory — rather than introducing a new, softer enforcement tier for this one check.

Runs on every PR (validated, unchanged from round 1): the generation step is a fast in-process call, not a network operation, so cost is negligible regardless of whether a mapped file changed.

### Escape hatch, reframed

Round 1 proposed a PR label or commit trailer as an ad hoc "skip this check" mechanism. With the mapping now generated rather than hand-maintained, the honest escape hatch is narrower and more accountable: a genuinely skills-irrelevant server change (internal refactor, caching tweak) touches no tool name, no input parameter, and nothing in `parity-exceptions.yml` — so the lint simply doesn't fire; there is nothing to suppress. The only case needing an explicit override is a deliberate, permanent scope decision (e.g. "this tool will never have skill coverage") — for that, add it to `parity-exceptions.yml` with a `reason:`, reviewed like any other code change, rather than a per-PR label that has to be reapplied and leaves no durable trail.

### Claude's role, narrowed

Round 1 floated Claude as a semantic judge deciding *whether* a change needs a skill update. With completeness/staleness now deterministic and generated, that judgment call mostly disappears — the lint already knows precisely which tool/param is undocumented. The remaining, genuinely useful job for Claude (still optional, still not part of the blocking mechanism) is narrower and more mechanical: once the lint fails, **draft the actual skill-doc diff** (a suggested addition to `REFERENCE.md`/`SKILL.md` for the flagged tool/param, using the same read-only `claude.yml` pattern and existing `ANTHROPIC_API_KEY` already in this repo) as a PR comment or suggestion — content generation, not gatekeeping. Left as a follow-on, not part of this plan's required scope.

### Options considered and rejected

- **Keep the round-1 hand-written `parity-map.yml` as source of truth.** Rejected per Max's explicit skepticism and the finding above — it can't be more trustworthy than the thing it's describing, since nothing forces it to track the server.
- **Map against raw source files instead of the MCP server.** Rejected — see table above; pushes the "what counts as user-facing" judgment call onto a human-maintained file list instead of the protocol boundary, which is a worse fit for what the skill is actually mirroring (the tool contract, not the file tree).
- ~~**Full migration to `registerTool()` + Zod output schemas as a prerequisite of this plan.** Considered, not adopted here.~~ **Reversed by resolved decision 1**: Max chose to do the migration first, as a distinct prerequisite sub-task in its own PR, precisely so output shape joins the generated/machine-checked surface before the lint lands.

### Resolved Decisions (Max, PR #119 review, 2026-07-11)

1. **Output-shape migration: YES, first.** The `registerTool()` + Zod-`outputSchema` migration is a distinct prerequisite sub-task in its own PR (`feature/register-tool-output-schemas`), landing before the parity check — output shape (not just input params) becomes generated/machine-checked, and the lint depends on it.
2. **`search`/`fetch`: EXCLUDED** from the parity check, documented here and in the exceptions file's rationale: the parity focus is OGD data; `search`/`fetch` are experimental extensions surfacing MeteoSwiss *website content*, intentionally without an OGD-skill equivalent.
3. **Bake-in: inside the implementation PR**, not a separate one.
4. **Version-sync lint: LEFT OUT.** PR #123 (merged) already automates the 4-file version sync via `pnpm run version` — duplicating it as a lint would be redundant.
5. **Proof-of-catch: YES, red first.** The completeness check lands and visibly fails CI on `meteoswissClimateData`'s known doc gap, *then* the gap is closed to turn it green — in exactly that order, so the red→green transition is visible in the PR's CI history.

### Non-goals

- No semantic-parity judging in the blocking path. The gate is structural (coverage + staleness + acknowledged drift); an agent that judges whether the skill's prose still correctly *describes* the tools — advisory, on release PRs — is an anticipated follow-on, not part of this plan.
- No version-sync lint (resolved decision 4): PR #123's `pnpm run version` automation already owns the 4-file version sync.
- No changes to the skill's teaching approach — it stays capability-organized, direct-curl; the markers are invisible HTML comments, not a restructuring.

## Branches

- `worktree-skills-mcp-parity` / PR #119 — this plan + the session record. No implementation code lands here; the plan doc stays as the decision record.
- `feature/register-tool-output-schemas` — **STEP A (prerequisite, own PR, lands first)**: migrate all 7 tools from `server.tool()` to `registerTool()` with declared Zod `outputSchema` (+ `structuredContent` in results), making output shape part of the generated surface.
- `infra/skills-parity-lint` — **STEP B (after A merges)**: inventory generator + snapshot, coverage markers, staleness checks, `parity-exceptions.yml` (exclusions + residual), climateData red→green proof, `pr-ci.yml` wiring, linter tests.

## Notes

### Critical file references

- `packages/meteoswiss-mcp/src/server.ts` — all 7 tool registrations (currently all via `server.tool()`, not `registerTool()`)
- `packages/meteoswiss-mcp/src/schemas/*.ts` — Zod input schemas with `.describe()` per field; output types are plain TS/JSDoc, not Zod
- `packages/meteoswiss-mcp/src/support/weather-icons.ts` — the one confirmed value-level residual (119-entry lookup table)
- `packages/meteoswiss-skills/skills/meteoswiss-ogd/REFERENCE.md` — already contains the "Canonical source" provenance comments this plan proposes to make machine-enforced
- `packages/meteoswiss-skills/skills/meteoswiss-ogd/README.md` — "Known Gaps" section, source of the `meteoswissClimateData` evidence
- `.github/workflows/pr-ci.yml` — existing `skill-validation` job, natural home for the new lint step
- `.github/workflows/claude.yml` — existing Claude Action + `ANTHROPIC_API_KEY`, reusable pattern for the narrowed drafting-aid follow-on

### SDK verification method

Findings above were checked against the actual installed dependency, not assumed: `npm pack @modelcontextprotocol/sdk@1.28.0`, extracted, and read `dist/esm/server/mcp.js`'s `ListToolsRequestSchema` handler and `dist/esm/server/mcp.d.ts`'s `registerTool` typings directly, plus confirmed `inMemory.js`/`Client.listTools()` exist for the in-process dump approach. In round 3 the in-process dump was then **actually executed** (after `pnpm install` repaired this worktree's `node_modules`): `createServer()` → `InMemoryTransport.createLinkedPair()` → `Client.listTools()` returned all 7 tools with full param names/types/descriptions/enums and no `outputSchema` — confirming both the mechanism and the round-3 vocabulary-mismatch finding documented in the Design section.

### Related

- PR #119 (this PR, being reworked) — round 1 lived at `docs/proposals/skills-mcp-parity.md`, removed by this round in favor of this plan file
- `docs/sessionlogs/2026-07-11-skills-mcp-parity-proposal.md` — round-1 sessionlog, extended (not replaced) with a round-2 section
- `docs/plans/2026-04-18-geocoding-workarounds-review.md` — the plan this document's structure/tone was modeled on, per Max's pointer
