#!/usr/bin/env node
// Stamp today's release date onto the version headers that `changeset version`
// just added.
//
// `@changesets/cli/changelog` writes bare `## X.Y.Z` headers with no date. This
// rewrites each NEWLY-ADDED one to `## X.Y.Z - YYYY-MM-DD` (unbracketed) — the
// same format the historical-entry backfill (#124) applies, so past and future
// entries match once both land. It runs after `changeset version` in the root
// `version` script, alongside the skills manifest sync.
//
// "Newly added" is detected via `git diff HEAD` restricted to CHANGELOG files,
// so it only ever touches the header(s) this run introduced — never a
// pre-existing entry, and never a historical undated header lower in the file.
// Combined with the bare-header match it is idempotent: an already-dated header
// is left alone, and a run with no version bumps is a no-op.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

// A bare version header: `## 1.2.3` or `## 1.2.3-rc.1`, with NO trailing date.
const BARE_HEADER = /^## (\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

let diff;
try {
  // Restrict the diff to CHANGELOG files at the git level (not just in JS) so an
  // unrelated dirty working tree can't bloat the output or trip maxBuffer.
  diff = execFileSync('git', ['diff', 'HEAD', '--unified=0', '--', ':(glob)**/CHANGELOG.md'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
} catch (err) {
  console.warn(`stamp-changelog-dates: git diff failed, skipping (${err.message})`);
  process.exit(0);
}

// Map each changed CHANGELOG file -> the set of version headers it newly added.
const addedByFile = new Map();
let currentFile = null;
for (const line of diff.split('\n')) {
  const fileMatch = line.match(/^\+\+\+ b\/(.+)$/);
  if (fileMatch) {
    currentFile = fileMatch[1].endsWith('CHANGELOG.md') ? fileMatch[1] : null;
    continue;
  }
  if (!currentFile || !line.startsWith('+') || line.startsWith('+++')) continue;
  const headerMatch = line.slice(1).match(BARE_HEADER);
  if (headerMatch) {
    if (!addedByFile.has(currentFile)) addedByFile.set(currentFile, new Set());
    addedByFile.get(currentFile).add(headerMatch[1]);
  }
}

let stamped = 0;
for (const [relFile, versions] of addedByFile) {
  const file = join(repoRoot, relFile);
  let text = readFileSync(file, 'utf8');
  for (const version of versions) {
    // Match the still-bare header line only (idempotent: a dated header won't match).
    const headerLine = new RegExp(`^## ${version.replace(/[.\-]/g, '\\$&')}$`, 'm');
    if (headerLine.test(text)) {
      text = text.replace(headerLine, `## ${version} - ${today}`);
      console.log(`  ## ${version} -> ## ${version} - ${today}: ${relFile}`);
      stamped++;
    }
  }
  writeFileSync(file, text);
}

console.log(`stamp-changelog-dates: ${today} (${stamped} header(s) stamped)`);
