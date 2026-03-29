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

## Commands

- **Validate skills**: `pnpm test` (runs `skills add . --list`)

## Versioning

Uses [changesets](https://github.com/changesets/changesets) — run `pnpm changeset` from the repo root to add a changeset. The "Version Packages" CI workflow bumps `package.json` automatically.

Additionally, bump version in all 5 locations: `SKILL.md` frontmatter `metadata.version`, `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `.cursor-plugin/plugin.json`.
