# Skills ↔ MCP Parity: Proposal (round 1) → Plan (round 2)

**Date:** 2026-07-11 (both rounds, same day — round 2 is Max's PR review feedback on round 1)
**Model:** Claude Opus 4.8 (planning) + Claude Sonnet 5 (writing), worktree `skills-mcp-parity`, branch `worktree-skills-mcp-parity`
**PR:** [#119](https://github.com/eins78/meteoswiss-llm-tools/pull/119) (draft)

This log covers both rounds of the same PR. Round 1 (below, unedited) produced a free-form design
proposal. Round 2 (bottom of this file) reworks it into a Plot plan per Max's review feedback — see
that section for what changed and why.

---

## Round 1 — initial proposal

## Motivation

Max asked for a design proposal — not an implementation — on how to keep `packages/meteoswiss-skills`
(the `meteoswiss-ogd` skill) in sync with `packages/meteoswiss-mcp` (the MCP server) as the server's
tools evolve. He seeded a specific idea: a Claude-powered GitHub Action that runs on changeset release
PRs, checks whether MCP-server changes have a corresponding skills change, and fails/complains if
parity is missing — with a lean toward enforcing on every PR (not just release PRs) since skill
updates are cheap relative to MCP changes, and folding parity into a Definition of Done. The explicit
ask was to evaluate, build on, and pressure-test that seed, not rubber-stamp it — and to stop short of
building any of the actual mechanism.

## Key finding (before any design work)

Three parallel Explore agents grounded the proposal in the real repo state. The decisive finding: **a
coupling map already exists, informally, as prose.** `packages/meteoswiss-skills/skills/meteoswiss-ogd/REFERENCE.md`
already opens with hand-written provenance comments —
`<!-- Canonical source: packages/meteoswiss-mcp/src/support/weather-icons.ts and src/schemas/ogd-shared.ts -->`
/ `<!-- If MeteoSwiss updates parameters or icons, update both this file and the MCP server source. -->` —
and the skill's `README.md` lists the exact MCP source modules it was extracted from. This single fact
reframes the entire design: it's what upgrades a "path-based heuristic" from *crude* (package touched
vs. package touched — the task brief's own framing) to *precise* (specific mapped canonical file
touched → specific mapped skill file/section touched).

Second finding used as motivating evidence: `meteoswissClimateData` already has a full MCP tool with
**zero skill coverage** — the skill's own README "Known Gaps" section admits this. Nothing caught that
drift except a human writing it down after the fact. This is the failure mode the proposal aims to
prevent, cited directly rather than fixed (out of scope for a proposal-only task).

Third finding that de-risked the Claude-in-CI half of the idea: `.github/workflows/claude.yml` already
runs `anthropics/claude-code-action@beta` in this repo, with an existing `ANTHROPIC_API_KEY` secret and
read-only, least-privilege permissions. No new secret or trust boundary is needed for a Phase 2 Claude
judge.

Fourth, procedural finding that shapes *where* any check can run: `.changeset/*.md` frontmatter names
each affected package explicitly, but the Version Packages PR (`version-packages.yml`) **consumes and
deletes** those changeset files as part of bumping versions. By the time a `release: published` event
fires, no changesets remain at all — so any parity signal has to be evaluated on the original feature
PR, not on the release flow.

## Decisions and rationale (the non-obvious part)

Consulted the `advisor` tool before committing to a recommendation, specifically to pressure-test
whether Claude should be the centerpiece (as Max's seed implied) or something narrower. Its reframe,
adopted directly:

### Deterministic manifest gate is the workhorse; Claude is a bounded, permanently-advisory Phase 2

With one skill and roughly five mapped canonical files (schema files, `weather-icons.ts`), a
deterministic file-diff against a formalized `parity-map.yml` likely carries on the order of 80% of
the value on its own — zero nondeterminism, zero API cost, no LLM-judgment false-positive risk.
Claude's genuine value is narrow and specific: distinguishing user-facing vs. internal-plumbing intent
*inside* the broader `src/data/ogd-*.ts` modules, which mix HTTP/caching logic with actual output
shaping in the same file — a distinction a pure path diff can't resolve. Landed on: the deterministic
manifest-diff gate blocks (once promoted in Phase 3); Claude never blocks, ever, even after tuning —
it's a nuance layer on top of an already-flagged PR, not a merge gate. This takes Max's seed seriously
(Claude gets a real, scoped job) without making it the foundation.

### Asymmetric coupling, not bidirectional

The task brief said "and vice-versa," but the repo's own provenance comments establish MCP source as
canonical and the skill as derived documentation of the same API surface. A server-side change to
parameters/output shape/icons is a real drift risk; a skill-only wording edit essentially never needs
a server change. Decided to design for the MCP→skill direction only and state this explicitly as a
scoping decision rather than silently narrowing scope or forcing a symmetric design that doesn't match
the repo's actual risk profile.

### Ranked, not equally-weighted, detection signals

Three real signals were surfaced (manifest-driven path diff, changeset-frontmatter mismatch, raw
package-path diff) and explicitly ranked by precision rather than presented as equal options: manifest
diff is the only one precise enough to block on; changeset-frontmatter mismatch is too noisy (packages
version independently; most mcp changesets legitimately need no skill change) so it's advisory-only at
most; raw package-path diff is rejected as primary and kept only to explain why the manifest is an
improvement over it.

### Every PR, not release-PR-only — but for a sharper reason than "cheap"

Validated Max's every-PR instinct, but reframed the justification: the manifest-diff job is free to run
on every PR specifically because it's a fast deterministic file diff that only produces a signal when a
mapped file is touched — unrelated PRs pay approximately zero cost. This is a more defensible argument
than "skill updates are cheap relative to MCP changes," which doesn't actually justify running the
*check* on every PR (it justifies making the *fix* easy, a different claim).

### Escape hatch: commit trailer recommended over label

Two mechanisms proposed (`skills-parity: n/a` PR label vs. `Skills-Parity: n/a — <reason>` commit
trailer), with the trailer recommended as primary specifically because it's durable — greppable in
`git log` forever, survives independently of GitHub PR state, and remains visible even after the
associated changeset is consumed on the Version Packages PR. The label is kept as an optional
UI affordance, not dropped, and the choice between them is deliberately left as an open question for
Max rather than decided unilaterally, since it's a workflow-preference call, not a technical one.

### Phased rollout, not a day-one blocker

Phase 0 (DoD text + PR template + CONTRIBUTING + committed `parity-map.yml`, zero automation) → Phase 1
(deterministic gate wired into `pr-ci.yml`, every PR, advisory comment only) → Phase 2 (bounded Claude
judge, still advisory, invoked only on Phase-1 flags) → Phase 3 (promote the *deterministic* gate —
never the Claude judge — to a required status check once false-positive rate is proven low). Mirrors
this repo's own stated practice of never merging with failing required checks, and avoids introducing
a new required check with an unproven false-positive rate.

## Deliverable

- `docs/proposals/skills-mcp-parity.md` (169 lines): TL;DR/recommendation, context & motivation, scope
  decision (5 OGD tools in; `search`/`fetch` out), detection-mechanism comparison table + precision
  ranking + illustrative `parity-map.yml` sketch, enforcement placement & rationale, escape-hatch
  tradeoff, Definition of Done checklist text + three proposed locations, Claude-in-CI cost/failure
  modes (API key reuse, bounded token cost, fail-open on outage, prompt-injection mitigation mirroring
  `claude.yml`), phased rollout table, and four open questions for Max.
- Planned with Opus (structure, exploration synthesis, advisor consultation), written with a delegated
  Sonnet agent following the approved plan verbatim, then read back in full and verified against
  exploration findings before committing — per the task's explicit "plan with opus, write with sonnet"
  instruction.
- No workflow YAML, `parity-map.yml`, PR template, or CONTRIBUTING.md was created — proposal-only, as
  instructed.

## Result

- Commit `15a6669` on branch `worktree-skills-mcp-parity`, pushed to origin.
- Draft PR [#119](https://github.com/eins78/meteoswiss-llm-tools/pull/119) opened against `main`,
  titled "Proposal: skills↔MCP parity enforcement", for Max to review/comment on inline.

## Open questions relayed to Max (in the proposal, section 10)

- [ ] Should `search`/`fetch` be in scope for parity checking in some form, despite having no
      OGD-skill equivalent today?
- [ ] Label vs. commit-trailer for the escape hatch — proposal recommends the trailer for durability,
      but this is a workflow-preference call.
- [ ] The skill package's separate, already-known problem of manually syncing its version string
      across four metadata files (`SKILL.md` frontmatter, `.claude-plugin/plugin.json`,
      `.claude-plugin/marketplace.json`, `.cursor-plugin/plugin.json`) — flagged as related but out of
      scope for `parity-map.yml` as designed, not silently dropped.
- [ ] Should the `meteoswissClimateData` gap be closed now as the first real proof the process (once
      built) works end-to-end?

## Round 1 status at handoff

- Commit `15a6669` on branch `worktree-skills-mcp-parity`, pushed to origin; PR #119 draft.
- Awaiting review — no implementation started, intentionally gated on Max's decision on the open
  questions above.

---

## Round 2 — reworked into a Plot plan

Max reviewed PR #119 and asked for four changes, delivered in this round:

1. **Reframe as a Plot plan, not a proposal.** Invoked the `plot:plot-idea` skill to get the exact
   plan template and conventions (pointed at the precedent: `docs/sessionlogs/2026-04-18-geocoding-plot-idea.md`
   and its plan, `docs/plans/2026-04-18-geocoding-workarounds-review.md`, which extends the base
   template with `### Findings` / `### Options` / `### Tentative recommendation` / `### Non-goals`
   subsections — used the same shape here). Deleted `docs/proposals/skills-mcp-parity.md` (round 1's
   home) and replaced it with `docs/plans/2026-07-11-skills-mcp-parity.md` + the
   `docs/plans/active/skills-mcp-parity.md` symlink, per the Plot Config in the repo's `CLAUDE.md`.
   Deliberately **did not** run the rest of `/plot-idea` (no new `idea/<slug>` branch, no new PR) —
   Max explicitly said to keep working on the existing `worktree-skills-mcp-parity` branch/PR #119,
   so only the plan-file convention was adopted, not the branch-naming one. Noted this deviation
   explicitly in the plan's **Branches** section rather than silently diverging from the skill's
   normal flow.

2. **Rethink the source of truth.** Max was explicit: don't default to YAML — investigate whether
   source code, the MCP server's tool surface, or generation from the MCP inspector beats a
   hand-written manifest. Rather than reason from memory about what the MCP TypeScript SDK supports,
   downloaded and read the actual installed version: `npm pack @modelcontextprotocol/sdk@1.28.0`,
   extracted it, and grepped `dist/esm/server/mcp.js`'s `tools/list` handler directly. Confirmed
   concretely:
   - Every tool's `inputSchema` (name, type, and the `.describe()` text already written throughout
     `src/schemas/*.ts`) is already mechanically derivable from the live server via `tools/list` —
     no hand-transcription needed, today, with zero code changes.
   - `tools/list` also emits `outputSchema` when a tool is registered via the newer `registerTool()`
     API with a declared Zod output schema — this repo's 7 tools all use the older `server.tool()`
     signature with plain-TS-type outputs, so output shape isn't protocol-visible yet, but the SDK
     genuinely supports closing that gap (verified in the SDK source, not assumed).
   - Confirmed `InMemoryTransport` + `Client.listTools()` both exist in the SDK, meaning the
     generation step can run in-process (`createServer()` → linked in-memory client → `listTools()`)
     without shelling out to `npx @modelcontextprotocol/inspector` or running an HTTP server — same
     data the inspector CLI's `--method tools/list` would return (that CLI mode is real too, and is
     explicitly documented for CI use; it's the manual/local equivalent, already reachable via the
     existing `pnpm run dev:inspect` script).
   - Isolated the actual residual that no schema can express: `src/support/weather-icons.ts` (a
     119-entry value lookup table, not a schema shape) and a couple of prose-only gotchas
     (Latin1 CSV encoding, the STAC "forcasting" typo) the skill documents with no schema analogue.
   - Landed on: generated `tools/list` output is the source of truth for tool/param completeness;
     a much smaller `parity-exceptions.yml` survives only for that residual, and is explicitly never
     consulted for tool/param completeness — full detail and the comparison table are in the plan
     file, not duplicated here.

3. **Make linting mandatory.** Max's directive — "the lint fails the build on drift" — overrides
   round 1's advisory-first phasing. Reworked the plan's enforcement section accordingly: the check
   is a hard, required gate from the point it lands, with only a one-time bake-in commit (to seed
   `parity-exceptions.yml` against the current codebase before the gate goes live) as a mechanical
   softening, not a policy one. This also simplified round 1's Phase 1→2→3 rollout: with completeness
   and staleness now deterministic and generated, Claude's role shrank from "judge whether drift
   matters" (now answered mechanically by the lint) to a narrower, still-optional job — drafting a
   suggested skill-doc diff once the lint has already flagged something. Kept explicitly out of the
   blocking path.

4. **Pursue Max's lean seriously, document any divergence.** Did not diverge from the core lean (map
   against the MCP server, generate from tool-list introspection, lint completeness + staleness) — it
   held up under verification. The one place this plan adds nuance rather than following the lean
   literally: a small `parity-exceptions.yml` still exists, because a handful of things (the icon
   table, prose gotchas) are structurally invisible to any schema-based introspection, generated or
   not. This is flagged in the plan as an explicit, narrow exception to "generate everything," not a
   silent reintroduction of the hand-maintained manifest Max pushed back on — its scope is a small
   fraction of round 1's manifest and it's linted for staleness itself.

### Result

- New plan file: `docs/plans/2026-07-11-skills-mcp-parity.md`, plus `docs/plans/active/skills-mcp-parity.md`
  (symlink). Round 1's `docs/proposals/skills-mcp-parity.md` removed (`git rm`).
- This sessionlog extended in place (this section) rather than replaced, per the new "sessionlog
  must ship inside the PR" policy — one coherent file covering both rounds.
- Commit pending push to `worktree-skills-mcp-parity` / PR #119 (draft, unchanged PR number).

### Open questions carried into round 2 (plan's own Open Questions section has the full list)

- [ ] `registerTool()` + Zod `outputSchema` migration — prerequisite/companion plan, or is
      input-side generation + a small residual exceptions file good enough long-term?
- [ ] `search`/`fetch` scope — unresolved from round 1.
- [ ] Bake-in step ownership/timing — part of the implementation PR, or its own PR right before the
      gate flips to blocking?
- [ ] Does the skill's separate 4-location manual version-sync problem belong in the same lint script?
- [ ] Close the `meteoswissClimateData` gap as the bake-in's first real content addition?

---

## Round 3 — implementation started, then paused on a design finding (ON HOLD)

Max approved the round-2 plan and said to implement. Began by validating the plan's central
assumption against the real code before writing any linter — and that validation surfaced a
load-bearing finding the plan did not anticipate, which paused implementation.

### Confirmed (as the plan predicted)

- Ran a real in-process introspection: `pnpm install` to repair the worktree's broken `.pnpm`
  symlinks (root `node_modules` was absent — the known `project_worktree_node_modules_drift`
  condition), then spun up `createServer()` over `InMemoryTransport`, connected an SDK `Client`, and
  called `listTools()`. It returned all 7 tools with descriptions and every input parameter's name,
  type, `.describe()` text, and enum values. No `outputSchema` on any tool (all use `server.tool()`),
  exactly as the plan said. So the generated-inventory source of truth is real and works today.

### The finding that paused things (contradicts the plan's *matching* mechanism)

The plan's completeness check was specified as: "for every tool name and every input-parameter name
in the generated dump, assert it's mentioned somewhere in `SKILL.md`/`REFERENCE.md`." Measured this
against the actual skill and it does **not** hold:

- **Tool names: 0 mentions.** `meteoswissLocalForecast`, `meteoswissCurrentWeather`,
  `meteoswissStations`, `meteoswissPollenData`, `meteoswissClimateData` each appear **zero** times in
  the skill. The skill is organized by *capability* (`## 1. Get Current Weather`, `## 2. Find
  Stations`, …), not by MCP tool name — it teaches direct curl access and never names the tools.
- **Param names: mostly 0.** The skill documents raw OGD parameter codes (`tre200s0`) and CSV column
  names, not the tool's calling interface. Literal coverage: `station` 13, `search` 6, everything
  that actually distinguishes a capability param — `location`, `days`, `coordinates`, `canton`,
  `resolution`, `start_date`, `end_date` — is **0**.

So literal name-matching (tool or param) can't be the gate — it would fail all 5 OGD tools on day one.
Building a param alias table (`location`→"postal code"/"place name", …) was considered and rejected:
it drift-prone and hand-maintained, i.e. it recreates the exact manifest Max rejected, at param
granularity. Keyword heuristics were also rejected (a keyword being present ≠ skill current).

### Advisor-validated redesign for the STRUCTURAL gate (design only — not yet built)

Two small, generated-in-spirit, hard-fail pieces that survive Max's "no hand-maintained inventory"
constraint:

1. **Per-tool coverage markers in the skill** — an HTML comment like `<!-- mcp-tool: meteoswissCurrentWeather -->`
   beside each capability section. This is the completeness enforcer and a natural evolution of the
   skill's *existing* `<!-- Canonical source: … -->` convention. Co-located, so it can't silently
   drift: add a tool → red until a section+marker exists; rename/remove a tool → stale marker → red.
2. **A committed generated inventory snapshot** the linter diffs against the live server each run —
   the param/description drift catcher. "Generated, not hand-edited" in Max's exact spirit; staleness
   is structurally impossible because it's diffed against the real server every run.

Markers = coverage; snapshot = drift. Both deterministic and hard-fail. Crucial framing correction:
these verify **structure** (every tool is *mentioned/marked*, no *dead references*) — they do **not**
verify semantic parity (whether the skill *correctly describes* the tool). Calling that "parity"
would overclaim.

### Max's HOLD (received mid-session) — reframe to two layers

Max is rethinking the design around exactly that structural-vs-semantic distinction. Likely new
shape:

1. **A static coverage + staleness GATE** — roughly the structural pieces above, but explicitly
   scoped and *labelled* as structural (mentioned + no-dead-refs), not "parity".
2. **An agent** that reads a structured report + the tool schemas + the skill and judges *semantic*
   parity (whether the skill's descriptions match the tools). Runs on release PRs; verdict likely
   advisory, not a hard block.

Instruction: stop expanding the static linter, preserve the finding, do **not** rework the plan doc
yet, and wait for the confirmed two-layer design.

### State at hold

- **No linter implementation code was written** — implementation paused at the design-fork advisor
  consult, before any gate code, so there is nothing half-built to commit. This sessionlog entry is
  the durable record of the finding + design direction, committed so it survives the wait.
- `pnpm install` was run to make introspection testable; it repaired local `node_modules` only (no
  lockfile change, nothing to commit there). Its `postinstall` also copied the skill to
  `~/.claude/skills/` as a side effect — local-only, outside the repo.
- Plan doc left untouched, per instruction.

## Pending / follow-ups

- [ ] **Waiting on Max's confirmed two-layer design** before building the structural gate.
- [ ] When it lands: build layer 1 as an explicitly-labelled **structural coverage + staleness gate**
      (tool markers + inventory snapshot, per the finding above) — not "parity".
- [ ] Layer 2 (agent semantic judge on release PRs, advisory) — design TBD by Max.
- [ ] Two calls still Max's, unchanged by the reframe: param-level strictness of the static gate, and
      how the `meteoswissClimateData` gap is resolved for day-one green (out-of-scope-with-reason +
      follow-up, vs. authoring a skill section — the latter needs live-verified NBCN curl, so not to
      be done unilaterally).
- [ ] PR #119 stays a draft — not marking ready-for-review until the gate is built, CI-wired, green,
      and Max's two calls are answered.
