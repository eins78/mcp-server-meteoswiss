# Prod Promotion

> Rename repo to meteoswiss-llm-tools, restructure as monorepo, overhaul docs, polish homepage, prepare 2.0.0 release

## Status

- **Phase:** Draft
- **Type:** infra
- **Sprint:**

## Changelog

- Rename repo from `mcp-server-meteoswiss` to `meteoswiss-llm-tools` (monorepo for all MeteoSwiss LLM tooling)
- Rename npm package from `mcp-server-meteoswiss` to `meteoswiss-mcp`
- Restructure as pnpm workspace monorepo with `packages/meteoswiss-mcp/`
- Overhaul README: user-first structure with hosted service config at top, dev/self-host below the fold
- Deep polish of server homepage (drop "Demo", improve copy, add version display)
- Clean up all docs, archive historical implementation plans
- Ship proper 2.0.0 release (GitHub Release, npm, GHCR Docker image)
- Production URL: `https://meteoswiss-mcp.ars.is`

## Motivation

Version 2.0.0 shipped the MeteoSwiss Open Data integration — a full rewrite of the data layer. The project is production-ready but still presents itself as a demo: the README title says "(Demo)", the homepage says "Demo", the repo name references old naming, and docs are developer-focused rather than user-focused.

This plan promotes the project to a production service with proper naming, user-first documentation, and a real release pipeline.

## Design

### Naming

| Thing | Name |
|-------|------|
| GitHub repo | `eins78/meteoswiss-llm-tools` |
| npm package (MCP server) | `meteoswiss-mcp` |
| npm package (skill, future) | `meteoswiss-skills` |
| Docker image | `ghcr.io/eins78/meteoswiss-mcp` |
| Prod URL | `https://meteoswiss-mcp.ars.is` |

### Monorepo Structure

```
meteoswiss-llm-tools/
  packages/
    meteoswiss-mcp/        # MCP server (current codebase)
      package.json         # name: "meteoswiss-mcp"
      src/
      test/
      ...
    meteoswiss-skills/      # (future) Claude Code skill
  pnpm-workspace.yaml
  package.json             # root workspace config
  README.md                # umbrella README
```

### Approach: Two-Phase

**Phase 1 (PR):** All content changes in a single reviewable PR.
**Phase 2 (post-merge):** Repo rename, release, deployment, registry submissions.

### Open Questions

- [ ] None — all questions resolved during brainstorming

---

## Phase 1: Content PR

### 1.1 Monorepo Restructuring

Move the current codebase into `packages/meteoswiss-mcp/`:

- Move `src/`, `test/`, `dist/`, `vendor/`, `docs/` (MCP-specific docs), `Dockerfile`, `docker-compose.yml`, `tsconfig.json`, `jest.config.js`, `eslint.config.js`, `.prettierrc`, `nodemon.json` into `packages/meteoswiss-mcp/`
- Current `package.json` becomes `packages/meteoswiss-mcp/package.json` with name `meteoswiss-mcp`
- Create new root `package.json` (workspace root, private, no version)
- Update `pnpm-workspace.yaml` to point to `packages/*`
- Root `README.md` is the umbrella README (see 1.3)
- `packages/meteoswiss-mcp/README.md` is the MCP-server-specific README
- `.claude/`, `.github/`, `.devcontainer/`, `.gitmodules`, `.gitattributes`, `.gitignore`, `.nvmrc`, `.npmrc`, `.renovaterc` stay at root
- `CLAUDE.md` stays at root (update paths)
- `LICENSE` stays at root

### 1.2 Package Naming

| Field | Old | New |
|-------|-----|-----|
| `package.json` `name` | `mcp-server-meteoswiss` | `meteoswiss-mcp` |
| `package.json` `repository.url` | `github.com/eins78/mcp-server-meteoswiss-data` | `github.com/eins78/meteoswiss-llm-tools` |
| `package.json` `bugs.url` | `github.com/eins78/mcp-server-meteoswiss-data/issues` | `github.com/eins78/meteoswiss-llm-tools/issues` |
| `package.json` `homepage` | `github.com/eins78/mcp-server-meteoswiss-data#readme` | `https://meteoswiss-mcp.ars.is` |
| Docker image name (scripts) | `mcp-server-meteoswiss` | `meteoswiss-mcp` |
| `docker-compose.yml` service | `mcp-server` | `meteoswiss-mcp` |

All references to the old `-data` suffix and old repo URLs must be found and replaced across the codebase.

### 1.3 Root README (umbrella)

The root `README.md` introduces the monorepo:

1. **Title:** `# MeteoSwiss LLM Tools`
2. **One-liner:** "Swiss weather data for AI assistants — powered by MeteoSwiss Open Data"
3. **Packages:** Table linking to each package with one-liner descriptions
4. **Quick start:** Pointer to the MCP server's "use the hosted service" section
5. **License**

Short and navigational — the real content lives in the package READMEs.

### 1.4 MCP Server README (`packages/meteoswiss-mcp/README.md`)

New structure, top to bottom:

1. **Title:** `# MeteoSwiss MCP Server` (no "Demo")
2. **Badge row:** npm version, license (CC0-1.0), Node.js >=22
3. **What it does:** 3-4 bullet points (forecasts, real-time, stations, pollen). Data source attribution ("powered by MeteoSwiss Open Data — the same data behind the MeteoSwiss app and website").
4. **Use the hosted service** (hero section):
   - Claude Desktop config snippet (JSON pointing to `meteoswiss-mcp.ars.is/mcp`)
   - Claude Code: `claude mcp add meteoswiss-mcp https://meteoswiss-mcp.ars.is/mcp`
   - Claude.ai instructions
   - Example questions grouped by language (DE/FR/IT/EN)
5. **Available tools:** Concise list — tool name, one-liner, key params. Not full parameter tables.
6. **Prompts:** Brief section listing the pre-configured prompts by language.
7. **Self-hosting** (below the fold):
   - Docker one-liner
   - docker-compose
   - Node.js from source
8. **Development** (for contributors):
   - Prerequisites, setup, commands
   - Project structure
   - Testing
9. **Environment variables:** Reference table
10. **Contributing + License**

Key changes:
- "Use the hosted service" is the first thing users see
- Development info clearly separated and moved down
- Remove duplicate sections (current README has Quick Start + Running the application + Running Your Own Instance)
- Fix all stale repo URLs

### 1.5 Homepage Deep Polish

The server renders markdown at `GET /` from `src/views/homepage/`. Three files, all getting content rewrites:

**`overview.md`** — current title is "MeteoSwiss MCP Server Demo". New content:

```markdown
# MeteoSwiss MCP Server

Swiss weather data for AI assistants — powered by [MeteoSwiss Open Data](https://opendata.swiss).

**Service URL**: `{base_url}`
**MCP Endpoint**: `{mcp_url}`
**Version**: {version}

## What You Get

- **Multi-day forecasts** for ~6000 Swiss locations — postal codes, station names, or place names
- **Real-time measurements** from ~160 automatic weather stations, updated every 10 minutes
- **Station search** by name, canton, or GPS coordinates
- **Pollen monitoring** from ~15 stations across Switzerland

All data comes from the official MeteoSwiss Open Data platform — the same data
behind the MeteoSwiss app and website.
```

**`usage.md`** (renamed from `installation.md`):

```markdown
# Get Started

No installation required — this server is hosted and ready to use.

## Claude Desktop

Add to your Claude Desktop config:
{json config snippet with templated MCP URL}

## Claude Code

claude mcp add meteoswiss https://meteoswiss-mcp.ars.is/mcp

## Claude.ai

Go to Settings → Integrations → Add MCP Server → paste the MCP endpoint URL.

## Example Questions

**German:** "Wie wird das Wetter in Zürich diese Woche?"
**French:** "Quelle est la météo à Genève demain?"
**Italian:** "Che tempo fa a Lugano?"
**English:** "What's the current temperature at Jungfraujoch?"

## Self-Hosting & Development

See the [GitHub repository](https://github.com/eins78/meteoswiss-llm-tools).
```

**`tools.md`:**
- Keep the parameter tables (right level of detail for homepage)
- Polish tool descriptions: less technical, more "what you can ask"
- Add a one-line "Returns:" note under each tool (e.g. "Returns: daily forecasts with temperature, precipitation, weather description, and icons")

**Footer (rendered by the markdown template):**
- `v{version} · [GitHub](repo_url) · Powered by MeteoSwiss Open Data`

### 1.6 Docker & Build

- Update `Dockerfile` `LABEL` metadata (source URL, description)
- `docker-compose.yml`: service name → `meteoswiss-mcp`, add `image: ghcr.io/eins78/meteoswiss-mcp:latest`
- `package.json` scripts: `build:docker` and `start:docker` use image name `meteoswiss-mcp`

### 1.7 docs/ Cleanup

- **All files:** Scan and fix stale repo URLs, remove "demo" language
- **`docs/debugging-guide.md`:** Update service URL/name references
- **`docs/user-guide.md`:** Update for prod service
- **`docs/releasing.md`:** Update package name, GHCR image name, release process for new identity
- **`docs/README.md`:** Fix all references
- **`docs/architecture/`, `docs/analysis/`:** Scan for stale references
- **Archive:** Move `docs/implementation-plan.md` and `docs/implementation-status.md` to `docs/archive/`
- **`docs/demos/`:** Move to `docs/archive/demos/` (historical PR validation logs)

### 1.8 CLAUDE.md

- Update project description (remove "demo" framing)
- Update all repo URLs to `eins78/meteoswiss-llm-tools`
- Update package name references
- Update clone URLs in code examples
- Update deployment references
- Update file paths to reflect monorepo structure (`packages/meteoswiss-mcp/src/` etc.)

### 1.9 Pre-release Prep

- Delete the existing `v2.0.0` git tag (RC tags stay as historical markers)
- Ensure `package.json` version remains `2.0.0`

---

## Phase 2: Rename + Release (post-merge)

### 2.1 GitHub Repo Rename

- Rename `eins78/mcp-server-meteoswiss` → `eins78/meteoswiss-llm-tools`
- GitHub auto-redirects old URLs
- Update local git remote: `git remote set-url origin https://github.com/eins78/meteoswiss-llm-tools.git`

### 2.2 GitHub Metadata

- **Description:** "Swiss weather data for AI assistants — MCP server, Claude skill, and more. Powered by MeteoSwiss Open Data."
- **Homepage:** `https://meteoswiss-mcp.ars.is`
- **Topics:** `mcp`, `weather`, `meteoswiss`, `switzerland`, `claude`, `ai`, `open-data`, `llm`

### 2.3 Release 2.0.0

- Git tag `v2.0.0` on the renamed repo
- GitHub Release with proper release notes covering:
  - MeteoSwiss Open Data integration (the big feature)
  - All available tools
  - How to use the hosted service
  - How to self-host
- npm publish: `meteoswiss-mcp@2.0.0`
- Docker: `ghcr.io/eins78/meteoswiss-mcp:2.0.0` and `:latest`

### 2.4 Deployment

- DNS: CNAME `meteoswiss-mcp.ars.is` (already configured)
- Reverse proxy: add entry for `meteoswiss-mcp.ars.is`, TLS auto-provisioned
- Docker: pull `ghcr.io/eins78/meteoswiss-mcp:2.0.0`, set `PUBLIC_URL=https://meteoswiss-mcp.ars.is`
- Retire the old `meteoswiss-mcp-demo.cloud.kiste.li` URL

**Verify:**
- `curl https://meteoswiss-mcp.ars.is/health` returns 200
- `curl https://meteoswiss-mcp.ars.is/` renders homepage with correct URLs
- `npx mcp-remote https://meteoswiss-mcp.ars.is/mcp` connects successfully

### 2.5 MCP Registry & Directory Submissions

Publish to registries in priority order. The official MCP Registry is the highest leverage — downstream directories (PulseMCP) auto-sync from it.

#### Official MCP Registry (highest priority)

- **URL:** https://registry.modelcontextprotocol.io/
- **How:** Use the `mcp-publisher` CLI from https://github.com/modelcontextprotocol/registry
  1. Build: `git clone` the registry repo, `make publisher`
  2. Authenticate via GitHub OAuth (as `eins78`)
  3. Publish: `mcp-publisher publish` — registers as `io.github.eins78/meteoswiss-mcp`
- **Auto-downstream:** PulseMCP (https://pulsemcp.com) syncs from this daily

#### Glama.ai

- **URL:** https://glama.ai/mcp/servers
- **How:** Auto-discovers GitHub repos. After rename, claim listing with GitHub auth.

#### Smithery.ai (optional)

- **URL:** https://smithery.ai/
- **How:** Add `smithery.yaml` to repo root, then `smithery mcp publish` or submit at https://smithery.ai/new

#### Cline MCP Marketplace

- **URL:** https://github.com/cline/mcp-marketplace
- **How:** GitHub issue with: repo URL, 400x400 PNG logo, confirmation that setup works from README

#### awesome-mcp-servers (appcypher)

- **URL:** https://github.com/appcypher/awesome-mcp-servers
- **How:** Submit PR following `CONTRIBUTING.md`

### 2.6 Update Existing Listings

#### mcpservers.org

- **Current:** https://mcpservers.org/en/servers/eins78/mcp-server-meteoswiss
- **How:** Re-submit via https://mcpservers.org/submit (no PRs accepted)

#### mcp.so

- **Current:** https://mcp.so/server/mcp-server-meteoswiss
- **How:** Submit via https://mcp.so/submit or GitHub issue. May auto-update from GitHub after rename.

#### Other directories

Search for `mcp-server-meteoswiss` on Google and GitHub. Update or notify maintainers.

---

## Out of Scope

- New features or tools (this is purely a naming/docs/release effort)
- Breaking API changes
- Infrastructure provisioning details (deployment steps documented but executed manually)
- Changing the MCP tool names (they keep the `meteoswiss` prefix)
- The `meteoswiss-skills` package (noted in monorepo structure as a future addition)

## Branches

- `infra/prod-promotion` — Phase 1: all content, naming, and restructuring changes

## Notes

- RC tags (v2.0.0-rc.1 through rc.3) stay as historical markers
- MCP tool names keep the `meteoswiss` prefix (no breaking API changes)
