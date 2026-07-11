# MCP-vs-Skills Weather Q&A Eval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure accuracy and token/cost differences between answering real-world Swiss weather
questions via (A) the MCP server's tools vs (B) the `meteoswiss-ogd` skill (direct HTTP/bash),
with real model calls, and publish graphs + a blog-style writeup.

**Architecture:** Extend `packages/meteoswiss-forecast-evals` (standalone promptfoo package) with
custom TypeScript promptfoo providers, each wrapping an OpenRouter chat-completions **tool-calling
agent loop**. The `mcp` provider connects an MCP SDK client to a locally running `meteoswiss-mcp`
server and exposes its real tools; the `skill` provider injects `SKILL.md` as system context and
exposes one guarded `bash` tool (allowlisted commands, `data.geo.admin.ch`-only URLs, the skill's
bundled scripts). Ground truth is captured from live OGD data at run time (never hand-typed);
scoring is programmatic with tolerances against a strict `FINAL_JSON` line each answer must end
with. Costs come from OpenRouter's own `usage.cost` accounting summed across loop iterations, with
a hard in-provider budget guard (default $4, cap $5).

**Tech Stack:** promptfoo 0.121 custom JS providers (native-TS import), `@modelcontextprotocol/sdk`
client (new dep in the eval package only), OpenRouter chat completions with `tools` +
`usage: {include: true}`, hand-rolled SVG charts (no chart deps), Node 24 native TS.

**Fairness rules (design invariants):**
- Identical user questions, identical answer-format instructions, identical models, temperature 0.
- Both methods get the current date/time (Europe/Zurich) in the system prompt.
- MCP method pays for: tool schemas from `tools/list` + JSON tool results.
- Skill method pays for: SKILL.md (~2.4k tokens) + bash tool results; REFERENCE.md only if the
  model `cat`s it (progressive disclosure, measured honestly); bundled scripts allowed.
- Ground truth comes from the same OGD dataset both methods read. Current weather/pollen/climate/
  stations ground truth is parsed directly from the CSVs by eval code; local-forecast ground truth
  is captured via the MCP server (documented caveat: reimplementing the DST-aware hourly
  aggregation would duplicate the data layer; tolerances absorb rounding).

**Models (axis is access method, not model):** `anthropic/claude-haiku-4.5` (cheap tier) and
`openai/gpt-5-mini` (cheap tier, mandatory-minimal reasoning — known from the existing suite).
2 models x 2 methods x ~12 questions = ~48 rows ≈ $1–2 estimated; budget guard aborts at $4.

---

### Task 1: Question set + ground truth capture

**Files:**
- Create: `src/mcp-vs-skills/questions.ts` — ~12 questions, each `{ id, family, question,
  answerSchemaHint, groundTruth: (ctx) => Expected }` covering: current (Zürich temp/conditions,
  Säntis wind, warmest-station-in-CH scan), forecast (rain this afternoon Zürich, low tonight
  Bern, jacket tomorrow Basel, weekend outlook Lugano, hourly rain-stop Geneva), pollen (grasses
  Zürich, any-pollen Basel), stations (list canton GR), climate (June 2026 mean temp Zürich).
- Create: `src/mcp-vs-skills/ground-truth.ts` — fetch + parse VQHA80.csv, pollen CSVs, NBCN
  monthly CSV, station metadata (Latin1!), and call the local MCP server for forecasts; emits
  `generated/mcp-skills-ground-truth.json` with per-question expected values + tolerances.
- Create: `src/mcp-vs-skills/capture-ground-truth.ts` — CLI entry (tsx) that writes the file and
  `generated/mcp-skills-tests.json` (promptfoo test cases with vars: question, expectedJson).
- Test: `src/mcp-vs-skills-ground-truth.test.ts` — parse fixtures (a committed VQHA80 sample
  captured once) and assert parser correctness offline.

**Steps:**
- [ ] Write question definitions with expected-answer JSON schema per question
      (e.g. `{"temperature_c": number}`, `{"will_rain": boolean, "rain_hours_local": string[]}`)
- [ ] Write CSV parsers (semicolon, Latin1 for metadata) + STAC lookups, with fail-fast errors
- [ ] Write offline unit tests against small committed fixture CSVs; run `pnpm test`
- [ ] Commit

### Task 2: Agent-loop core + budget guard

**Files:**
- Create: `src/mcp-vs-skills/openrouter-agent.ts` — `runAgentLoop({model, systemPrompt, question,
  tools, dispatchTool, maxIterations: 8})` → `{ answerText, usage: {promptTokens, completionTokens,
  cost, requests, toolCalls}, transcript }`. Sums OpenRouter `usage` (incl. `cost` via
  `usage: {include: true}`) across iterations. Temperature 0.
- Create: `src/mcp-vs-skills/budget.ts` — module-level cumulative-spend tally persisted to
  `generated/.spend.json` (survives across provider instances/processes), `assertBudget()` throws
  once `MCP_SKILLS_BUDGET_USD` (default 4.0) is exceeded.
- Test: `src/mcp-vs-skills-budget.test.ts` — tally accumulation + throw-at-cap offline.

**Steps:**
- [ ] Implement loop with tool_calls handling, per-iteration usage summing, transcript capture
- [ ] Implement + test budget guard; run `pnpm test`; commit

### Task 3: MCP provider

**Files:**
- Create: `src/mcp-vs-skills/provider-mcp.ts` — promptfoo provider class; lazily connects
  `@modelcontextprotocol/sdk` `StreamableHTTPClientTransport` to `MCP_SKILLS_MCP_URL`
  (default `http://localhost:3105/mcp`), `tools/list` → OpenAI function format, dispatch via
  `client.callTool`, returns `{ output, tokenUsage, cost, metadata: {toolCalls, iterations} }`.
- Modify: `package.json` — add `@modelcontextprotocol/sdk` devDependency (this package only).
- Create: `scripts/run-mcp-skills.sh` — starts `meteoswiss-mcp` on PORT=3105 (real network, no
  fixtures), waits for `/health`, captures ground truth, runs promptfoo `--no-cache`, kills server
  (trap).

**Steps:**
- [ ] `pnpm add -D @modelcontextprotocol/sdk` inside the eval package
- [ ] Implement provider + server-lifecycle script; verify `tools/list` roundtrip manually
- [ ] Commit

### Task 4: Skill provider + guarded bash tool

**Files:**
- Create: `src/mcp-vs-skills/bash-tool.ts` — `runGuardedBash(command)`: reject `;`, `&`, `>`, `<`,
  backticks, `$(` outside single-quoted regions; split remainder on `|`; each segment's first word
  must be in ALLOWLIST (`curl awk grep head tail cut sort uniq iconv sed tr wc cat echo jq column
  paste date bash`) or an absolute path inside the skill's `scripts/` dir; any `https://` URL must
  match `^https://(data\.geo\.admin\.ch|www\.meteoschweiz\.admin\.ch)/`; 30s timeout; stdout+stderr
  truncated to 8 KB with marker; cwd = package tmp dir; env carries `CLAUDE_SKILL_DIR`.
- Create: `src/mcp-vs-skills/provider-skill.ts` — reads SKILL.md from
  `../meteoswiss-skills/skills/meteoswiss-ogd/`, system prompt = common instructions + skill body,
  single `bash` tool, same agent loop.
- Test: `src/mcp-vs-skills-bash-tool.test.ts` — allow/deny cases (injection attempts, wrong-host
  curl, skill script path, pipelines).

**Steps:**
- [ ] TDD the guard: failing tests first, then implementation; run `pnpm test`
- [ ] Implement provider; commit

### Task 5: Scorer + promptfoo config + smoke

**Files:**
- Create: `src/mcp-vs-skills/scoring.ts` + `src/mcp-vs-skills/scorer.ts` (promptfoo entrypoint) —
  extract last `FINAL_JSON:` line, compare fields with per-question tolerance (numbers ±tol,
  booleans exact, string sets by normalized membership); partial credit = fraction of fields
  correct.
- Create: `promptfooconfig.mcp-vs-skills.yaml` — 4 providers (`file://src/mcp-vs-skills/
  provider-mcp.ts` + `provider-skill.ts` x 2 model configs, labels `mcp/haiku-4.5`,
  `skill/haiku-4.5`, `mcp/gpt-5-mini`, `skill/gpt-5-mini`), tests
  `file://generated/mcp-skills-tests.json`, output `generated/results-mcp-skills.json`.
- Modify: `package.json` scripts — `mcp-skills:capture`, `mcp-skills:smoke` (1 model, 3 questions
  via `--filter-first-n`), `mcp-skills:eval`, `mcp-skills:summarize`, `mcp-skills:charts`.
- Test: `src/mcp-vs-skills-scoring.test.ts` — tolerance/partial-credit cases offline.

**Steps:**
- [ ] TDD scoring; run `pnpm test`; commit
- [ ] Smoke run (~$0.10): 1 model x both methods x 3 questions; inspect transcripts; fix loop bugs
- [ ] Commit

### Task 6: Full eval run (budget-capped)

- [ ] Capture ground truth + run full sweep (2 models x 2 methods x 12 questions, `--no-cache`)
- [ ] `pnpm run mcp-skills:summarize` — table: accuracy, tokens, cost, tool calls per method/model
- [ ] Cross-check spend against OpenRouter `/api/v1/credits`; record in results doc
- [ ] Commit results JSON snapshot fields needed for charts (per repo convention raw results.json
      is gitignored; commit the summarized `docs/results/` data table instead)

### Task 7: Charts (load dataviz skill first)

**Files:**
- Create: `src/mcp-vs-skills/render-charts.ts` — reads results JSON, writes SVGs to
  `docs/results/2026-07-11-mcp-vs-skills/`: accuracy-by-method.svg, tokens-per-question.svg,
  aggregate cost + cost-per-correct-answer.svg, tool-calls/turns comparison.
- [ ] Invoke `dataviz` skill BEFORE writing chart code; follow its palette/mark rules
- [ ] Render, eyeball SVGs, commit

### Task 8: Blog draft + results doc (load writing-for-humans first)

**Files:**
- Create: `docs/results/2026-07-11-mcp-vs-skills.md` — dated, immutable results doc (suite
  convention) with methodology + gate tables.
- Create: blog draft `docs/blog/` or same results doc styled as showcase post (decide by repo
  precedent) embedding the SVGs, takeaways: when MCP overhead pays off, when skills win.
- Modify: `packages/meteoswiss-forecast-evals/README.md` — new section describing the
  mcp-vs-skills track + commands.
- [ ] Invoke `quatico-internal:writing-for-humans` before drafting; commit

### Task 9: Delivery

- [ ] `pnpm run fix && pnpm run lint && pnpm test` in the eval package (standalone)
- [ ] Root `pnpm run lint`/CI-relevant checks unaffected (package excluded from root workspace)
- [ ] Sessionlog to `docs/sessionlogs/` (standing policy: committed on the PR branch)
- [ ] Push `git push -u origin HEAD`; open PR (base main); wait CI green
- [ ] pr-review-toolkit review + Copilot review loop; fix findings; DO NOT MERGE
