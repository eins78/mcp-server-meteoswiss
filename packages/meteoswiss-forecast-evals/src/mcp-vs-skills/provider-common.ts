/**
 * Shared glue between the promptfoo custom-provider contract and the agent loop:
 * the common system-prompt core (identical for both access methods — fairness rule),
 * result conversion, and transcript dumping for spot-checks.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentResult } from "./openrouter-agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRANSCRIPT_DIR = path.resolve(
  __dirname,
  "../../generated/transcripts-mcp-skills",
);

/** promptfoo's ProviderResponse, narrowed to the fields this track uses. */
export type ProviderResponse = {
  output?: string;
  error?: string;
  tokenUsage?: {
    total: number;
    prompt: number;
    completion: number;
    numRequests: number;
  };
  cost?: number;
  metadata?: Record<string, unknown>;
};

export type ProviderOptions = {
  id?: string;
  label?: string;
  config?: Record<string, unknown>;
};

export type CallContext = { vars?: Record<string, unknown> };

/** Model settings a provider entry must define in promptfooconfig. */
export type ModelConfig = {
  model: string;
  maxTokens: number;
  extraBody?: Record<string, unknown>;
};

export function parseModelConfig(options: ProviderOptions): ModelConfig {
  const config = options.config ?? {};
  const model = config.model;
  if (typeof model !== "string" || model === "") {
    throw new Error(
      `provider ${options.label ?? options.id ?? "?"}: config.model is required`,
    );
  }
  const maxTokens =
    typeof config.maxTokens === "number" ? config.maxTokens : 1024;
  const extraBody =
    typeof config.extraBody === "object" && config.extraBody !== null
      ? (config.extraBody as Record<string, unknown>)
      : undefined;
  return { model, maxTokens, extraBody };
}

/** The system-prompt core both methods share, so only the access method differs. */
export function commonSystemPrompt(): string {
  const now = new Date().toLocaleString("en-CH", {
    timeZone: "Europe/Zurich",
    dateStyle: "full",
    timeStyle: "long",
  });
  return [
    "You are a helpful assistant answering questions about Swiss weather using MeteoSwiss data.",
    `Current date and time: ${now} (Europe/Zurich).`,
    "Use the available tools to get real data — never answer from memory and never guess numbers.",
    "Work efficiently: use as few tool calls as possible.",
    "Answer briefly (1-3 sentences), then end your reply with exactly one line:",
    "FINAL_JSON: {...}",
    "matching the JSON schema given in the question. No text after that line.",
  ].join("\n");
}

/** Convert an agent-loop result into promptfoo's shape, dumping the transcript. */
export function toProviderResponse(
  result: AgentResult,
  method: string,
  model: string,
  context: CallContext,
): ProviderResponse {
  const qid =
    typeof context.vars?.qid === "string" ? context.vars.qid : "unknown";
  try {
    mkdirSync(TRANSCRIPT_DIR, { recursive: true });
    const slug = `${method}-${model.replaceAll("/", "_")}-${qid}`;
    writeFileSync(
      path.join(TRANSCRIPT_DIR, `${slug}.json`),
      `${JSON.stringify({ method, model, qid, ...result }, null, 2)}\n`,
    );
  } catch {
    // Transcripts are debugging aids; never fail the eval over them.
  }

  const metadata = {
    method,
    model,
    qid,
    iterations: result.usage.requests,
    toolCalls: result.usage.toolCalls,
    toolErrors: result.usage.toolErrors,
    stopReason: result.stopReason,
  };
  if (result.stopReason === "error") {
    return { error: result.errorDetail ?? "agent loop error", metadata };
  }
  return {
    output:
      result.stopReason === "max-iterations"
        ? "[agent hit max iterations without a final answer]"
        : result.answerText,
    tokenUsage: {
      total: result.usage.totalTokens,
      prompt: result.usage.promptTokens,
      completion: result.usage.completionTokens,
      numRequests: result.usage.requests,
    },
    cost: result.usage.costUsd,
    metadata,
  };
}
