# Plan: ChatGPT Deep Research `fetch`/`search` Compatibility

> Restore canonical ChatGPT Deep Research MCP tool contract for `fetch` (param: `id`, response field: `text`) and lock it in with a regression test suite + serialized tool-manifest snapshot.

## Status

- **Phase:** Draft
- **Type:** bug
- **Sprint:**

## Problem

ChatGPT Deep Research consumes MCP servers via two well-known tools — `search` and `fetch` — with a tightly defined input/output contract. The current `meteoswiss-mcp` implementation diverges from that contract on `fetch`:

| Field | ChatGPT spec (canonical) | `meteoswiss-mcp` today | Status |
|---|---|---|---|
| `fetch` input arg | `id: string` | `url: string` | ❌ incompatible |
| `fetch` response payload field for body | `text` | `content` | ❌ incompatible |
| `fetch` response payload structure | `{id, title, text, url, metadata}` | `{id, title, content, format, metadata}` | ❌ incompatible |
| `search` input arg | `query: string` | `query: string` (+ optional extras) | ✅ compatible |
| `search` response payload | `{results: [{id, title, url, text?}]}` | `{totalResults, page, pageSize, results: [{id, title, url, description, …}]}` | ✅ tolerated (extra fields OK; ChatGPT looks for `results[]` with `id`/`title`/`url`) |
| MCP envelope | `{content: [{type: "text", text: <JSON>}]}` | same | ✅ |

### Origin of the regression

`packages/meteoswiss-mcp/src/schemas/meteoswiss-fetch.ts` was created with `id` as the param name (commit d6b1c62, original monorepo introduction). On 2026-04-18 commit **de9c937** ("B: Fix international city blocklist, NOTASTATION geocoding guard, fetch url param") explicitly renamed `id → url` with the message *"Revert fetch schema param id → url (rc.3 rename was unintentional)"*. Git history disagrees: `id` has been the param name since the schema file was first added, and was kept through rc.3. The de9c937 reversion is therefore itself the regression — and it landed in `2.3.1` (the version currently in production).

There is no integration regression test that asserts ChatGPT-shaped calls succeed, so the rename slipped through CI. The existing `test/integration/meteoswiss-fetch.test.ts:34` actively *enforces* the broken shape (`url` as the required field).

### Authoritative sources (cited in the test suite)

- **OpenAI Cookbook — official Deep Research MCP example:**
  - <https://github.com/openai/openai-cookbook/blob/main/examples/deep_research_api/how_to_build_a_deep_research_mcp_server/main.py>
  - Verbatim: `async def fetch(id: str) -> Dict[str, Any]:` returning `{"id": …, "title": …, "text": file_content, "url": …, "metadata": …}`
- **Vercel Labs reference TypeScript implementation:**
  - <https://github.com/vercel-labs/deep-research-server/blob/main/app/mcp/route.ts>
  - Verbatim Zod schema: `{ id: z.string().describe("Document ID from search results") }`, returning `{id, title, text, url, metadata}`
- **OpenAI developer docs — MCP integration overview:** <https://developers.openai.com/api/docs/mcp>
- **OpenAI Deep Research API guide:** <https://platform.openai.com/docs/guides/deep-research>
- **MCP TypeScript SDK** (`@modelcontextprotocol/sdk` 1.28+): tool registration with `server.tool(name, description, schema, handler)` is unchanged in 1.28.0; the protocol envelope (`content: [{type: 'text', text: ...}]`) is stable. No SDK rename motivated the de9c937 reversion.

## Current state

- `meteoswiss-mcp` v2.3.1 deployed at <https://meteoswiss-mcp.ars.is/mcp>.
- `fetch` tool refuses ChatGPT-shaped calls: `tools/call {name: "fetch", arguments: {id: "<url>"}}` → Zod validation error (unknown property `id`, missing required `url`).
- Even when called with `{url: …}`, response body has `text` field absent → ChatGPT parses a record with no body content.
- `search` works as-is for ChatGPT; the wrapping object adds harmless extra keys.

## Target state

1. **`fetch` accepts `id` as the canonical param name** (matches OpenAI cookbook + Vercel reference).
2. **`fetch` accepts `url` as a deprecated alias** for one minor version, so any custom client that started relying on the de9c937-era shape doesn't immediately break. Schema rejects the call only if *neither* is provided. Aliasing is implemented with a Zod `preprocess` step — at the schema level the canonical name remains `id`.
3. **`fetch` response includes a `text` field** with the body content (in addition to the existing `content` field for one minor version, for the same back-compat reason).
4. A **dedicated compat integration test suite** asserts:
   - `tools/list` exposes a `fetch` tool whose JSON Schema declares `id` as a required string.
   - Calling `fetch` with `{id: "<url>"}` succeeds and the parsed text payload contains all five canonical fields (`id`, `title`, `text`, `url`, `metadata`).
   - Calling `fetch` with `{url: "<url>"}` (legacy) still succeeds.
   - Calling `search` with `{query: "<…>"}` returns a payload whose parsed JSON contains a `results` array of objects with `id`, `title`, `url`.
   - The MCP envelope (`content[0].type === "text"`, `content[0].text` is parseable JSON) holds.
5. A **tool-manifest snapshot** (`test/__snapshots__/chatgpt-compat.test.ts.snap`) captures the serialized `tools/list` output for `search` and `fetch` (name, description, `inputSchema.properties.*`, `inputSchema.required`). Future renames or rearrangements break the snapshot, forcing an explicit acknowledgement.
6. Existing `test/integration/meteoswiss-fetch.test.ts` is updated to use `id` (or both, to demonstrate the alias) so it stops enforcing the broken shape.

## Design

### Schema change (`src/schemas/meteoswiss-fetch.ts`)

```ts
// Canonical name is `id` (matches OpenAI cookbook/Vercel reference).
// Accept `url` as a deprecated alias for back-compat with v2.3.1 callers.
export const fetchMeteoSwissContentSchema = z
  .preprocess((value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const v = value as Record<string, unknown>;
      if (v.id === undefined && typeof v.url === 'string') {
        return { ...v, id: v.url };
      }
    }
    return value;
  }, z.object({
    id: z.string().min(1, { /* … */ }).describe('…'),
    format: z.enum(['markdown', 'text']).optional().default('markdown'),
    includeMetadata: z.boolean().optional().default(true),
  }));
```

Rationale: `preprocess` keeps the JSON Schema seen by ChatGPT clean (only `id` shows up in `tools/list`), while still accepting legacy `url` calls at runtime. The runtime type stays `{id: string, format: …, includeMetadata: …}`.

### Response shape change (`src/data/meteoswiss-content-data.ts`)

```ts
export interface ContentResponse {
  id: string;
  title?: string;
  text: string;            // canonical (ChatGPT)
  /** @deprecated kept for back-compat with v2.3.1 — will be removed in 3.0 */
  content: string;
  format: 'markdown' | 'text';
  url?: string;            // canonical (ChatGPT) — equals id when id is a URL
  metadata?: { … };
}
```

`processHtmlContent` populates both `text` and `content` with the same string for one minor version. `url` is set to the resolved full URL (which is also `id` for our server, since our IDs *are* URLs).

### Server registration (`src/server.ts`)

No change needed beyond the schema/response updates. The `params.url` reference at line 114 becomes `params.id` (post-preprocess) — and the log line + handler call switch accordingly.

### Tests

- **New file:** `packages/meteoswiss-mcp/test/integration/chatgpt-compat.test.ts`
  - Boots the server via the existing `MCPClient`.
  - Asserts `tools/list` has `search` + `fetch` with the spec'd schemas.
  - Asserts `fetch` with `{id: …}` happy path.
  - Asserts `fetch` with `{url: …}` legacy path.
  - Asserts `search` happy path.
  - Asserts MCP envelope shape (`content[0].type === 'text'`, JSON-parseable text).
  - Snapshot-asserts the manifest entries for `search` + `fetch`.
- **Updated file:** `packages/meteoswiss-mcp/test/integration/meteoswiss-fetch.test.ts`
  - Switch the schema-shape assertion at L31–L52 from `url` (required) to `id` (required).
  - Switch the call-tool inputs from `{url: …}` to `{id: …}`.
  - Replace `result.content` body assertions with `result.text` (keep one assertion that `result.content === result.text` to lock in the back-compat alias).

### Snapshot policy

The snapshot lives at `test/__snapshots__/chatgpt-compat.test.ts.snap`. Reviewers must explicitly approve any change to it. The snapshot includes:

- `name`
- `description`
- `inputSchema.type`
- `inputSchema.properties[*].type` and `properties[*].description`
- `inputSchema.required` (sorted)

It **excludes** generated/volatile fields like JSON-schema `$id`, ordering inside non-required arrays, and zod-generated metadata fields, so it's stable across SDK patch bumps.

## Test plan

1. New `chatgpt-compat.test.ts` passes (new ChatGPT-shaped calls succeed; snapshot matches).
2. Updated `meteoswiss-fetch.test.ts` passes with `id` as the canonical param.
3. Other integration tests continue to pass (no regression to OGD tools).
4. `pnpm --filter meteoswiss-mcp run ci` is green (lint, build, test).
5. Manual smoke: connect ChatGPT custom MCP connector to a local server (`pnpm dev`) and verify a Deep Research run completes end-to-end. *Note: not gated in CI; documented in PR body.*

## Out of scope

- Renaming any of the OGD tools (`meteoswissLocalForecast`, etc.).
- Changing the search response shape — the wrapper `{totalResults, page, pageSize, results}` is tolerated by ChatGPT and used by other clients; a breaking change there would require a major bump.
- Removing the `url` alias and the `content` legacy field — that's a 3.0 task tracked separately.

## Rollout

Single PR from `feature/chatgpt-fetch-compat` → `main`. Patch-level changeset (`meteoswiss-mcp: patch`) since the change is bug-fix-only and additive at the schema level (legacy `url` and `content` still work). Post-merge: standard Changesets bot release flow.

## References

- OpenAI Cookbook MCP server example: <https://github.com/openai/openai-cookbook/blob/main/examples/deep_research_api/how_to_build_a_deep_research_mcp_server/main.py>
- Vercel deep-research-server: <https://github.com/vercel-labs/deep-research-server/blob/main/app/mcp/route.ts>
- OpenAI Developer docs (MCP): <https://developers.openai.com/api/docs/mcp>
- OpenAI Deep Research API: <https://platform.openai.com/docs/guides/deep-research>
- MCP TypeScript SDK: <https://github.com/modelcontextprotocol/typescript-sdk>
- Regressing commit: `de9c937` (B: Fix international city blocklist, NOTASTATION geocoding guard, fetch url param)
- Original `id` introduction: `d6b1c62` (Prod promotion: monorepo, rename, docs overhaul)
