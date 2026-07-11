/**
 * Hard budget guard for the MCP-vs-skills track. Every OpenRouter call appends its cost to
 * an append-only JSONL ledger (append is atomic enough under promptfoo's concurrency; no
 * read-modify-write races), and assertBudget() throws once the cumulative spend crosses the
 * cap — so a runaway agent loop or a mispriced model stops the run instead of the card.
 *
 * The ledger persists across processes/runs on purpose: smoke runs, aborted runs and the
 * full sweep all draw from the same real OpenRouter balance. Cap via MCP_SKILLS_BUDGET_USD
 * (default 4.0 — deliberately below the $5 hard ceiling to leave headroom for
 * OpenRouter-side accounting differences).
 */

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Ledger lives in generated/ (gitignored run output). */
export const LEDGER_PATH = path.resolve(
  __dirname,
  "../../generated/.spend-mcp-skills.jsonl",
);

const DEFAULT_BUDGET_USD = 4.0;

export function budgetUsd(): number {
  const raw = process.env.MCP_SKILLS_BUDGET_USD;
  if (raw === undefined || raw === "") {
    return DEFAULT_BUDGET_USD;
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `MCP_SKILLS_BUDGET_USD must be a positive number, got: ${raw}`,
    );
  }
  return parsed;
}

type LedgerEntry = {
  ts: string;
  model: string;
  costUsd: number;
  promptTokens: number;
  completionTokens: number;
};

/** Total spend recorded so far (USD). */
export function totalSpendUsd(ledgerPath: string = LEDGER_PATH): number {
  if (!existsSync(ledgerPath)) {
    return 0;
  }
  let total = 0;
  for (const line of readFileSync(ledgerPath, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try {
      const entry = JSON.parse(line) as Partial<LedgerEntry>;
      if (typeof entry.costUsd === "number" && Number.isFinite(entry.costUsd)) {
        total += entry.costUsd;
      }
    } catch {
      // A torn line from a concurrent append is skipped, not fatal — undercounting one
      // line is acceptable for a guard that trips well below the hard ceiling.
    }
  }
  return total;
}

/** Record one API call's cost. */
export function recordSpend(
  entry: Omit<LedgerEntry, "ts">,
  ledgerPath: string = LEDGER_PATH,
): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  appendFileSync(ledgerPath, `${line}\n`);
}

/** Throw if the budget is exhausted. Call BEFORE each paid API call. */
export function assertBudget(ledgerPath: string = LEDGER_PATH): void {
  const spent = totalSpendUsd(ledgerPath);
  const cap = budgetUsd();
  if (spent >= cap) {
    throw new Error(
      `BUDGET_EXCEEDED: $${spent.toFixed(4)} spent >= $${cap.toFixed(2)} cap (ledger: ${ledgerPath}). Raise MCP_SKILLS_BUDGET_USD only after checking https://openrouter.ai/activity.`,
    );
  }
}
