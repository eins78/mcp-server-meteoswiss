#!/usr/bin/env node
// Propagate the meteoswiss-skills version into its plugin/marketplace manifests
// and SKILL.md frontmatter.
//
// Changesets versions the `meteoswiss-skills` workspace package normally — it
// bumps `packages/meteoswiss-skills/package.json` and writes the CHANGELOG. But
// the skill is also a Claude Code / Cursor plugin whose version is mirrored in
// four other files that changesets doesn't know about. This script treats
// package.json as the single source of truth and syncs that version into the
// mirrors via targeted string edits (preserving each file's formatting), so a
// `changeset version` run updates the whole skills package consistently.
//
// It runs after `changeset version` in the root `version` script (see
// package.json), alongside the CHANGELOG date-stamping step, and is a no-op when
// everything is already in sync (e.g. an MCP-only release).

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillsPkgDir = join(repoRoot, 'packages', 'meteoswiss-skills');

const pkg = JSON.parse(readFileSync(join(skillsPkgDir, 'package.json'), 'utf8'));
const version = pkg.version;
// Full semver (optional prerelease + build metadata), anchored — reject junk like `1.0.0foo`.
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
if (typeof version !== 'string' || !SEMVER.test(version)) {
  throw new Error(`meteoswiss-skills package.json has an unexpected version: ${String(version)}`);
}

let changed = 0;

/**
 * Update a `"version": "..."` field in a JSON manifest via a targeted string
 * replace (keeps the file's existing indentation/ordering intact).
 *
 * @param {string} relPath - path relative to the meteoswiss-skills package
 * @param {(data: unknown) => string | undefined} selectCurrent - reads the current version
 * @param {string} [anchorName] - if given, replace the first version field AFTER
 *   the `"name": "<anchorName>"` entry rather than the first in the file (so a
 *   nested entry — e.g. the meteoswiss-skills plugin inside marketplace.json's
 *   `plugins` array — is targeted precisely even if another entry shares the same
 *   version string). Matched whitespace-tolerantly, like the version field.
 */
function syncJsonVersion(relPath, selectCurrent, anchorName) {
  const file = join(skillsPkgDir, relPath);
  if (!existsSync(file)) {
    console.warn(`  skip (missing): ${relPath}`);
    return;
  }
  const text = readFileSync(file, 'utf8');
  const current = selectCurrent(JSON.parse(text));
  if (current === undefined) {
    console.warn(`  skip (no version field): ${relPath}`);
    return;
  }
  if (current === version) {
    console.log(`  ok (already ${version}): ${relPath}`);
    return;
  }
  let from = 0;
  if (anchorName) {
    const anchor = new RegExp(`"name"\\s*:\\s*"${anchorName.replace(/[.+\-]/g, '\\$&')}"`);
    const anchorMatch = text.match(anchor);
    if (!anchorMatch) {
      throw new Error(`Could not find anchor "name": "${anchorName}" in ${relPath}`);
    }
    from = anchorMatch.index;
  }
  // Whitespace-tolerant `"version": "<current>"` so a reformatted JSON file
  // (e.g. `"version":"1.0.0"`) doesn't break the release flow. Normalizes to `": "`.
  const escaped = current.replace(/[.+\-]/g, '\\$&');
  const field = new RegExp(`"version"\\s*:\\s*"${escaped}"`);
  const match = text.slice(from).match(field);
  if (!match) {
    throw new Error(`Could not find "version": "${current}" in ${relPath} to update`);
  }
  const at = from + match.index;
  writeFileSync(file, text.slice(0, at) + `"version": "${version}"` + text.slice(at + match[0].length));
  console.log(`  ${current} -> ${version}: ${relPath}`);
  changed++;
}

syncJsonVersion('.claude-plugin/plugin.json', (d) => d?.version);
syncJsonVersion('.cursor-plugin/plugin.json', (d) => d?.version);
syncJsonVersion(
  '.claude-plugin/marketplace.json',
  (d) => d?.plugins?.find((p) => p?.name === 'meteoswiss-skills')?.version,
  'meteoswiss-skills',
);

// SKILL.md frontmatter carries a mirrored `metadata.version` for every skill in
// the package. All skills share the package version under the single-package model.
const skillsDir = join(skillsPkgDir, 'skills');
if (existsSync(skillsDir)) {
  const versionLine = /(\n[ \t]*version:[ \t]*)([^\n]+)/;
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const rel = `skills/${entry.name}/SKILL.md`;
    const file = join(skillsDir, entry.name, 'SKILL.md');
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    const frontmatter = text.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatter) {
      console.warn(`  skip (no frontmatter): ${rel}`);
      continue;
    }
    const match = frontmatter[1].match(versionLine);
    if (!match) {
      console.warn(`  skip (no metadata.version): ${rel}`);
      continue;
    }
    const current = match[2].trim();
    if (current === version) {
      console.log(`  ok (already ${version}): ${rel}`);
      continue;
    }
    const newFrontmatter = frontmatter[1].replace(versionLine, `$1${version}`);
    writeFileSync(file, text.replace(frontmatter[1], newFrontmatter));
    console.log(`  ${current} -> ${version}: ${rel}`);
    changed++;
  }
}

console.log(`sync-skill-manifest-versions: meteoswiss-skills@${version} (${changed} file(s) updated)`);
