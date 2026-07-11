/**
 * Skills↔MCP parity — structural gate library.
 *
 * Pure logic for the parity lint (see lint-skills-parity.ts for the CLI).
 * Scope: this gate is STRUCTURAL — it proves that every in-scope MCP tool has a
 * marked skill section (coverage), that nothing references tools or files that
 * no longer exist (staleness), and that any change to the server's tool surface
 * is consciously acknowledged by regenerating the committed inventory snapshot
 * (drift). It does NOT judge whether the skill's prose correctly *describes*
 * the tools — that semantic layer is a deliberate non-goal here (see
 * docs/plans/2026-07-11-skills-mcp-parity.md).
 *
 * Source of truth: the live server's own `tools/list` response, captured
 * in-process (createServer → InMemoryTransport → Client.listTools()). Never
 * hand-maintained.
 */

import { z } from 'zod';

// --- Tool inventory (generated from tools/list — the source of truth) ---

/** One tool's advertised contract, as normalized from a `tools/list` response. */
export const ToolInventoryEntrySchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
});
export type ToolInventoryEntry = z.infer<typeof ToolInventoryEntrySchema>;

export const ToolInventorySchema = z.object({
  /** Reminder for humans reading the JSON — the file is machine-generated. */
  $comment: z.string(),
  tools: z.array(ToolInventoryEntrySchema),
});
export type ToolInventory = z.infer<typeof ToolInventorySchema>;

export const INVENTORY_COMMENT =
  'GENERATED FILE — do not edit. Regenerate with: pnpm --filter meteoswiss-mcp run parity:update';

/** Shape of a raw tools/list entry we consume (subset of the MCP Tool type). */
export type RawToolListEntry = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
};

/**
 * Normalize a raw `tools/list` response into the committed inventory shape.
 * Tools are sorted by name so the snapshot is byte-stable across runs.
 */
export function buildInventory(rawTools: RawToolListEntry[]): ToolInventory {
  const tools = [...rawTools]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => {
      const entry: ToolInventoryEntry = {
        name: t.name,
        description: t.description ?? '',
        inputSchema: t.inputSchema ?? {},
      };
      if (t.outputSchema !== undefined) {
        entry.outputSchema = t.outputSchema;
      }
      return entry;
    });
  return { $comment: INVENTORY_COMMENT, tools };
}

/** Render an inventory as the canonical committed-snapshot JSON text. */
export function renderInventory(inventory: ToolInventory): string {
  return `${JSON.stringify(inventory, null, 2)}\n`;
}

// --- Exceptions file (exclusions + non-schema residual — the ONLY hand-written part) ---

/**
 * Exclusions and residual mappings are documented decisions — a blank reason
 * would let the YAML satisfy the lint without actually documenting anything.
 */
const ReasonSchema = z.string().trim().min(10, 'reason must be a meaningful explanation');

export const ParityExceptionsSchema = z.object({
  'excluded-tools': z.array(
    z.object({
      name: z.string(),
      reason: ReasonSchema,
    })
  ),
  exceptions: z.array(
    z.object({
      source: z.string(),
      skill: z.string(),
      reason: ReasonSchema,
    })
  ),
});
export type ParityExceptions = z.infer<typeof ParityExceptionsSchema>;

/** Parse and validate the exceptions YAML (already loaded as an unknown value). */
export function parseExceptions(loaded: unknown): ParityExceptions {
  return ParityExceptionsSchema.parse(loaded);
}

// --- Coverage markers ---

const MARKER_PATTERN = /<!--\s*mcp-tool:\s*([A-Za-z0-9_-]+)\s*-->/g;

/** Extract all `<!-- mcp-tool: NAME -->` coverage markers from a markdown text. */
export function extractMarkers(markdown: string): string[] {
  const names: string[] = [];
  for (const match of markdown.matchAll(MARKER_PATTERN)) {
    const name = match[1];
    if (name !== undefined) {
      names.push(name);
    }
  }
  return names;
}

// --- Canonical-source provenance comments (the skill's own existing convention) ---

const CANONICAL_SOURCE_PATTERN = /<!--\s*Canonical source:\s*([^>]*?)-->/g;
const PATH_TOKEN_PATTERN = /[\w@][\w@./-]*\.[a-z]+/g;

/**
 * Extract file paths referenced by `<!-- Canonical source: ... -->` comments.
 * Paths may be repo-root-relative (`packages/...`) or relative to the MCP
 * package (`src/...`) — the caller resolves them.
 */
export function extractCanonicalSourcePaths(markdown: string): string[] {
  const paths: string[] = [];
  for (const match of markdown.matchAll(CANONICAL_SOURCE_PATTERN)) {
    const body = match[1];
    if (body === undefined) continue;
    for (const token of body.matchAll(PATH_TOKEN_PATTERN)) {
      paths.push(token[0]);
    }
  }
  return paths;
}

// --- Findings ---

export type ParityFinding = {
  kind:
    | 'inventory-drift'
    | 'missing-marker'
    | 'stale-marker'
    | 'stale-exclusion'
    | 'excluded-but-marked'
    | 'stale-exception-source'
    | 'stale-canonical-source';
  message: string;
};

/**
 * The structural parity check.
 *
 * @param live - inventory generated from the running server (source of truth)
 * @param committed - the committed snapshot (null when the file is missing)
 * @param markers - all coverage markers found across the skill's markdown files
 * @param exceptions - parsed exceptions file
 * @param fileExists - existence probe for exception-source / canonical-source paths
 *                     (receives the path verbatim; caller pre-resolves roots)
 * @param canonicalSourcePaths - paths referenced by Canonical-source comments
 */
export function checkParity(args: {
  live: ToolInventory;
  committed: ToolInventory | null;
  markers: string[];
  exceptions: ParityExceptions;
  fileExists: (path: string) => boolean;
  canonicalSourcePaths: string[];
}): ParityFinding[] {
  const { live, committed, markers, exceptions, fileExists, canonicalSourcePaths } = args;
  const findings: ParityFinding[] = [];

  const liveNames = new Set(live.tools.map((t) => t.name));
  const excludedNames = new Set(exceptions['excluded-tools'].map((e) => e.name));
  const markerNames = new Set(markers);

  // 1. Drift: the committed snapshot must byte-match the live tool surface.
  if (committed === null) {
    findings.push({
      kind: 'inventory-drift',
      message:
        'No committed tool inventory found. Run `pnpm --filter meteoswiss-mcp run parity:update` and commit the result.',
    });
  } else if (renderInventory(committed) !== renderInventory(live)) {
    const committedNames = new Set(committed.tools.map((t) => t.name));
    const added = [...liveNames].filter((n) => !committedNames.has(n));
    const removed = [...committedNames].filter((n) => !liveNames.has(n));
    const changed = live.tools
      .filter((t) => {
        const prev = committed.tools.find((c) => c.name === t.name);
        return prev !== undefined && JSON.stringify(prev) !== JSON.stringify(t);
      })
      .map((t) => t.name);
    const details = [
      added.length > 0 ? `added: ${added.join(', ')}` : null,
      removed.length > 0 ? `removed: ${removed.join(', ')}` : null,
      changed.length > 0 ? `changed: ${changed.join(', ')}` : null,
    ]
      .filter((d): d is string => d !== null)
      .join('; ');
    findings.push({
      kind: 'inventory-drift',
      message:
        `The server's tool surface changed but the committed inventory snapshot was not regenerated (${details}). ` +
        'Run `pnpm --filter meteoswiss-mcp run parity:update`, review whether the skill (packages/meteoswiss-skills) needs a matching update, and commit both.',
    });
  }

  // 2. Completeness: every in-scope live tool needs a coverage marker in the skill.
  for (const tool of live.tools) {
    if (excludedNames.has(tool.name)) continue;
    if (!markerNames.has(tool.name)) {
      findings.push({
        kind: 'missing-marker',
        message:
          `Tool "${tool.name}" has no skill coverage: no \`<!-- mcp-tool: ${tool.name} -->\` marker found in the skill's markdown. ` +
          'Document the capability in packages/meteoswiss-skills/skills/meteoswiss-ogd/ and add the marker to the covering section (or, for a deliberate permanent exclusion, add it to parity-exceptions.yml with a reason).',
      });
    }
  }

  // 3. Marker staleness: every marker must name a live tool.
  for (const name of markerNames) {
    if (!liveNames.has(name)) {
      findings.push({
        kind: 'stale-marker',
        message: `Skill marker \`<!-- mcp-tool: ${name} -->\` names a tool that no longer exists on the server. Update or remove the marked skill section.`,
      });
    }
  }

  // 4. Exclusion staleness: excluded tools must still exist (else the entry is dead).
  for (const excluded of exceptions['excluded-tools']) {
    if (!liveNames.has(excluded.name)) {
      findings.push({
        kind: 'stale-exclusion',
        message: `parity-exceptions.yml excludes tool "${excluded.name}", but no such tool exists on the server. Remove the stale entry.`,
      });
    }
    // An excluded tool with a marker is contradictory — one of the two is wrong.
    if (markerNames.has(excluded.name)) {
      findings.push({
        kind: 'excluded-but-marked',
        message: `Tool "${excluded.name}" is excluded in parity-exceptions.yml but also has a skill coverage marker. Remove the exclusion or the marker.`,
      });
    }
  }

  // 5. Exception-source staleness: mapped residual files must still exist.
  for (const exception of exceptions.exceptions) {
    if (!fileExists(exception.source)) {
      findings.push({
        kind: 'stale-exception-source',
        message: `parity-exceptions.yml maps "${exception.source}" → "${exception.skill}", but the source file no longer exists. Update or remove the entry.`,
      });
    }
  }

  // 6. Canonical-source staleness: the skill's own provenance comments must resolve.
  for (const path of canonicalSourcePaths) {
    if (!fileExists(path)) {
      findings.push({
        kind: 'stale-canonical-source',
        message: `A \`<!-- Canonical source: ... -->\` comment in the skill references "${path}", which no longer exists. Update the provenance comment.`,
      });
    }
  }

  return findings;
}
