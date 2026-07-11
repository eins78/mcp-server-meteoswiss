---
"meteoswiss-mcp": minor
---

All 7 tools now declare Zod output schemas and return MCP `structuredContent` alongside the JSON text content. Tool registrations migrated from the deprecated `server.tool()` to `registerTool()`, so `tools/list` now advertises each tool's full output shape (with per-field descriptions) in addition to its input schema, and the SDK validates every response against the declared schema at runtime. Response shapes are unchanged — the previously hand-written TypeScript response types are now derived from the schemas via `z.infer`.
