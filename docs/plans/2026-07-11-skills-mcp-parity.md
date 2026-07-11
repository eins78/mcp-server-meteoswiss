# Plan: Skills ↔ MCP Parity Enforcement

> Keep `packages/meteoswiss-skills` in sync with `packages/meteoswiss-mcp` by generating the parity contract from the live MCP tool list (not a hand-maintained manifest), and linting it for completeness + staleness as a required, build-failing CI check.

## Status

- **Phase:** Draft
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
| Same, extended to output shape via `registerTool()` + Zod `outputSchema` | **Not yet available; real, SDK-verified option** | Confirmed the SDK supports it (`tool.outputSchema` flows into `tools/list`). Would close the output-shape gap (e.g. `DailyForecast.precipitation.hourly`) the same way. Left as an explicit open question — it's a genuine migration of all 7 tool registrations, out of scope for the parity mechanism itself. |

**Residual that no schema can express**, regardless of the above: value-level content, not shape. Concretely, `src/support/weather-icons.ts` is a 119-entry `Record<number, string>` — a lookup table, not a schema shape, so it never appears in `tools/list` no matter how the tool is registered. Same for prose tribal knowledge the skill documents that has no schema analogue at all (`REFERENCE.md`'s Latin1-encoding note, the STAC asset-key "forcasting" typo). These two or three items are the **only** things left needing a hand-authored pointer.

### Recommendation

1. **Source of truth for tool/param completeness = the generated `tools/list` output**, produced in-process from `createServer()` (SDK `Client` + `InMemoryTransport`), not from source files and not from a hand-written map.
2. **A small `parity-exceptions.yml` survives, but only for the non-schema-representable residual** (currently: the icon-code table, and any prose-only gotchas the skill documents that have zero schema counterpart). It is explicitly *not* consulted for tool/param completeness — that's fully generated. Each entry names a concrete symbol/file on the server side and a concrete file/anchor on the skill side, e.g.:

   ```yaml
   # Non-schema residual only. Tool/param parity is generated from tools/list — do not add entries for those here.
   exceptions:
     - source: packages/meteoswiss-mcp/src/support/weather-icons.ts
       skill: packages/meteoswiss-skills/skills/meteoswiss-ogd/REFERENCE.md#icon-codes
       reason: value-level lookup table, not a schema shape — invisible to tools/list
     - source: packages/meteoswiss-mcp/src/support/ogd-csv-parser.ts
       skill: packages/meteoswiss-skills/skills/meteoswiss-ogd/SKILL.md
       reason: "Latin1 CSV encoding gotcha — tribal knowledge, no schema analogue"
   ```

3. **Lint, in two parts, both hard-blocking (fails the build on drift):**
   - **Completeness**: for every tool name and every input-parameter name in the generated `tools/list` dump, assert it's mentioned somewhere in `SKILL.md` or `REFERENCE.md` (name match against headings/table cells/inline code spans). Any tool or param with zero mentions fails the check, listing exactly what's missing.
   - **Staleness**: the inverse, in both directions —
     - every `source:` entry in `parity-exceptions.yml` must resolve to a file that still exists (`fs.existsSync`) and, where a symbol name is implied by the reason, that symbol must still be found in that file (a simple grep, not full semantic parsing);
     - the skill's own "Canonical source" provenance comments (already present in `REFERENCE.md` today, e.g. `<!-- Canonical source: .../weather-icons.ts and src/schemas/ogd-shared.ts -->`) are parsed the same way and must resolve to real files too — this makes the *skill's own existing convention* part of the enforced contract, not a separate thing to invent.
   - Both checks run as one script (proposed location: `packages/meteoswiss-mcp/scripts/lint-skills-parity.ts`, since it needs to import `createServer()`), wired into CI as a new job or step alongside the existing `skill-validation` job in `.github/workflows/pr-ci.yml`.

### Enforcement — hard requirement, not advisory

Max's directive supersedes round 1's "advisory-first" phasing: the lint fails the build on drift, full stop, once it lands. The only softening this plan proposes is mechanical, not a policy exception: a one-time bake-in run before the check is wired as blocking, to generate the initial `parity-exceptions.yml` against the current codebase's actual residual (the icon table + known prose gotchas) so day one doesn't fail on pre-existing, legitimate exceptions. After that bake-in commit, the check is blocking from the next PR onward. This mirrors how `pr-ci.yml`'s other jobs (`lint-build-test`, `docker-build`) already work — required, not advisory — rather than introducing a new, softer enforcement tier for this one check.

Runs on every PR (validated, unchanged from round 1): the generation step is a fast in-process call, not a network operation, so cost is negligible regardless of whether a mapped file changed.

### Escape hatch, reframed

Round 1 proposed a PR label or commit trailer as an ad hoc "skip this check" mechanism. With the mapping now generated rather than hand-maintained, the honest escape hatch is narrower and more accountable: a genuinely skills-irrelevant server change (internal refactor, caching tweak) touches no tool name, no input parameter, and nothing in `parity-exceptions.yml` — so the lint simply doesn't fire; there is nothing to suppress. The only case needing an explicit override is a deliberate, permanent scope decision (e.g. "this tool will never have skill coverage") — for that, add it to `parity-exceptions.yml` with a `reason:`, reviewed like any other code change, rather than a per-PR label that has to be reapplied and leaves no durable trail.

### Claude's role, narrowed

Round 1 floated Claude as a semantic judge deciding *whether* a change needs a skill update. With completeness/staleness now deterministic and generated, that judgment call mostly disappears — the lint already knows precisely which tool/param is undocumented. The remaining, genuinely useful job for Claude (still optional, still not part of the blocking mechanism) is narrower and more mechanical: once the lint fails, **draft the actual skill-doc diff** (a suggested addition to `REFERENCE.md`/`SKILL.md` for the flagged tool/param, using the same read-only `claude.yml` pattern and existing `ANTHROPIC_API_KEY` already in this repo) as a PR comment or suggestion — content generation, not gatekeeping. Left as a follow-on, not part of this plan's required scope.

### Options considered and rejected

- **Keep the round-1 hand-written `parity-map.yml` as source of truth.** Rejected per Max's explicit skepticism and the finding above — it can't be more trustworthy than the thing it's describing, since nothing forces it to track the server.
- **Map against raw source files instead of the MCP server.** Rejected — see table above; pushes the "what counts as user-facing" judgment call onto a human-maintained file list instead of the protocol boundary, which is a worse fit for what the skill is actually mirroring (the tool contract, not the file tree).
- **Full migration to `registerTool()` + Zod output schemas as a prerequisite of this plan.** Considered, not adopted here — it's real and would close the output-shape gap, but it's a 7-tool migration orthogonal to the parity mechanism itself. Flagged as an open question / natural follow-on rather than blocking this plan on it.

### Open Questions

- [ ] Should the `registerTool()` + Zod-`outputSchema` migration be scoped as a prerequisite/companion plan, so output shape (not just input params) becomes fully generated too — or is the input-side generation + small exceptions file for output/value residuals good enough long-term?
- [ ] Should `search`/`fetch` be in scope at all? They're MeteoSwiss-website tools with no OGD-skill equivalent by design — same open question as round 1, unresolved.
- [ ] Bake-in step: who runs it and when — as part of landing this plan's implementation PR, or as a separate PR immediately before the lint is flipped to blocking?
- [ ] Does the skill package's separate, already-known problem — its own version string manually synced across 4 metadata files (`SKILL.md` frontmatter, both `plugin.json`s, `.claude-plugin/marketplace.json`) — belong in the same lint script, or is it unrelated enough to leave for its own plan?
- [ ] Should `meteoswissClimateData`'s existing gap be closed as the bake-in's first real content addition, proving the generated-completeness check actually catches what it's meant to catch?

### Non-goals

- No workflow YAML, lint script, or `parity-exceptions.yml` is created by this plan — planning only, per round 1's constraint (carried forward).
- No decision here on the `registerTool()`/output-schema migration — flagged as an open question, not scoped into this plan's implementation.
- Not proposing to drop the Claude-in-CI idea entirely — narrowed to an optional drafting aid, explicitly out of the blocking path.

## Branches

- Continuing on the existing branch `worktree-skills-mcp-parity` / PR #119, per explicit instruction — not opening a fresh `idea/<slug>` branch via `/plot-idea`, even though this document now follows the Plot plan template. `docs/plans/active/skills-mcp-parity.md` is added as the active-plan symlink so this shows up in the normal plan index despite the branch-naming deviation.
- Follow-on implementation branch (once approved): `infra/skills-parity-lint` — adds the generation script, `parity-exceptions.yml` bake-in, and the CI wiring described above.

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

Findings above were checked against the actual installed dependency, not assumed: `npm pack @modelcontextprotocol/sdk@1.28.0`, extracted, and read `dist/esm/server/mcp.js`'s `ListToolsRequestSchema` handler and `dist/esm/server/mcp.d.ts`'s `registerTool` typings directly, plus confirmed `inMemory.js`/`Client.listTools()` exist for the in-process dump approach. Local `node_modules` in this worktree are not installed (pre-existing `project_worktree_node_modules_drift` condition), so the registry tarball was used instead of a local `require`.

### Related

- PR #119 (this PR, being reworked) — round 1 lived at `docs/proposals/skills-mcp-parity.md`, removed by this round in favor of this plan file
- `docs/sessionlogs/2026-07-11-skills-mcp-parity-proposal.md` — round-1 sessionlog, extended (not replaced) with a round-2 section
- `docs/plans/2026-04-18-geocoding-workarounds-review.md` — the plan this document's structure/tone was modeled on, per Max's pointer
