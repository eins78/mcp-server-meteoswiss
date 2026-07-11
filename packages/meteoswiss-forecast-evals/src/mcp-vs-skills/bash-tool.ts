/**
 * Guarded `bash` tool for the skill-method provider (provider-skill.ts).
 *
 * The meteoswiss-ogd skill is designed to be executed by an agent with a shell (Claude Code's
 * Bash tool). To measure the skill access method honestly, the eval model gets a real shell —
 * but constrained to what the skill legitimately needs:
 *
 *   - pipeline segments may only start with allowlisted text/HTTP tools (curl, awk,
 *     grep, jq, iconv, ...) or the skill's own bundled scripts — best-effort: several
 *     of these tools are Turing-complete (awk) or have write flags, so the allowlist
 *     narrows the surface rather than guaranteeing read-only behavior,
 *   - variable assignments and `$(...)` command substitution are allowed, but the inner
 *     command is validated recursively (the skill's documented STAC flows use both),
 *   - literal URLs must point at the MeteoSwiss OGD hosts,
 *   - no redirects (except `/dev/null`), no backticks, no `&` backgrounding,
 *   - 30s timeout, output truncated to 10 KB (mirrors Claude Code's own truncation).
 *
 * Uses execFile("bash", ["-c", ...]) deliberately — shell features (pipelines, command
 * substitution) ARE the skill's documented interface, so a no-shell execFile would not
 * measure the skill faithfully. The guardCommand() allowlist above is the mitigation.
 * This is an eval-cost-control and blast-radius reducer for an autonomous eval run on a dev
 * machine — NOT a security boundary. The command author is an LLM prompted with weather
 * questions; fetched data comes from Swiss government open data.
 */

import { execFile } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the meteoswiss-ogd skill directory (in this monorepo checkout). */
export const SKILL_DIR = path.resolve(
  __dirname,
  "../../../meteoswiss-skills/skills/meteoswiss-ogd",
);

const ALLOWED_COMMANDS = new Set([
  "curl",
  "awk",
  "grep",
  "egrep",
  "head",
  "tail",
  "cut",
  "sort",
  "uniq",
  "iconv",
  "sed",
  "tr",
  "wc",
  "cat",
  "echo",
  "printf",
  "jq",
  "column",
  "paste",
  "date",
  "true",
  "false",
]);
// NOT allowlisted on purpose: xargs (its argument is itself a command the guard never
// sees — `echo rm | xargs ...` would defeat the whole allowlist), bash/sh/env, and
// anything that writes files.

const ALLOWED_URL_PATTERN =
  /^https:\/\/(data\.geo\.admin\.ch|www\.meteoschweiz\.admin\.ch)\//;

const OUTPUT_LIMIT_BYTES = 10 * 1024;
const TIMEOUT_MS = 30_000;

export type GuardResult = { ok: true } | { ok: false; reason: string };

/** Replace single-quoted regions with placeholders so metacharacter checks see only syntax. */
function maskQuotes(command: string): string {
  let masked = "";
  let i = 0;
  while (i < command.length) {
    const ch = command[i];
    if (ch === "'") {
      const end = command.indexOf("'", i + 1);
      if (end === -1) return masked + "__UNTERMINATED__";
      masked += "'Q'";
      i = end + 1;
    } else {
      // Double quotes may contain $VAR / $() — keep contents visible so substitutions
      // are validated recursively; escapes inside double quotes are rare in the skill's
      // documented usage.
      masked += ch;
      i += 1;
    }
  }
  return masked;
}

/** Extract top-level `$(...)` spans from a string; returns inner commands + remainder. */
function extractSubstitutions(input: string): {
  inners: string[];
  remainder: string;
} {
  const inners: string[] = [];
  let remainder = "";
  let i = 0;
  while (i < input.length) {
    if (input[i] === "$" && input[i + 1] === "(") {
      let depth = 1;
      let j = i + 2;
      while (j < input.length && depth > 0) {
        if (input[j] === "(") depth += 1;
        if (input[j] === ")") depth -= 1;
        j += 1;
      }
      if (depth !== 0) {
        return { inners, remainder: remainder + "__UNTERMINATED__" };
      }
      inners.push(input.slice(i + 2, j - 1));
      // No surrounding spaces: `VAR=$(...)` must collapse to a pure assignment token,
      // while a bare `$(...)` used AS the command stays an unknown word and is rejected
      // (allowing it would execute whatever the substitution's output names).
      remainder += "__SUBST__";
      i = j;
    } else {
      remainder += input[i];
      i += 1;
    }
  }
  return { inners, remainder };
}

function validateStatement(statement: string): GuardResult {
  const trimmed = statement.trim();
  if (trimmed.length === 0 || trimmed.startsWith("#")) {
    return { ok: true }; // blank or comment line
  }
  for (const segment of trimmed.split("|")) {
    let seg = segment.trim();
    if (seg.length === 0) {
      return { ok: false, reason: "empty pipeline segment" };
    }
    // Strip leading VAR=... assignments (their $() values are validated separately).
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(seg)) {
      const eq = seg.indexOf("=");
      const rest = seg.slice(eq + 1);
      const spaceMatch = /\s(.*)$/.exec(rest);
      if (spaceMatch?.[1] === undefined) {
        seg = "";
        break;
      }
      seg = spaceMatch[1].trim();
    }
    if (seg.length === 0) {
      continue; // pure assignment, e.g. ITEM=$(...)
    }
    const words = seg.split(/\s+/);
    const firstWord = words[0] ?? "";
    const base = firstWord.replace(/^['"]|['"]$/g, "");
    const isAllowedCommand = ALLOWED_COMMANDS.has(base);
    // curl can write files via flags, sidestepping the shell-redirect ban.
    if (base === "curl") {
      const writeFlag = words.find((w) =>
        ["-o", "-O", "--output", "--remote-name", "--output-dir"].includes(w),
      );
      if (writeFlag !== undefined) {
        return {
          ok: false,
          reason: `curl write flag not allowed: ${writeFlag}`,
        };
      }
    }
    const isSkillScript =
      base.startsWith(`${SKILL_DIR}${path.sep}scripts${path.sep}`) &&
      base.endsWith(".sh");
    if (!isAllowedCommand && !isSkillScript) {
      return {
        ok: false,
        reason: `command not allowed: ${base}`,
      };
    }
  }
  return { ok: true };
}

function validateCommandList(input: string): GuardResult {
  const { inners, remainder } = extractSubstitutions(input);
  for (const inner of inners) {
    const innerResult = validateCommandList(inner);
    if (!innerResult.ok) {
      return innerResult;
    }
  }
  if (remainder.includes("__UNTERMINATED__")) {
    return { ok: false, reason: "unterminated quote or substitution" };
  }
  if (remainder.includes("`")) {
    return { ok: false, reason: "backticks not allowed" };
  }
  // Redirects: only /dev/null variants are allowed (spaced forms too). `&&`/`||` are
  // plain statement separators here (each side is validated on its own).
  const redirectStripped = remainder
    .replaceAll("2>/dev/null", " ")
    .replaceAll("2> /dev/null", " ")
    .replaceAll(">/dev/null", " ")
    .replaceAll("> /dev/null", " ")
    .replaceAll("2>&1", " ")
    .replaceAll("&&", "\n")
    .replaceAll("||", "\n");
  if (/[<>]/.test(redirectStripped)) {
    return { ok: false, reason: "redirects not allowed" };
  }
  if (redirectStripped.includes("&")) {
    return { ok: false, reason: "backgrounding not allowed" };
  }
  for (const statement of redirectStripped.split(/[;\n]/)) {
    const result = validateStatement(statement);
    if (!result.ok) {
      return result;
    }
  }
  return { ok: true };
}

/**
 * Validate a candidate command. Exported for tests; runGuardedBash calls this first.
 */
export function guardCommand(rawCommand: string): GuardResult {
  // Expand the skill-dir variable both ways so path checks see absolute paths, and
  // join backslash line continuations BEFORE statement splitting (models copy the
  // SKILL.md examples verbatim, multi-line `curl ... \ | jq` included).
  // Full-line comments go FIRST — before quote masking — or an apostrophe in a
  // comment ("# Geneva's point_id") opens a phantom quote that swallows the rest.
  const expanded = rawCommand
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n")
    .replaceAll("${CLAUDE_SKILL_DIR}", SKILL_DIR)
    .replaceAll("$CLAUDE_SKILL_DIR", SKILL_DIR)
    .replace(/\\\r?\n/g, " ");

  // awk is allowlisted (the skill's pipelines depend on it) but its quoted program is
  // invisible to the segment checks — reject its process-execution escape hatch by
  // raw-text scan. Targeted, not exhaustive: see the header's best-effort caveat.
  if (expanded.includes("system(")) {
    return { ok: false, reason: "system() calls not allowed" };
  }

  // URL allowlist runs on the raw (unmasked) text so quoted URLs are checked too.
  // Matches ANY scheme (file://, ftp://, ...) so only https on the allowed hosts passes.
  for (const urlMatch of expanded.matchAll(
    /[a-z][a-z0-9+.-]*:\/\/[^\s"'()|]+/gi,
  )) {
    if (!ALLOWED_URL_PATTERN.test(urlMatch[0])) {
      return { ok: false, reason: `URL not allowed: ${urlMatch[0]}` };
    }
  }

  return validateCommandList(maskQuotes(expanded));
}

export type BashResult = {
  output: string;
  exitCode: number;
  truncated: boolean;
  rejected: boolean;
};

/** Run a guard-approved command via bash -c; returns combined stdout+stderr, capped. */
export async function runGuardedBash(rawCommand: string): Promise<BashResult> {
  const guard = guardCommand(rawCommand);
  if (!guard.ok) {
    return {
      output: `command rejected by eval sandbox: ${guard.reason}. Allowed: pipelines of ${[...ALLOWED_COMMANDS].join("/")} and the skill's bundled scripts; URLs on data.geo.admin.ch only; no redirects.`,
      exitCode: 126,
      truncated: false,
      rejected: true,
    };
  }
  const expanded = rawCommand
    .replaceAll("${CLAUDE_SKILL_DIR}", SKILL_DIR)
    .replaceAll("$CLAUDE_SKILL_DIR", SKILL_DIR);

  return new Promise((resolve) => {
    execFile(
      "bash",
      ["-c", expanded],
      {
        timeout: TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/local/bin",
          HOME: process.env.HOME ?? "/tmp",
          LANG: "en_US.UTF-8",
          CLAUDE_SKILL_DIR: SKILL_DIR,
        },
      },
      (error, stdout, stderr) => {
        let combined = `${stdout}${stderr.length > 0 ? `\n${stderr}` : ""}`;
        // error.code is a number only for a plain non-zero exit. Timeouts arrive as
        // killed/signal with code null, spawn failures as a STRING code ("ENOENT") —
        // mapping those to 0 would present a dead command to the model as success and
        // silently bias the skill method's accuracy.
        let exitCode = 0;
        if (error !== null) {
          if (typeof error.code === "number") {
            exitCode = error.code;
          } else if (
            error.killed === true ||
            typeof error.signal === "string"
          ) {
            exitCode = 124;
            combined += `\n[command timed out after ${TIMEOUT_MS / 1000}s]`;
          } else {
            exitCode = 127;
            combined += `\n[command failed to run: ${String(error.code ?? error.message)}]`;
          }
        }
        const truncated =
          Buffer.byteLength(combined, "utf8") > OUTPUT_LIMIT_BYTES;
        const output = truncated
          ? `${Buffer.from(combined, "utf8").subarray(0, OUTPUT_LIMIT_BYTES).toString("utf8")}\n[output truncated at 10 KB — narrow it down, e.g. filter rows with awk/grep]`
          : combined;
        resolve({ output, exitCode, truncated, rejected: false });
      },
    );
  });
}
