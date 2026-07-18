/**
 * Shared helper for reading MCP tool-call results: the SDK returns a `content` array of
 * typed parts; both the MCP provider (provider-mcp.ts) and the ground-truth capture
 * (capture-ground-truth.ts) only need the concatenated text parts.
 */

/** Concatenate the text parts of an MCP tool-call `content` array (JSON fallback otherwise). */
export function contentToText(content: unknown): string {
  if (!Array.isArray(content)) {
    return JSON.stringify(content);
  }
  return content
    .filter(
      (part): part is { type: string; text: string } =>
        typeof part === "object" &&
        part !== null &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string",
    )
    .map((part) => part.text)
    .join("\n");
}
