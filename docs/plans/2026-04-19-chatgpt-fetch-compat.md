# Plan: ChatGPT Deep Research `fetch`/`search` Compatibility

> Restore canonical ChatGPT Deep Research MCP tool contract for `fetch` (param: `id`, response field: `text`) and lock it in with a regression test suite + serialized tool-manifest snapshot. Document the broader ChatGPT-MCP integration landscape so the next engineer doesn't have to re-do the research.

## Status

- **Phase:** Draft
- **Type:** bug
- **Sprint:**

## TL;DR

`packages/meteoswiss-mcp` v2.3.1 (released 2026-04-18) is incompatible with the **ChatGPT Deep Research / Connectors** MCP contract on the `fetch` tool. Specifically:

| Field | ChatGPT spec (canonical) | `meteoswiss-mcp` v2.3.1 | Status |
|---|---|---|---|
| `fetch` input arg name | `id: string` | `url: string` | ❌ incompatible |
| `fetch` body field name | `text` | `content` | ❌ incompatible |
| `fetch` output keys | `{id, title, text, url, metadata}` | `{id, title, content, format, metadata}` | ❌ incompatible |
| `search` input arg | `query: string` | `query: string` (+ optional `language`, `contentType`, `page`, `pageSize`, `sort`) | ✅ compatible (extras tolerated) |
| `search` output | `{results: [{id, title, text?, url}]}` | `{totalResults, page, pageSize, results: [{id, title, url, description, …}]}` | ✅ tolerated (wrapper extras OK; ChatGPT looks for `results[]` containing `id`/`title`/`url`) |
| MCP envelope | `{content: [{type: "text", text: "<JSON>"}]}` | same | ✅ |

The fix is a minimal rename (`url` → `id`), a response-shape addition (`text` field), and a regression test suite + tool-manifest snapshot to prevent the next "innocent" rename from re-breaking it.

---

## 1. ChatGPT side: how MCP integrates today

ChatGPT exposes **three distinct integration modes**, each with different MCP-server requirements. The meteoswiss server is currently used in mode (a).

### (a) Standard Custom Connector / Deep Research / "Company knowledge"

This is the *default* path for any user (Free/Plus/Pro/Enterprise) connecting an MCP server to ChatGPT — and the only path used by the Deep Research tools (`o3-deep-research-2025-06-26` and successors).

**Required:**

- The server **MUST** expose exactly two tools, named `search` and `fetch`. (Sources cited below all say "MUST"; a community Medium post confirms ChatGPT silently rejects servers that don't.)
- The tools must follow the canonical input/output schemas in §2.
- Other tools may also be registered; ChatGPT will simply ignore them.
- Plus/Pro users in standard mode are *limited to read-only connectors* — `search`/`fetch` only, no destructive writes.

**Quote (OpenAI cookbook README):**
> The Deep Research agent relies specifically on Search and Fetch tools. Search should look through your object store for a set of specfic, top-k IDs. Fetch, is a tool that takes objectIds as arguments and pulls back the relevant resources.

Source: <https://raw.githubusercontent.com/openai/openai-cookbook/main/examples/deep_research_api/how_to_build_a_deep_research_mcp_server/README.md> (commit 012c79d3, 2025-06-26)

**Quote (OpenAI Deep Research guide):**
> The model is optimized to call data sources exposed through this interface and doesn't support tool calls or MCP servers that don't implement this interface.

Source: <https://developers.openai.com/api/docs/guides/deep-research> (accessed 2026-04-19)

### (b) Apps SDK / Developer Mode (full MCP)

A beta channel (launched 2026-03-13 per multiple secondary sources) for Plus/Pro subscribers in Developer Mode that allows arbitrary tool names. Not relevant to meteoswiss today, but worth knowing about for forward planning.

**Differences from (a):**

- Arbitrary tool names allowed (`list_tasks`, `update_task`, etc.).
- Tool annotations are **mandatory**: `readOnlyHint`, `openWorldHint`, `destructiveHint`.
- For UI rendering, resources must declare `"mimeType": "text/html;profile=mcp-app"`.
- Plus/Pro users are **still capped at read-only** connectors even in Developer Mode (writes require Enterprise admin approval).

Source: <https://developers.openai.com/apps-sdk/build/mcp-server> (accessed 2026-04-19)
Secondary: <https://medium.com/@alexeylark/chatgpt-custom-mcp-connectors-with-developer-mode-d791fde17d25>, <https://gist.github.com/ruvnet/7b6843c457822cbcf42fc4aa635eadbb>

### (c) Responses API direct MCP integration (`type: "mcp"` in tools array)

Used by API consumers (not the ChatGPT chat UI) calling the Responses API with an MCP `server_url`. Same Deep Research `search`/`fetch` contract applies when used with `o3-deep-research-*` models. With other models, arbitrary tool names work (regular function-calling).

**Quote (cookbook example):**
```python
tools=[
    {"type": "web_search_preview"},
    {
        "type": "mcp",
        "server_label": "internal_file_lookup",
        "server_url": "http://0.0.0.0:8000/sse/",
        "require_approval": "never",
    },
]
```

`require_approval: "never"` is required for read-only Deep Research operations — otherwise every tool call interrupts the agent for approval.

### Choosing between modes

| Mode | When |
|---|---|
| (a) Standard Custom Connector | meteoswiss today — public read-only connector, free for all ChatGPT tiers, Deep Research compatible. |
| (b) Apps SDK / Developer Mode | If we wanted custom tools (`meteoswissLocalForecast` etc.) callable from ChatGPT chat UI directly. Requires UI design + per-user opt-in. Out of scope. |
| (c) Responses API direct | For programmatic Deep Research integration. Same `search`/`fetch` contract, so this is fixed simultaneously with (a). |

We commit to (a) for now. The fix in this plan is also the right baseline for (c). If we ever pursue (b), this plan's tests still apply (they assert canonical `search`/`fetch` shape — Apps SDK *is allowed to* register additional tools alongside, so the contract is forward-compatible).

---

## 2. Canonical contract (mode a) — verbatim from references

Two independent reference implementations agree on the contract; we cite both verbatim.

### 2.1 OpenAI Cookbook — Python (`fastmcp`)

Source: <https://github.com/openai/openai-cookbook/blob/main/examples/deep_research_api/how_to_build_a_deep_research_mcp_server/main.py> (commit 012c79d3, 2025-06-26)

```python
@mcp.tool()
async def search(query: str) -> Dict[str, List[Dict[str, Any]]]:
    """
    Search for documents using OpenAI Vector Store search.
    ...
    Returns:
        Dictionary with 'results' key containing list of matching documents.
        Each result includes id, title, text snippet, and optional URL.
    """
    ...
    result = {
        "id": item_id,
        "title": item_filename,
        "text": text_snippet,
        "url": f"https://platform.openai.com/storage/files/{item_id}",
    }
    ...
    return {"results": results}

@mcp.tool()
async def fetch(id: str) -> Dict[str, Any]:
    """
    Retrieve complete document content by ID for detailed analysis and citation.
    ...
    Returns:
        Complete document with id, title, full text content, optional URL, and metadata
    """
    ...
    result = {
        "id": id,
        "title": filename,
        "text": file_content,
        "url": f"https://platform.openai.com/storage/files/{id}",
        "metadata": None,
    }
    if hasattr(file_info, "attributes") and file_info.attributes:
        result["metadata"] = file_info.attributes
    return result
```

### 2.2 Vercel Labs — TypeScript (`mcp-handler` + zod)

Source: <https://raw.githubusercontent.com/vercel-labs/deep-research-server/main/app/mcp/route.ts>

```ts
server.tool(
  "search",
  "Search for documents using semantic search. ...",
  { query: z.string().describe("Search query string. ...") },
  { title: 'Search documents', readOnlyHint: true },
  async ({ query }) => {
    ...
    return { content: [{ type: "text", text: JSON.stringify({ results }, null, 2) }] };
  }
);

server.tool(
  "fetch",
  "Retrieve complete document content by ID for detailed analysis and citation. ...",
  { id: z.string().describe("Document ID from search results (e.g., doc_1, doc_2, etc.)") },
  { title: 'Fetch document', readOnlyHint: true },
  async ({ id }) => {
    ...
    const result = {
      id: document.id,
      title: document.title,
      text: document.text,
      url: document.url,
      metadata: { source: "sample_data", created_at: "...", updated_at: "..." },
    };
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);
```

### 2.3 Synthesised contract

| Tool | Input | Output payload (JSON-stringified into `content[0].text`) |
|---|---|---|
| `search` | `{ query: string }` | `{ results: Array<{ id: string; title: string; text?: string; url: string }> }` |
| `fetch` | `{ id: string }` | `{ id: string; title: string; text: string; url: string; metadata?: object \| null }` |

### 2.4 MCP envelope

Both references wrap the JSON payload in the standard MCP `tools/call` result envelope:

```json
{
  "content": [
    { "type": "text", "text": "<JSON.stringify(payload)>" }
  ]
}
```

The MCP 2025-11-25 spec also allows `structuredContent` (typed JSON object alongside the text). ChatGPT today reads only `content[0].text`; emitting `structuredContent` is harmless but not required.

> **Quote (MCP spec 2025-11-25, Tools page):**
> *"For backwards compatibility, a tool that returns structured content SHOULD also return the serialized JSON in a TextContent block."*

Source: <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>

---

## 3. Transport, auth, protocol revision, error semantics

### Transport

| Transport | Status for ChatGPT |
|---|---|
| Streamable HTTP (`/mcp` endpoint, POST/GET/DELETE) | ✅ Supported (used today by meteoswiss). |
| SSE (`/sse/` endpoint) | ✅ Supported (used by OpenAI cookbook example). |
| stdio | ❌ Not for remote connectors. Used only when ChatGPT is bridged via `mcp-remote`. |
| WebSocket | ❌ Not standard for ChatGPT. |

OpenAI Responses API:
> *"The Responses API works with remote MCP servers supporting either the Streamable HTTP or the HTTP/SSE transport protocols."*

Source: <https://developers.openai.com/api/docs/guides/tools-connectors-mcp>

### MCP protocol revision

The TS SDK currently shipped in our `package.json` is `@modelcontextprotocol/sdk@^1.28.0` (latest 1.x at time of writing is 1.29.0, released 2026-03-30).

- The 2025-11-25 protocol revision is supported from SDK **1.24.0** onward.
- Our integration test client (`packages/meteoswiss-mcp/test/integration/mcp-client.ts:172`) handshakes with `protocolVersion: '2025-11-25'`, so we are speaking the latest stable revision.
- ChatGPT/OpenAI tutorials reference `2025-06-18` as the negotiation target (Apps SDK Developer Mode tutorial, gist `ruvnet/7b6843c457822cbcf42fc4aa635eadbb`); MCP servers are required to support the negotiated version, and our SDK transparently negotiates down to 2025-06-18 if a client requests it.

### MCP TS SDK changelog scan (1.21 → 1.29)

I scanned every release between 1.21 and 1.29 (`https://api.github.com/repos/modelcontextprotocol/typescript-sdk/releases`). Relevant findings:

- **1.23.0 (2025-11-25):** Zod v4 support added with v3.25+ backwards compat (PR #1040).
- **1.24.0 (2025-12-02):** Spec bump to **2025-11-25** (PR #1166). `registerTool` signature update for typed `ToolCallback` (PR #1188). Hanging stdio servers fix (PR #1200).
- **1.25.0 (2025-12-15):** Zod v4 schema description extraction fix (PR #1296). `outputSchema` updates supported (PR #1048).
- **1.26.0 (2026-02-04):** GHSA-345p-7cg4-v4c7 security advisory: shared server/transport instances could leak cross-client response data. Fixed.
- **1.27.0 (2026-02-16):** Streaming methods for elicitation/sampling.
- **1.28.0 (2026-03-25, our version):** `inputSchema` validation tightened — *"reject plain JSON Schema objects passed as inputSchema"* (PR #1596). RFC 8252 loopback port relaxation in OAuth (PR #1738).
- **1.29.0 (2026-03-30):** Mostly auth fixes; backport of `null` (infinite) requested-TTL disallow.
- **2.0.0-alpha (2026-04-01):** Switches to Standard Schema spec (Zod v4, Valibot, ArkType, ...). **Unknown/disabled tool calls now return JSON-RPC `-32602` instead of `CallToolResult` with `isError: true`** — relevant breaking change *if/when* we upgrade.

**Conclusion:** No SDK release in this range renamed a tool-arg field, deprecated the `id` parameter name, or otherwise motivated the rc.3-era `id → url` rename. The rename was not SDK-driven.

### Auth

Public read-only servers (us): no auth required. ChatGPT connects as anonymous MCP client. The OpenAI Apps SDK and Connectors docs **recommend** OAuth + dynamic client registration for any server that touches user data — but for a read-only public weather server, no-auth is the documented happy path.

> *"We recommend using OAuth and dynamic client registration."* — <https://developers.openai.com/api/docs/mcp>
> *"`require_approval: never`"* — required for Deep Research read-only flows so the agent doesn't pause on every tool call.

### Error semantics

MCP 2025-11-25 distinguishes:

1. **Protocol errors** — JSON-RPC `error` with codes like `-32602` (Invalid params), `-32601` (Method not found). Returned for unknown tools, malformed `tools/call` requests, etc.
2. **Tool execution errors** — `result.isError: true` with `content[]` containing a human-readable message.

The current meteoswiss `fetch` returns tool-execution errors (`isError: true` + text content) for fetch failures. That matches the spec — **don't change error handling in this PR**.

### Response size

No hard limit documented for ChatGPT. The OpenAI reference `mcp-fetch` server (`modelcontextprotocol/servers/src/fetch`) implements pagination via `start_index` + `max_length` because LLMs choke on long content; that pattern is for non-Deep-Research use though. For Deep Research, the cookbook returns full file content unchunked. Our pages are small (typical MeteoSwiss article is a few hundred KB of HTML, which simplifies to a few thousand chars of markdown), so we're safe. **Out of scope here.**

---

## 4. Reference servers — what they do (and why they're different)

| Server | Tool name | Input arg | For ChatGPT? |
|---|---|---|---|
| OpenAI cookbook `deep_research_api` | `fetch` | `id` | ✅ Yes — canonical. |
| Vercel Labs `deep-research-server` | `fetch` | `id` | ✅ Yes — canonical TS reference. |
| `modelcontextprotocol/servers/src/fetch` (Python) | `fetch` | `url` (a `Fetch` Pydantic model with `url: AnyUrl`) | ❌ No. Generic web-scraper, not Deep-Research-shaped. |

The third one is what the user's de9c937 reversion was probably modelling. But the generic `fetch` server is a *different* tool — it's not designed to be paired with `search` and isn't on the ChatGPT compat path. Source: <https://raw.githubusercontent.com/modelcontextprotocol/servers/main/src/fetch/src/mcp_server_fetch/server.py>.

> **Takeaway:** "MCP fetch server" is an overloaded name. There's the **generic web fetcher** (`url`) and the **Deep Research record fetcher** (`id`). Meteoswiss is the latter.

---

## 5. Our current declaration

Files of record (paths relative to `packages/meteoswiss-mcp/`):

- `src/schemas/meteoswiss-fetch.ts` — Zod schema for the `fetch` tool params.
- `src/schemas/meteoswiss-search.ts` — Zod schema for the `search` tool params.
- `src/tools/meteoswiss-fetch.ts` — Handler wrapper.
- `src/tools/meteoswiss-search.ts` — Handler wrapper.
- `src/data/meteoswiss-content-data.ts` — Data layer for fetch (returns `ContentResponse`).
- `src/data/meteoswiss-search-data.ts` — Data layer for search (returns `SearchResults`).
- `src/server.ts` — Calls `server.tool('search', …)` and `server.tool('fetch', …)`.

### Current `fetch` shape (v2.3.1)

**Input schema** (`src/schemas/meteoswiss-fetch.ts`):
```ts
z.object({
  url: z.string().min(1).describe('Full URL of a MeteoSwiss page to fetch...'),
  format: z.enum(['markdown', 'text']).optional().default('markdown'),
  includeMetadata: z.boolean().optional().default(true),
})
```

**Output payload** (`ContentResponse` in `src/data/meteoswiss-content-data.ts`):
```ts
{
  id: string;        // populated as the resolved full URL
  title?: string;
  content: string;   // body text — wrong field name for ChatGPT
  format: 'markdown' | 'text';
  metadata?: { url, language?, lastModified?, contentType?, keywords?, description? };
}
```

### Current `search` shape (v2.3.1)

**Input:**
```ts
z.object({
  query: z.string().min(1).describe('The search query string'),
  language: z.enum(['de','fr','it','en']).optional().default('de'),
  contentType: z.enum(['content','press-release','blog-article','publication']).optional(),
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().positive().max(100).optional().default(12),
  sort: z.enum(['relevance','date-desc','date-asc']).optional().default('relevance'),
})
```

**Output payload** (`SearchResults`):
```ts
{
  totalResults: number;
  page: number;
  pageSize: number;
  results: Array<{
    id: string;          // full URL — matches ChatGPT spec
    title: string;       // matches
    url: string;         // matches
    description?: string;
    contentType?: string;
    lastModified?: string;
    path?: string;
    lead?: string;
    publicationDate?: string;
  }>;
}
```

### Diff vs canonical

1. **`fetch.input.id` is missing** (we have `url` instead). **Incompatible.**
2. **`fetch.output.text` is missing** (we have `content` instead). **Incompatible.**
3. **`fetch.output.url` is missing at the top level** (only inside `metadata`). **Incompatible** with the strict spec, though tolerated in practice if `id` is a URL.
4. `search.input.query` ✓.
5. `search.output.results[*]` has `id`, `title`, `url` ✓ — extra fields ignored.
6. MCP envelope (`content[0].type === 'text'`, JSON-stringified body) ✓.

### Origin of the regression

```
b1850b5 (2026-04-03)  B: Fix fetch tool description — id must be full URL from search
de9c937 (2026-04-18)  B: Fix international city blocklist, NOTASTATION geocoding guard, fetch url param
                          ↑↑↑ this commit reverted id → url in src/schemas/meteoswiss-fetch.ts
```

The de9c937 commit message claims *"Revert fetch schema param id → url (rc.3 rename was unintentional)"*. Git history says otherwise: `id` has been the param name since the very first commit that introduced this file (`d6b1c62` *"Prod promotion: monorepo, rename, docs overhaul"*). There was no rc.3 rename of `url → id`; the field was always `id`. The de9c937 reversion is therefore not actually a revert — it's a regression that landed in v2.3.1 and broke the ChatGPT happy path.

The existing test `test/integration/meteoswiss-fetch.test.ts:34` *enforces* the broken `url` shape, so the regression slipped through CI. That test must be updated as part of the fix.

---

## 6. Target state

### 6.1 Source changes (minimal)

| File | Change |
|---|---|
| `src/schemas/meteoswiss-fetch.ts` | Rename input field `url` → `id`. Update description. No alias shim — see §6.2 for rationale. |
| `src/data/meteoswiss-content-data.ts` | `ContentResponse` gains `text: string` (canonical) and top-level `url: string` (matches resolved page URL). `content` stays as a deprecated alias of `text` for one minor version so existing callers and snapshots aren't broken in this PR. Internal variables renamed `url → id` where they refer to the input, kept as `url` only for the resolved full URL inside the function. |
| `src/tools/meteoswiss-fetch.ts` | `params.url` → `params.id` in the debug log line. |
| `src/server.ts` | `params.url` → `params.id` in the request log line. Tool description text updated to refer to `id`. |
| `test/integration/meteoswiss-fetch.test.ts` | Update the JSON-Schema shape assertion (`required: ['url']` → `required: ['id']`, etc.), update all `callTool('fetch', {url: …})` calls to use `{id: …}`, and add an assertion that `result.content === result.text` to lock in the alias. |

No changes to `search` schema or response shape — they're already compatible.

### 6.2 Why no `url` alias shim?

The `url` field shape is **24 hours old in production** (v2.3.1 published 2026-04-18). The only operator deploying this server is the user (eins78). No third-party automation has had time to integrate against `url`. Adding a `z.preprocess` shim that accepts both `id` and `url` would:

- Pollute `tools/list` (advertise both fields → ChatGPT might pick the wrong one).
- Or hide `url` from `tools/list` but still accept it at runtime (mismatch between schema and reality, hard to test).
- Add complexity for ~zero real callers.

**Decision:** Pure rename. No alias.

### 6.3 Why keep `content` as an alias of `text`?

The existing test suite has *many* assertions on `result.content`. Renaming `content → text` *and* removing `content` in the same PR balloons the diff and risks breaking ancillary tests we haven't audited. The two-step path (add `text`, deprecate `content`, remove in 3.0) is cheaper and safer.

### 6.4 New `text` + `url` at top level, not just in `metadata`

ChatGPT reads:
- `result.text` — the body content.
- `result.url` — the canonical citation URL.

Both should be at the top level of the JSON-stringified payload. The existing `metadata.url` is preserved (other clients may rely on it).

---

## 7. Test plan

### 7.1 New file: `test/integration/chatgpt-compat.test.ts`

A dedicated integration test suite that boots the server (via the existing `MCPClient` harness, with `USE_TEST_FIXTURES=true`) and asserts the canonical ChatGPT contract end-to-end:

1. **`tools/list` exposes `search` and `fetch`** with the spec'd schemas.
   - `fetch.inputSchema`: `properties.id.type === 'string'`, `required` contains `'id'`, does **not** contain `'url'`.
   - `search.inputSchema`: `properties.query.type === 'string'`, `required` contains `'query'`.
2. **`fetch` happy path** with `{id: "<full URL>"}` succeeds.
   - Response `content[0].type === 'text'`.
   - Parsed body has `id`, `title`, `text` (non-empty string), `url`, `metadata`.
   - `text === content` (back-compat alias).
3. **`fetch` rejects calls without `id`** — calling with `{}` returns either a JSON-RPC protocol error or `isError: true`. (Whichever the SDK does — assert at least one of them.)
4. **`search` happy path** with `{query: "klima"}` succeeds.
   - Parsed body has a `results` array.
   - Every result has `id` (string), `title` (string), `url` (string).
5. **MCP envelope holds** for both tools — `content[0].type === 'text'`, `content[0].text` is parseable JSON.
6. **Snapshot assertion** — see §7.2.

Each test cites the source-of-truth URL in a comment so future readers know why the assertion exists.

### 7.2 Manifest snapshot

`test/__snapshots__/chatgpt-compat.test.ts.snap` (Jest snapshot) captures a normalised version of the `tools/list` output for `search` and `fetch`:

```jsonc
{
  "search": {
    "name": "search",
    "description": "<…>",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": { "type": "string", "description": "<…>" },
        // … other properties (sorted)
      },
      "required": ["query"]   // sorted
    }
  },
  "fetch": {
    "name": "fetch",
    "description": "<…>",
    "inputSchema": {
      "type": "object",
      "properties": {
        "id": { "type": "string", "description": "<…>" },
        "format": { … },
        "includeMetadata": { … }
      },
      "required": ["id"]
    }
  }
}
```

The serialiser:
- Sorts `required` arrays.
- Sorts object keys alphabetically.
- Strips zod-internal/`additionalProperties: false` noise that may shift between SDK patches.
- Includes the `description` field (so renaming/rewording the description triggers a snapshot diff and forces the reviewer to acknowledge the change).

### 7.3 Updated existing tests

`test/integration/meteoswiss-fetch.test.ts`:
- `properties.url` → `properties.id`.
- `required: ['url']` → `required: ['id']`.
- All `callTool('fetch', {url: …})` → `callTool('fetch', {id: …})`.
- Add `expect(result.text).toBe(result.content)` (alias guard).
- Existing assertions on `result.content` stay (they validate the alias still works).

### 7.4 Manual verification (out of CI)

- `pnpm dev` to boot a local server.
- Connect ChatGPT custom MCP connector to `http://localhost:3000/mcp`.
- Trigger a Deep Research run that hits both `search` and `fetch`.
- Confirm citations render with our URLs.

Documented in the PR body, not gated in CI (the OpenAI Responses API requires an API key + cost).

---

## 8. Out of scope (explicit non-goals)

- Renaming any of the OGD tools (`meteoswissLocalForecast`, `meteoswissCurrentWeather`, etc.). Those are not on the Deep Research path.
- Switching the search response from the `{totalResults, page, pageSize, results}` wrapper to a bare `{results}` — would break other clients and is unnecessary.
- Removing the `content` alias — that's a 3.0 task.
- Implementing the `outputSchema` (MCP 2025-11-25 typed-output feature) — would be nice for ChatGPT clients that *do* read `structuredContent`, but not required.
- Adding pagination to `fetch` (à la `mcp-fetch` server's `start_index`/`max_length`) — our pages are small.
- Apps SDK / Developer Mode integration (mode b) — separate plan if/when needed.

---

## 9. Rollout

Single PR from `feature/chatgpt-fetch-compat` → `main`.

Commits (atomic, in this order):
1. `docs/plans: chatgpt fetch compat plan` — this document.
2. `meteoswiss-mcp: add chatgpt fetch/search compat tests` — the new compat test suite + snapshot. **Will fail** until step 3 lands; structured this way so the failure proves the regression. (Will be combined with step 3 in the PR; can be split locally if reviewing.)
3. `meteoswiss-mcp: restore id/text fields for chatgpt deep research` — the source fix + updated existing test. New tests now pass.
4. `changeset: chatgpt fetch compat` — patch-level changeset. Bug fix only.

Patch-level (`meteoswiss-mcp: patch`) is appropriate because:
- Behavioural change is restricted to the `fetch` tool's argument naming (rename `url` → `id`).
- The new `text` and top-level `url` fields are *additions* to the response — non-breaking for any client that reads `content` and `metadata.url`.
- The `content` alias preserves the v2.3.1 response shape for all consumers.

If anyone is somehow calling production `fetch` with `{url: …}` today (24-hour window since v2.3.1 release), they'll need to switch to `{id: …}` after the next release. That's a documented patch-level break, justified because v2.3.1 itself was the broken release.

---

## 10. References

- OpenAI Cookbook MCP server example (Python, `fastmcp`) — canonical Deep Research reference:
  <https://github.com/openai/openai-cookbook/blob/main/examples/deep_research_api/how_to_build_a_deep_research_mcp_server/main.py>
  (commit 012c79d3, 2025-06-26)
- Vercel Labs `deep-research-server` (TypeScript, `mcp-handler`) — canonical TS reference:
  <https://github.com/vercel-labs/deep-research-server/blob/main/app/mcp/route.ts>
- OpenAI MCP integration overview:
  <https://developers.openai.com/api/docs/mcp> (accessed 2026-04-19)
- OpenAI Deep Research API guide:
  <https://developers.openai.com/api/docs/guides/deep-research> (accessed 2026-04-19)
- OpenAI Apps SDK MCP server guide (Developer Mode pathway):
  <https://developers.openai.com/apps-sdk/build/mcp-server> (accessed 2026-04-19)
- OpenAI Responses API tools/connectors guide:
  <https://developers.openai.com/api/docs/guides/tools-connectors-mcp> (accessed 2026-04-19)
- ChatGPT custom MCP Developer Mode (community confirmation + arbitrary tool names):
  <https://medium.com/@alexeylark/chatgpt-custom-mcp-connectors-with-developer-mode-d791fde17d25>
  <https://gist.github.com/ruvnet/7b6843c457822cbcf42fc4aa635eadbb>
- MCP 2025-11-25 specification, Tools page:
  <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>
- MCP TypeScript SDK releases (1.21–2.0-alpha):
  <https://github.com/modelcontextprotocol/typescript-sdk/releases>
- Generic `mcp-fetch` reference server (NOT the Deep Research one):
  <https://github.com/modelcontextprotocol/servers/tree/main/src/fetch>
- Regressing commit: `de9c937` *"B: Fix international city blocklist, NOTASTATION geocoding guard, fetch url param"* (2026-04-18).
- Original `id` introduction: `d6b1c62` *"Prod promotion: monorepo, rename, docs overhaul"* (2026-03-29).
