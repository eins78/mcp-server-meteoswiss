# MeteoSwiss Skills

Agent skill package following the [agentskills.io](https://agentskills.io/specification) spec. Uses the [`skills`](https://www.npmjs.com/package/skills) CLI for validation.

## Skill Format

Each skill lives in `skills/<skill-name>/`:

```
skills/<skill-name>/
├── SKILL.md      # The skill (frontmatter + instructions) — REQUIRED
├── README.md     # Development documentation — REQUIRED
└── REFERENCE.md  # Heavy reference tables (>100 lines) — optional
```

### SKILL.md Frontmatter

```yaml
---
name: skill-name
description: Use when [triggering conditions]. Max 1024 chars total.
globs: []
license: CC0-1.0
metadata:
  author: eins78
  repo: https://github.com/eins78/meteoswiss-llm-tools
  version: "1.0.0"
compatibility: claude-code, cursor
---
```

## Key Principles

1. **Be concise** — only add what Claude doesn't already know
2. **Progressive disclosure** — overview in SKILL.md, details in REFERENCE.md
3. **Third person** — "Fetches data" not "I help you fetch data"
4. **Use `${CLAUDE_SKILL_DIR}`** for bundled file paths, never relative paths
5. **Use checklists** for multi-step workflows
6. **Test across models** — Haiku needs more guidance than Opus

## Parity with the MCP server

The `meteoswiss-ogd` skill mirrors the MCP server's OGD tools. Each skill section that covers an
MCP tool carries an invisible coverage marker, e.g. `<!-- mcp-tool: meteoswissCurrentWeather -->`.
A CI lint (`pnpm --filter meteoswiss-mcp run lint:parity`, hard-blocking) checks that every
in-scope tool from the server's generated `tools/list` inventory has a marker, and that no marker
names a tool that no longer exists. When adding or renaming a skill section for a tool, keep its
marker; when the server adds a tool, the lint stays red until the skill documents it (or it is
deliberately excluded in `packages/meteoswiss-mcp/parity/parity-exceptions.yml` with a reason).
Design: `docs/plans/2026-07-11-skills-mcp-parity.md`.

## Commands

- **Validate skills**: `pnpm test` (runs `skills add . --list`)

## Versioning

Uses [changesets](https://github.com/changesets/changesets) — run `pnpm changeset` from the repo root to add a changeset. The "Version Packages" CI workflow bumps `package.json` automatically.

Changesets bumps `package.json` automatically. The remaining 4 locations need manual updates: `SKILL.md` frontmatter `metadata.version`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `.cursor-plugin/plugin.json`.
