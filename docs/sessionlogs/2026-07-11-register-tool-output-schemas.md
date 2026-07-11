# registerTool() + Zod Output Schemas for All 7 Tools

**Date:** 2026-07-11
**Model:** Claude Fable 5 (worktree `skills-mcp-parity`, branch `feature/register-tool-output-schemas`)
**Plan:** STEP A of `docs/plans/2026-07-11-skills-mcp-parity.md` (on PR #119) — resolved decision 1
**Related sessionlog:** `2026-07-11-skills-mcp-parity-proposal.md` (the parity plan's own log, rounds 1–4)

## Motivation

Prerequisite sub-task of the skills↔MCP parity plan: the parity lint's source of truth is the
generated `tools/list` output, and Max decided (PR #119 review, decision 1) that **output shape
must be part of that generated surface**, not just input params. Today's `server.tool()`
registrations (deprecated in SDK 1.28) declare only input schemas; response shapes were hand-written
TypeScript types invisible to the protocol. This PR migrates all 7 tools to `registerTool()` with
declared Zod `outputSchema`, so `tools/list` advertises the full contract and the SDK validates
every response at runtime. Independently valuable beyond the parity plan: MCP clients get
machine-readable output shapes with per-field descriptions, and `structuredContent` responses.

## What changed

- **Schemas** (`src/schemas/`): each tool's response type converted from a hand-written TS type to
  a Zod schema, with the exported type names preserved via `z.infer` aliases — zero churn for
  importers, and the compiler verifies the schemas structurally match what the data layer actually
  returns (data functions are annotated with these same type names). The rich JSDoc semantics
  (nullability rules, station-vs-postal-code sourcing caveats, the `hourly: null` vs `[]`
  distinction) moved into `.describe()` calls so they are now part of the wire-visible schema —
  which is exactly what the parity lint (STEP B) will consume.
  - `ogd-local-forecast.ts`: `HourlyEntrySchema`, `DailyForecastSchema`, `LocalForecastResponseSchema`
  - `ogd-current-weather.ts`: `MeasurementValueSchema`, `CurrentWeatherResponseSchema`
  - `ogd-station-list.ts`: `StationListEntrySchema`, `StationListResponseSchema`
  - `ogd-pollen-data.ts`: `PollenMeasurementSchema` (discriminated union on `status`),
    `StationPollenDataSchema`, `PollenDataResponseSchema`
  - `ogd-climate-data.ts`: `ClimateMeasurementSchema`, `ClimateDataResponseSchema`
  - `meteoswiss-search.ts`: `SearchResultItemSchema`, `SearchResultsSchema` (moved from
    `data/meteoswiss-search-data.ts`, which now re-exports the types)
  - `meteoswiss-fetch.ts`: `ContentResponseSchema` (moved from `data/meteoswiss-content-data.ts`)
- **`src/server.ts`**: all 7 registrations migrated
  `server.tool(name, desc, shape, handler)` → `server.registerTool(name, { description,
  inputSchema, outputSchema }, handler)`. Descriptions unchanged verbatim. Every success path now
  returns `structuredContent` alongside the existing JSON text `content` (kept for compatibility).
  Error paths unchanged (`isError: true`, content-only) — verified in the installed SDK source that
  `validateToolOutput` explicitly skips validation for `isError` results.
- **`src/tools/meteoswiss-fetch.ts`**: return type tightened `Promise<unknown>` →
  `Promise<ContentResponse>` (needed for typed `structuredContent`; also better per repo standards).
- **`CLAUDE.md`**: the "MCP Tool Implementation" checklist now describes the `registerTool()` +
  output-schema + `structuredContent` pattern.
- **Changeset**: `register-tool-output-schemas.md`, minor bump (additive; response shapes unchanged).

## Decisions and rationale

- **`z.infer` aliases instead of keeping parallel TS types**: the data layer's return-type
  annotations reference the same exported names, so `tsc` proves schema↔runtime-shape equivalence at
  compile time. `tsc` passed on the first run after conversion — the schemas are exact structural
  matches of the old types.
- **Error results stay content-only**: SDK 1.28's `validateToolOutput` returns early on
  `result.isError` (read the installed `dist/esm/server/mcp.js`, not assumed), so no
  `structuredContent` is required or emitted on error paths.
- **Descriptions into `.describe()`**: deliberate for the parity plan — output-field semantics are
  now machine-extractable from `tools/list` instead of living only in source comments.
- **No `title`/`annotations`**: out of scope; pure migration plus output schemas.

## Verification

- `pnpm run fix && pnpm run ci` green: tsc lint, eslint, build, jest — 22 suites, 205 passed,
  1 pre-existing skip (documented macOS port-mapping flake).
- The integration suite runs through a real MCP client harness (`test/integration/mcp-client.ts` →
  `client.callTool(...)`), so the SDK's output validation executed against fixture data for every
  tool call in those tests — runtime proof the declared schemas accept real responses.
- Direct in-process probe (`createServer()` → `InMemoryTransport` → `Client`): all 7 tools now
  advertise `outputSchema` in `tools/list` (verified field lists per tool), and a live
  `callTool('meteoswissStations', { canton: 'ZH', limit: 3 })` returned validated
  `structuredContent` (`total: 4`, 3 stations).

## Result

- Branch `feature/register-tool-output-schemas` (off `origin/main` at `7d9879b`), PR to `main`.
- STEP B (`infra/skills-parity-lint`) is blocked on this landing.

## Copilot review fixes

Copilot's automated review found one real issue, fixed:

1. **`pageSize` description overclaimed.** The new protocol-visible describe() text said "fixed at
   10 by the upstream API", but the implementation sets `pageSize: results.length` (fewer on the
   last page, `0` on the empty/error path). Verified against `meteoswiss-search-data.ts` before
   accepting, then reworded to "Number of items in `results` for this page — at most 10 (the
   upstream API pages by a fixed 10), fewer on the last page". `pnpm run fix && pnpm run ci`
   re-run green (22 suites, 205 passed, 1 pre-existing skip).

## Delivery

Max pre-authorized the pipeline (no per-PR merge approval needed). Delivery per the standard
policy: Copilot loop run to convergence (round 2 re-review: "reviewed 14 out of 14 changed files
… generated no new comments"), the review-fix commit rebase-folded into the feature commit
(single-commit history, `--force-with-lease`), CI green awaited on the rebased head, then merged
with a merge commit (no squash).

## Pending / follow-ups

- [ ] STEP B (`infra/skills-parity-lint`): the parity lint consumes the now-complete generated
      tool inventory.
