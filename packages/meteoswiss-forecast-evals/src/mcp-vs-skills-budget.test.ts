/**
 * Offline tests for the budget guard (src/mcp-vs-skills/budget.ts) — the mechanism that
 * stops a runaway agent loop from draining the real OpenRouter balance. Uses a temp
 * ledger file; no network, no cost.
 */

import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, beforeEach, test } from "node:test";
import {
  assertBudget,
  budgetUsd,
  recordSpend,
  totalSpendUsd,
} from "./mcp-vs-skills/budget.js";

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "mcp-skills-budget-"));
let ledger = "";
let testId = 0;

beforeEach(() => {
  testId += 1;
  ledger = path.join(tmpDir, `ledger-${testId}.jsonl`);
  delete process.env.MCP_SKILLS_BUDGET_USD;
});

after(() => {
  delete process.env.MCP_SKILLS_BUDGET_USD;
  rmSync(tmpDir, { recursive: true, force: true });
});

test("recordSpend/totalSpendUsd roundtrip sums entries", () => {
  recordSpend(
    { model: "m", costUsd: 0.5, promptTokens: 10, completionTokens: 5 },
    ledger,
  );
  recordSpend(
    { model: "m", costUsd: 0.25, promptTokens: 10, completionTokens: 5 },
    ledger,
  );
  assert.equal(totalSpendUsd(ledger), 0.75);
});

test("missing ledger file means zero spend", () => {
  assert.equal(totalSpendUsd(path.join(tmpDir, "nonexistent.jsonl")), 0);
});

test("assertBudget throws at the cap and passes below it", () => {
  process.env.MCP_SKILLS_BUDGET_USD = "1.0";
  recordSpend(
    { model: "m", costUsd: 0.99, promptTokens: 1, completionTokens: 1 },
    ledger,
  );
  assert.doesNotThrow(() => assertBudget(ledger));
  recordSpend(
    { model: "m", costUsd: 0.01, promptTokens: 1, completionTokens: 1 },
    ledger,
  );
  assert.throws(() => assertBudget(ledger), /BUDGET_EXCEEDED/);
});

test("a torn ledger line is skipped, valid lines still count", () => {
  writeFileSync(
    ledger,
    `${JSON.stringify({ ts: "t", model: "m", costUsd: 0.4, promptTokens: 1, completionTokens: 1 })}\n{"ts":"t","model":"m","costU\n`,
  );
  assert.equal(totalSpendUsd(ledger), 0.4);
});

test("budgetUsd: default 4.0; rejects zero, negative, and garbage", () => {
  assert.equal(budgetUsd(), 4.0);
  process.env.MCP_SKILLS_BUDGET_USD = "2.5";
  assert.equal(budgetUsd(), 2.5);
  for (const bad of ["0", "-1", "banana"]) {
    process.env.MCP_SKILLS_BUDGET_USD = bad;
    assert.throws(() => budgetUsd(), /positive number/);
  }
});
