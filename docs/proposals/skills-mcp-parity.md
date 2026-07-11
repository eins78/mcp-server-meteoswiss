# Proposal: MCP ↔ Skills Parity Enforcement

Status: proposal (not implemented). Author: Claude Code, on behalf of Max Albrecht. Date: 2026-07-11.

## 1. TL;DR / Recommendation

Formalize the existing prose provenance comments in `packages/meteoswiss-skills/skills/meteoswiss-ogd/REFERENCE.md` (e.g. `<!-- Canonical source: packages/meteoswiss-mcp/src/support/weather-icons.ts and src/schemas/ogd-shared.ts -->`) into a machine-readable manifest, `parity-map.yml`. Use that manifest to drive a **deterministic path-diff gate** as the primary, eventually-blocking mechanism. Add a **Claude-based semantic judge only as a bounded, permanently-advisory Phase-2 enhancement** — not as the foundation of the system.

This takes Max's seed idea (a Claude Action gating changeset release PRs) seriously but reframes where the leverage actually is: the manifest is what turns a coarse package-vs-package heuristic into a precise file-vs-file one, and that precision alone likely covers most of the value, deterministically and for free.

Phased rollout, in one line each:
- **Phase 0** — write the DoD checklist, PR template, `CONTRIBUTING.md`, and commit `parity-map.yml`. Pure process, zero automation.
- **Phase 1** — wire a deterministic manifest-diff job into `.github/workflows/pr-ci.yml`, running on every PR, advisory (PR comment) only.
- **Phase 2** — add a bounded Claude judge, invoked only when Phase 1 already flagged a mapped-file change, still advisory only.
- **Phase 3** — once false-positive rate is proven low, promote the *deterministic* gate (never the Claude judge) to a required status check.

## 2. Context & motivation

Two independently-versioned public packages must stay in sync:

- `packages/meteoswiss-mcp/` — the MCP server. Tool registration in `src/server.ts`, parameter/output schemas in `src/schemas/*.ts` (`ogd-shared.ts` + per-tool files), business logic in `src/data/*.ts`, supporting plumbing (icons, HTTP, caching) in `src/support/*.ts`.
- `packages/meteoswiss-skills/` — the `meteoswiss-ogd` skill, which teaches an agent to hit the same OGD API directly via curl/bash when no MCP server is available. Its `README.md` and `REFERENCE.md` already document, in prose, which MCP source files they were extracted from.

The coupling is **asymmetric**, and the repo's own comments already say so: the MCP source is canonical, the skill is derived documentation of the same underlying API surface. A server-side change to parameters, output shape, or icon mappings is a real drift risk. A skill-only edit (wording, an extra example, a curl-flag tweak) essentially never requires a server change. Despite the task brief's mention of "and vice-versa," this proposal deliberately does **not** design a symmetric bidirectional gate — it targets the MCP→skill direction only, and calls that out as a scoping decision rather than an oversight.

Today there is **no automation** keeping them in sync — only the human convention embodied in those provenance comments. Concrete evidence the convention alone isn't enough: `meteoswissClimateData` has a full MCP tool but **zero skill coverage** — the skill's own README "Known Gaps" section already admits this, pending MeteoSwiss publishing `ch.meteoschweiz.ogd-climate-normals`. Nothing caught that gap opening up except a human writing it down after the fact.

`skill-validation` in `pr-ci.yml` (`pnpm --filter meteoswiss-skills test`, i.e. `skills add . --list`) checks skill package format, not parity with the MCP server — it would pass today even if `weather-icons.ts` changed with no corresponding skill update.

Two other CI facts shape the design below:

- `.github/workflows/claude.yml` already runs `anthropics/claude-code-action@beta` in this repo, triggered by `@claude` mentions in issues/PR comments, using the existing `ANTHROPIC_API_KEY` secret, with read-only permissions. This establishes the API key, the action, and the least-privilege pattern this proposal reuses for Phase 2 rather than inventing a new one.
- No branch protection config, PR template, `CONTRIBUTING.md`, or `CODEOWNERS` exist in the repo today. Required-status-check enforcement is a GitHub UI setting, not something committed to the repo, so Phase 3's "promote to required check" step is a manual GitHub settings change, not a code change.

## 3. Scope decision

In scope: the 5 OGD data tools that the skill mirrors — `meteoswissLocalForecast`, `meteoswissCurrentWeather`, `meteoswissStations`, `meteoswissPollenData`, `meteoswissClimateData`.

Out of scope: `search` / `fetch`. These are MeteoSwiss-website tools with no OGD-skill equivalent by design — the skill only covers direct OGD/STAC data access, not general website content retrieval. Flagged as an open question below in case Max wants some future coverage for them.

This means the manifest's universe of "canonical files" is deliberately small: the schema files backing the 5 in-scope tools, plus the shared support modules they depend on for user-facing output (icons, unit formatting). Internal-only modules — session management, transport, rate limiting, the STAC HTTP client's retry logic — are never mapped, because nothing in the skill mirrors them; the skill talks to the OGD API directly and has no equivalent of the MCP server's transport layer at all.

## 4. Detection mechanism

| Mechanism | How it works | Precision | Cost | False-positive risk |
|---|---|---|---|---|
| Raw package-path diff | `packages/meteoswiss-mcp/**` touched, `packages/meteoswiss-skills/**` not | Low | Free | High — fires on every internal refactor, test-only change, or caching tweak |
| Declared coupling manifest (path-diff) | `parity-map.yml` maps specific canonical files → specific skill files/sections; diff checked against the map | High | Free (deterministic file diff) | Low — only fires on files known to be user-facing surface |
| Claude semantic diff | LLM reads the diff, judges "is this user-facing enough to need a skill update" | Medium-high, but non-deterministic | API cost per invocation | Medium — LLM judgment calls, especially on mixed-concern files |
| Hybrid (recommended) | Manifest gate blocks/flags deterministically; Claude only judges the residual ambiguous cases the manifest can't resolve | High where it matters | Low (Claude invoked rarely) | Low — Claude is advisory only, never blocking |

**Precision-ranked signals**, most to least trustworthy:

1. **Manifest-driven path diff (precise)** — the blocking gate. If `src/support/weather-icons.ts`, `src/schemas/ogd-shared.ts`, or a per-tool schema file changes without the mapped skill file changing in the same PR, flag/fail. High precision because these specific files are near-pure user-facing surface (parameter descriptions, output shapes, icon codes), not internal plumbing.
2. **Changeset frontmatter check** (`meteoswiss-mcp` named in a changeset, `meteoswiss-skills` not) — **advisory only, never the gate**. Packages version independently and most `meteoswiss-mcp` changesets legitimately need no skill change at all (e.g. a patch to caching behavior in `src/support/http-client.ts`-style code) — too noisy to block on.
3. **Raw package-path diff** — reject as a primary signal. Mentioned only as the naive baseline the manifest improves on.

**This is the crux of the whole proposal, stated plainly**: the informal provenance-comment convention already sitting in `REFERENCE.md` is what upgrades the path heuristic from *crude* (package touched vs. package touched) to *precise* (specific mapped canonical file touched → specific mapped skill file/section touched). Everything else in this proposal is machinery to make that existing convention machine-checkable.

**Pressure-test**: with one skill and roughly five mapped canonical files, the deterministic manifest check likely carries on the order of 80% of the value on its own — zero nondeterminism, zero API cost, no false-positive risk from LLM judgment calls. Claude's genuine value is narrow: judging user-facing vs. internal-plumbing intent *inside* the broader `src/data/ogd-*.ts` modules, which mix HTTP/caching logic with actual output shaping in the same file — a distinction the path diff alone can't cleanly resolve. So: the deterministic gate blocks (once promoted), and Claude is an optional, always-advisory layer on top, worth building only if Phase 1 turns out too noisy or too lax in practice — i.e., it is explicitly a Phase 2, not a Phase 1, deliverable.

Illustrative sketch of `parity-map.yml` (not created by this proposal — content to be finalized when Phase 0 lands):

```yaml
# Illustrative only — formalizes the provenance comments already in REFERENCE.md
mappings:
  - source: packages/meteoswiss-mcp/src/support/weather-icons.ts
    skill: packages/meteoswiss-skills/skills/meteoswiss-ogd/REFERENCE.md#icon-codes
  - source: packages/meteoswiss-mcp/src/schemas/ogd-shared.ts
    skill:
      - packages/meteoswiss-skills/skills/meteoswiss-ogd/REFERENCE.md#parameters
      - packages/meteoswiss-skills/skills/meteoswiss-ogd/SKILL.md
  - source: packages/meteoswiss-mcp/src/schemas/ogd-local-forecast.ts
    skill: packages/meteoswiss-skills/skills/meteoswiss-ogd/REFERENCE.md#forecast
  - source: packages/meteoswiss-mcp/src/data/ogd-climate-data.ts
    skill: NO MAPPED SKILL SECTION (known gap — see Open Questions)
```

## 5. Where it runs & enforcement

Run the manifest-diff job on **every PR**, not just release PRs — this validates Max's every-PR instinct, but for a sharper reason than "skill updates are cheap": the check is free to run on every PR because it's a fast deterministic file diff, and it produces a signal at all only when a mapped file is touched, so unrelated PRs pay approximately zero cost either way.

Hook it in as a new job in the existing `.github/workflows/pr-ci.yml`, alongside `lint-build-test`, `docker-build`, and `skill-validation`.

It must run on **feature/PR branches**, not on the release flow. Two reasons: `.github/workflows/version-packages.yml`'s Version Packages PR **consumes and deletes** `.changeset/*.md` files as part of bumping versions, so any signal derived from changeset content only exists on the original feature PR — by the time a GitHub Release fires (`release.yml` / `release-skill.yml`), there are no changesets left at all. And more generally, path-diffing against a base branch is meaningful in PR context; there's no equivalent "base" to diff against once a release is cut.

Phase it in as **advisory (PR-comment) first**. Promote to a **required status check** only once the false-positive rate is proven low in practice (Phase 3) — don't make it a hard blocker on day one, per repo convention of not merging with failing required checks.

Mechanically, the Phase 1 job is a straightforward `git diff --name-only origin/main...HEAD` (or equivalent GitHub Actions `paths` context) checked against the `source` entries in `parity-map.yml`. No network calls, no external dependencies beyond the manifest itself — it can run in well under a minute alongside the existing `lint-build-test` job.

Illustrative Phase 1 PR comment when a mapped file is flagged (not a real template, just to make the UX concrete):

```
Skills parity check: `packages/meteoswiss-mcp/src/support/weather-icons.ts` changed
in this PR, but `packages/meteoswiss-skills/skills/meteoswiss-ogd/REFERENCE.md#icon-codes`
(its mapped skill section per parity-map.yml) was not touched.

If this change is user-facing (new icon codes, changed mappings), please update the
skill section too. If not, add a `Skills-Parity: n/a — <reason>` trailer to a commit
in this PR to suppress this notice.

This is advisory only in Phase 1 — it will not block merge.
```

## 6. False-positive / escape-hatch handling

Not every mapped-file change needs a skill update — e.g. a docstring fix in `ogd-shared.ts`, or a type-only refactor of a schema with no behavioral change. The gate needs a deliberate, auditable override, not a silent one. Two mechanisms, present both, recommend one:

- **PR label**, e.g. `skills-parity: n/a` — simple, discoverable in the GitHub UI, easy to apply from the PR sidebar. But ephemeral: not preserved in git history once the PR merges or the label is removed, and invisible to anyone inspecting the commit log later.
- **Commit trailer**, e.g. `Skills-Parity: n/a — internal refactor, no user-facing change` — greppable in `git log` forever (`git log --grep='Skills-Parity:'`), survives independently of GitHub PR state, and remains visible even after the changeset that would have named the packages is consumed on the Version Packages PR.

**Recommendation: commit trailer as primary**, for durability. The label can be a nice-to-have UI affordance layered on top — a bot could read the label and stamp the trailer automatically on merge — but this is a preference call, not settled here; it's listed again under Open Questions.

## 7. Definition of Done

Proposed checklist text:

```
- [ ] Tests added/updated for new or changed behavior
- [ ] Docs updated (README, JSDoc, CLAUDE.md as applicable)
- [ ] Skills parity checked: if this PR changes a mapped MCP file (see parity-map.yml), the
      corresponding skill section is updated, OR a `Skills-Parity: n/a — <reason>` trailer is included
```

Proposed to live in three places (all Phase 0 deliverables of this *rollout*, not created by this proposal document itself):

1. A new `.github/pull_request_template.md` — shown on every PR.
2. A new root `CONTRIBUTING.md` — explains the *why* behind the checklist.
3. One added line in the existing root `CLAUDE.md`, under "Mandatory Practices" or "Development Workflow".

## 8. Cost & failure modes of Claude-in-CI (Phase 2 only)

- **API key**: no new secret needed. `ANTHROPIC_API_KEY` already exists as a repo secret, used by `.github/workflows/claude.yml`.
- **Token cost**: bounded by design — Claude only runs when the deterministic gate (Phase 1) has already found a mapped-file change without a corresponding skill change. It adds nuance to an already-flagged PR; it does not run on every PR. Given the scope (5 tools, ~5 mapped files), this should be a handful of invocations per month, not per PR.

Illustrative Phase 2 comment, appended to the Phase 1 notice above once Claude has judged the flagged diff (again, illustrative UX, not a real template):

```
Skills-parity judge: the change to weather-icons.ts adds three new WMO codes but does
not alter existing mappings — this looks additive and likely does need the icon table
in REFERENCE.md#icon-codes extended, but is unlikely to break existing skill guidance.
Suggest updating REFERENCE.md; not urgent enough to block.

(Advisory only — this comment does not affect merge status.)
```
- **Nondeterminism**: mitigated by keeping Claude strictly advisory (PR comments, never a blocking check). The only blocking signal in this system is the deterministic manifest diff.
- **API outage**: fail-open. Never block a merge because Claude is unavailable — post a "parity judgment unavailable, manual review recommended" comment instead and let the deterministic gate's result stand on its own.
- **Prompt injection from PR diff content**: keep the action read-only, mirroring the existing least-privilege pattern already established in `claude.yml` (contents/PRs/issues read, `id-token: write`, no write access, no auto-merge, no secrets exposure beyond the API key itself). Treat PR diff text as untrusted input the same way `claude.yml` already must for `@claude` mentions in issue/PR comments — this is not a new threat model for the repo, just a new call site for the same mitigation.

Net effect: Phase 2 adds a well-understood, low-frequency, fail-open enhancement on top of an already-working Phase 1 gate, rather than introducing a new class of CI risk.

## 9. Recommendation & phased rollout

| Phase | Deliverable | Automation | Blocking? |
|---|---|---|---|
| 0 | DoD checklist text, `.github/pull_request_template.md`, `CONTRIBUTING.md`, committed `parity-map.yml` | None | No |
| 1 | Deterministic manifest-diff job in `pr-ci.yml`, every PR | Yes — deterministic | No (advisory comment) |
| 2 | Claude judge, invoked only on Phase-1 flags | Yes — Claude, bounded | No (advisory comment) |
| 3 | Promote the *deterministic* gate to a required status check | Same as Phase 1 | Yes, once false-positive rate is proven acceptable |

Note explicitly: Phase 3 promotes the Phase 1 manifest gate, not the Phase 2 Claude judge. The Claude judge stays advisory permanently — it is a nuance layer, not a merge gate, because its judgment is not deterministic enough to be a hard blocker even after tuning.

## 10. Open questions for Max

- **`search`/`fetch` scope.** Should these be in scope for parity checking in some form, even though they have no OGD-skill equivalent today? If Max ever wants an agent-without-MCP path to MeteoSwiss website content, that would be a new skill capability, not a parity gap in the existing one — worth confirming this reading is correct rather than assumed.
- **Label vs. commit-trailer.** This proposal recommends the trailer for durability, but it's a preference call. If Max's workflow leans heavily on GitHub UI review (labels, checks tab) rather than `git log` archaeology, the label's ephemerality may matter less in practice than this proposal assumes.
- **The separate skill-version sync problem.** The skill package's own `CLAUDE.md` notes its version must be manually kept in sync across four locations: `SKILL.md` frontmatter, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.cursor-plugin/plugin.json`. This is a related but mechanically distinct problem — version-string consistency across metadata files, not content parity between two packages — and is out of scope for `parity-map.yml` as designed. Flagged here so it isn't silently dropped, not because this proposal has a recommendation for it yet.
- **Closing the `meteoswissClimateData` gap now.** Should this be done as the first real proof that the process (once built) actually works end-to-end — i.e. dogfood Phase 0's manifest and DoD checklist on a PR that closes the one known, already-admitted gap, before rolling the gate out to the rest of the codebase?
