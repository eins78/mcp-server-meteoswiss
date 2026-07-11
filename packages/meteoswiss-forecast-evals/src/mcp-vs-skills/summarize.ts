/**
 * Summarize a MCP-vs-skills run (generated/results-mcp-skills.json) into the tables the
 * results doc and charts are built from. Pure post-processing — no API calls, no cost.
 *
 * Usage: pnpm run mcp-skills:summarize [-- path/to/results.json]
 * Also writes generated/mcp-skills-summary.json for render-charts.ts.
 */

import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = path.resolve(__dirname, "../../generated");

type Row = {
  provider: { label: string };
  vars: { qid: string; family: string };
  response?: {
    tokenUsage?: { total?: number; prompt?: number; completion?: number };
    cost?: number;
    metadata?: { iterations?: number; toolCalls?: number; stopReason?: string };
  };
  gradingResult?: { pass?: boolean; score?: number; reason?: string };
};

export type SummaryRow = {
  label: string;
  method: string;
  model: string;
  qid: string;
  family: string;
  pass: boolean;
  score: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  toolCalls: number;
  iterations: number;
  stopReason: string;
};

function loadRows(resultsPath: string): SummaryRow[] {
  const parsed = JSON.parse(readFileSync(resultsPath, "utf8")) as {
    results: { results: Row[] };
  };
  return parsed.results.results.map((row) => {
    // Split on the FIRST slash only — model ids can contain slashes themselves.
    const label = row.provider.label;
    const slash = label.indexOf("/");
    const method = slash === -1 ? "?" : label.slice(0, slash);
    const model = slash === -1 ? label : label.slice(slash + 1);
    return {
      label: row.provider.label,
      method,
      model,
      qid: row.vars.qid,
      family: row.vars.family,
      pass: row.gradingResult?.pass === true,
      score: row.gradingResult?.score ?? 0,
      totalTokens: row.response?.tokenUsage?.total ?? 0,
      promptTokens: row.response?.tokenUsage?.prompt ?? 0,
      completionTokens: row.response?.tokenUsage?.completion ?? 0,
      costUsd: row.response?.cost ?? 0,
      toolCalls: row.response?.metadata?.toolCalls ?? 0,
      iterations: row.response?.metadata?.iterations ?? 0,
      stopReason:
        typeof row.response?.metadata?.stopReason === "string"
          ? row.response.metadata.stopReason
          : "?",
    };
  });
}

type Aggregate = {
  label: string;
  rows: number;
  /** Rows whose provider errored (no usage data) — flagged, and excluded from token/cost means. */
  errors: number;
  passed: number;
  accuracy: number;
  meanScore: number;
  totalTokens: number;
  meanTokens: number;
  totalCostUsd: number;
  costPerCorrectUsd: number | null;
  meanToolCalls: number;
};

function aggregate(rows: SummaryRow[], label: string): Aggregate {
  // Error rows (provider infra failure) count against accuracy — the method did not
  // produce an answer — but carry no usage data, so pooling their zeros into token/cost
  // means would make an outage look cheap. Exclude them there and surface the count.
  const usable = rows.filter((r) => r.stopReason !== "error");
  const errors = rows.length - usable.length;
  const passed = rows.filter((r) => r.pass).length;
  const totalTokens = usable.reduce((s, r) => s + r.totalTokens, 0);
  const totalCost = usable.reduce((s, r) => s + r.costUsd, 0);
  return {
    label,
    rows: rows.length,
    errors,
    passed,
    accuracy: rows.length === 0 ? 0 : passed / rows.length,
    meanScore:
      rows.length === 0
        ? 0
        : rows.reduce((s, r) => s + r.score, 0) / rows.length,
    totalTokens,
    meanTokens: usable.length === 0 ? 0 : totalTokens / usable.length,
    totalCostUsd: totalCost,
    costPerCorrectUsd: passed === 0 ? null : totalCost / passed,
    meanToolCalls:
      usable.length === 0
        ? 0
        : usable.reduce((s, r) => s + r.toolCalls, 0) / usable.length,
  };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(0)}%`;
}

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );
  const line = (cells: string[]): string =>
    `| ${cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join(" | ")} |`;
  return [
    line(headers),
    line(widths.map((w) => "-".repeat(w))),
    ...rows.map(line),
  ].join("\n");
}

function main(): void {
  const resultsPath =
    process.argv[2] ?? path.join(GENERATED_DIR, "results-mcp-skills.json");
  const rows = loadRows(resultsPath);

  const labels = [...new Set(rows.map((r) => r.label))].sort();
  const methods = [...new Set(rows.map((r) => r.method))].sort();
  const families = [...new Set(rows.map((r) => r.family))];

  console.log("## Per provider (method x model)\n");
  const perProvider = labels.map((label) =>
    aggregate(
      rows.filter((r) => r.label === label),
      label,
    ),
  );
  console.log(
    table(
      [
        "provider",
        "errors",
        "accuracy",
        "mean score",
        "mean tokens/q",
        "total cost",
        "cost/correct",
        "mean tool calls",
      ],
      perProvider.map((a) => [
        a.label,
        `${a.errors}`,
        `${pct(a.accuracy)} (${a.passed}/${a.rows})`,
        a.meanScore.toFixed(2),
        Math.round(a.meanTokens).toLocaleString("en-US"),
        `$${a.totalCostUsd.toFixed(4)}`,
        a.costPerCorrectUsd === null
          ? "—"
          : `$${a.costPerCorrectUsd.toFixed(4)}`,
        a.meanToolCalls.toFixed(1),
      ]),
    ),
  );

  console.log("\n## Per method (both models pooled)\n");
  const perMethod = methods.map((method) =>
    aggregate(
      rows.filter((r) => r.method === method),
      method,
    ),
  );
  console.log(
    table(
      ["method", "accuracy", "mean score", "mean tokens/q", "total cost"],
      perMethod.map((a) => [
        a.label,
        `${pct(a.accuracy)} (${a.passed}/${a.rows})`,
        a.meanScore.toFixed(2),
        Math.round(a.meanTokens).toLocaleString("en-US"),
        `$${a.totalCostUsd.toFixed(4)}`,
      ]),
    ),
  );

  console.log("\n## Accuracy by question family x method\n");
  console.log(
    table(
      ["family", ...methods.map((m) => `${m} acc`), "mcp/skill tokens"],
      families.map((family) => {
        const familyRows = rows.filter((r) => r.family === family);
        const byMethod = methods.map((method) =>
          aggregate(
            familyRows.filter((r) => r.method === method),
            method,
          ),
        );
        const mcp = byMethod.find((a) => a.label === "mcp");
        const skill = byMethod.find((a) => a.label === "skill");
        const ratio =
          mcp !== undefined && skill !== undefined && skill.meanTokens > 0
            ? (mcp.meanTokens / skill.meanTokens).toFixed(2)
            : "—";
        return [
          family,
          ...byMethod.map((a) => `${pct(a.accuracy)} (${a.passed}/${a.rows})`),
          ratio,
        ];
      }),
    ),
  );

  const errorRows = rows.filter((r) => r.stopReason === "error");
  if (errorRows.length > 0) {
    console.error(
      `\nWARNING: ${errorRows.length} row(s) hit provider/infra errors and carry no usage data — ` +
        `accuracy counts them as failures, token/cost means exclude them. Do not publish this run without ` +
        `understanding why: ${errorRows.map((r) => `${r.label}:${r.qid}`).join(", ")}`,
    );
  }

  writeFileSync(
    path.join(GENERATED_DIR, "mcp-skills-summary.json"),
    `${JSON.stringify({ rows, perProvider, perMethod }, null, 2)}\n`,
  );
  console.log("\nwrote generated/mcp-skills-summary.json");
}

main();
