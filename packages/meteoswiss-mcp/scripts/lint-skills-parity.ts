/**
 * Skills↔MCP parity lint (structural gate) — CLI.
 *
 * Modes:
 *   tsx scripts/lint-skills-parity.ts            # lint (exit 1 on any finding)
 *   tsx scripts/lint-skills-parity.ts --update   # regenerate parity/tool-inventory.json
 *
 * The tool inventory is generated from the live server's own `tools/list`
 * response, in-process (createServer → InMemoryTransport → Client.listTools())
 * — no network, no fixtures needed, because tool registration is static.
 * See scripts/skills-parity-lib.ts for what the gate does and does not check.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createServer } from '../src/server.js';
import {
  buildInventory,
  renderInventory,
  parseExceptions,
  extractMarkers,
  extractCanonicalSourcePaths,
  checkParity,
  ToolInventorySchema,
  type RawToolListEntry,
  type ToolInventory,
} from './skills-parity-lib.js';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptsDir, '..');
const repoRoot = path.resolve(packageDir, '../..');

const INVENTORY_PATH = path.join(packageDir, 'parity', 'tool-inventory.json');
const EXCEPTIONS_PATH = path.join(packageDir, 'parity', 'parity-exceptions.yml');
const SKILL_DIR = path.join(repoRoot, 'packages/meteoswiss-skills/skills/meteoswiss-ogd');
const SKILL_MARKDOWN_FILES = ['SKILL.md', 'REFERENCE.md'];

/** Generate the live inventory from the server's own tools/list response. */
async function generateLiveInventory(): Promise<ToolInventory> {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'skills-parity-lint', version: '0.0.0' }, { capabilities: {} });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const { tools } = await client.listTools();
  await client.close();
  return buildInventory(tools as RawToolListEntry[]);
}

/** Resolve an exception/canonical-source path against the repo root or the MCP package. */
function resolveReferencedPath(referenced: string): string[] {
  // Referenced paths come from repo content (exceptions file, provenance comments)
  // and must stay repo-relative: an absolute or `..`-traversing path could match a
  // file OUTSIDE the repo and wrongly pass the staleness check.
  if (path.isAbsolute(referenced) || referenced.split('/').includes('..')) {
    return [];
  }
  if (referenced.startsWith('packages/')) {
    return [path.join(repoRoot, referenced)];
  }
  return [path.join(packageDir, referenced), path.join(repoRoot, referenced)];
}

async function main(): Promise<void> {
  const update = process.argv.includes('--update');
  const live = await generateLiveInventory();

  if (update) {
    mkdirSync(path.dirname(INVENTORY_PATH), { recursive: true });
    writeFileSync(INVENTORY_PATH, renderInventory(live));
    console.error(`skills-parity: wrote ${path.relative(repoRoot, INVENTORY_PATH)} (${live.tools.length} tools)`);
    process.exit(0);
  }

  let committed: ToolInventory | null = null;
  if (existsSync(INVENTORY_PATH)) {
    committed = ToolInventorySchema.parse(JSON.parse(readFileSync(INVENTORY_PATH, 'utf-8')));
  }

  const exceptions = parseExceptions(loadYaml(readFileSync(EXCEPTIONS_PATH, 'utf-8')));

  const markers: string[] = [];
  const canonicalSourcePaths: string[] = [];
  for (const file of SKILL_MARKDOWN_FILES) {
    const markdown = readFileSync(path.join(SKILL_DIR, file), 'utf-8');
    markers.push(...extractMarkers(markdown));
    canonicalSourcePaths.push(...extractCanonicalSourcePaths(markdown));
  }

  const findings = checkParity({
    live,
    committed,
    markers,
    exceptions,
    fileExists: (p) => resolveReferencedPath(p).some((candidate) => existsSync(candidate)),
    canonicalSourcePaths,
  });

  if (findings.length === 0) {
    console.error(
      `skills-parity: OK — ${live.tools.length} tools, ${exceptions['excluded-tools'].length} excluded, ${new Set(markers).size} covered by markers`
    );
    process.exit(0);
  }

  console.error(`skills-parity: FAILED — ${findings.length} finding(s):\n`);
  for (const finding of findings) {
    console.error(`  [${finding.kind}] ${finding.message}\n`);
  }
  console.error(
    'The skills package (packages/meteoswiss-skills) must stay in sync with the MCP tool surface.\nSee docs/plans/2026-07-11-skills-mcp-parity.md for how this gate works.'
  );
  process.exit(1);
}

main().catch((error: unknown) => {
  console.error('skills-parity: crashed:', error);
  process.exit(1);
});
