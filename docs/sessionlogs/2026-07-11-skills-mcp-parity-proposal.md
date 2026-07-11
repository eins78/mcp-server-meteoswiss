# Proposal: Skills ↔ MCP Parity Enforcement

**Date:** 2026-07-11
**Model:** Claude Opus 4.8 (planning) + Claude Sonnet 5 (writing), worktree `skills-mcp-parity`, branch `worktree-skills-mcp-parity`
**PR:** [#119](https://github.com/eins78/meteoswiss-llm-tools/pull/119) (draft)

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

## Pending / follow-ups

- [ ] PR #119 is a draft, not merged — awaiting Max's review and answers to the open questions above.
- [ ] No implementation work (workflow YAML, `parity-map.yml`, PR template, CONTRIBUTING.md) has
      started; it is intentionally gated on Max's decision on the open questions.
