# Docs Reframing: Showcase + Skill-vs-MCP Case Study

**Date:** 2026-07-11
**Model:** Fable 5, worktree `quatico-showcase-docs`, branch `worktree-quatico-showcase-docs`
**Related:** [PR #118](https://github.com/eins78/meteoswiss-llm-tools/pull/118)

## Summary

Reworked the public-facing docs so the repo reads as two things at once: a showcase of how to
enable data access for AI agents (MeteoSwiss OGD as the worked example), and a case study
comparing two implementations of the same problem — an agent skill (~630 lines markdown + bash)
vs. an MCP server (~6.6k LOC TypeScript). Also fixed several accuracy bugs found along the way.

## Key decisions

**One anchor doc, stable URL.** All framing lives in the new `docs/skill-vs-mcp.md` (problem
statement, both implementations, 12-row capability parity matrix, engineering comparison,
context-cost reasoning, when to choose which, honest limitations). Everything else — root
README, package READMEs, service homepage — carries only 1-2 framing sentences plus a link, so
the READMEs stay scannable. A new `docs/README.md` indexes the public docs and labels `plans/`,
`research/`, and `sessionlogs/` as internal working notes kept for provenance.

**Three pillars in the root README.** Agent skill, MCP server, and the eval suite each get a
bullet in a new "What This Repo Demonstrates" section. The evals earn pillar status as
*eval-driven interface design*: tool output is an interface for a language model, and its
legibility can be measured before shipping.

**The comparison is architectural, not benchmarked — and the docs say so.** The eval suite
measures how well 13 LLMs comprehend the forecast JSON *format* (local-time-with-offset vs. UTC
timestamps); it is not a skill-vs-MCP harness. Rather than stretch it into a claim it doesn't
support, the case study presents the skill-vs-MCP comparison as qualitative, adds an explicit
"Limitations" section (no behavioral skill tests, no head-to-head benchmark, context costs
reasoned not measured), and names a real head-to-head benchmark as future work.

**Grounded claims only.** Line counts, tool lists, cache tiers, test volume, and eval numbers
were verified against the code before writing. One plausible but unverifiable comparison row
("time to first version") was cut.

## Accuracy fixes

- `meteoswissClimateData` was missing from every public tools table (root README, mcp README)
  and from the service homepage `tools.md` entirely — added everywhere, with parameters taken
  from `src/schemas/ogd-climate-data.ts`.
- Station count "~160" was stale everywhere except the `meteoswissCurrentWeather` description —
  the network has been ~300 (~160 full weather + ~140 precipitation-only) since the SMN-precip
  merge (PR #62). Fixed in both `server.ts` tool descriptions (which the LLM reads for tool
  selection), both READMEs, and the homepage views.
- Root README "Packages" table omitted `meteoswiss-forecast-evals`; the evals `package.json`
  description referenced PR #99 as if still pending.
- `docs/architecture/api-design.md`'s current-tools list documented the removed
  `meteoswissClimateNormals` and the old station count — surgically fixed; both architecture
  docs still describe the scraping-era `meteoswissWeatherReport` tool and need a fuller refresh
  (follow-up; the case study deliberately does not link them).

## What shipped (PR #118)

New: `docs/skill-vs-mcp.md`, `docs/README.md`, changeset (patch, `meteoswiss-mcp`).
Reworked: root `README.md`, all three package READMEs, homepage `overview.md` + `tools.md`
(live on next deploy), `server.ts` tool-description strings, root + evals `package.json`
descriptions.

Verified: `pnpm --filter meteoswiss-mcp run fix && run ci` green (21 suites, 175 tests);
homepage served locally and checked for the new content; all relative links resolve (homepage
links are absolute URLs, since that markdown is rendered by the server, not GitHub); every
"MeteoSwiss app" mention says "app and website". All five PR CI checks green.

## Follow-up: copy-editing pass

A later pass ran the reworked showcase docs through a de-AI copy-edit (sentence-case headings,
remove AI-writing tells), preserving every count, tool name, and URL:

- Root README: section headings normalized to sentence case ("What this repo demonstrates",
  "Choose your approach", "Available tools (MCP server)", "Example questions", "Data source",
  and the two Quickstart subheadings).
- `docs/skill-vs-mcp.md`: one phrasing fix — "serves as readable documentation" → "is also
  readable documentation".
- `meteoswiss-forecast-evals` README: dropped a "Note that" hedge.

No facts changed: a number / tool-name / URL set comparison against the prior revision was
identical for every edited file.
