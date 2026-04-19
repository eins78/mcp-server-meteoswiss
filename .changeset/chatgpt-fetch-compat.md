---
"meteoswiss-mcp": patch
---

Restore ChatGPT Deep Research / Connectors compatibility for the `fetch` tool. The v2.3.1 release renamed the `fetch` argument from `id` to `url`, which broke the canonical contract that ChatGPT (and the OpenAI Responses API Deep Research models) expects. This release renames it back to `id`, adds the canonical `text` and top-level `url` fields to the `fetch` response, keeps `content` as a back-compat alias of `text`, and adds an integration test suite + tool-manifest snapshot to prevent the regression from recurring. See `docs/plans/2026-04-19-chatgpt-fetch-compat.md` for the full investigation and references.
