/**
 * Minimal OpenRouter chat-completions agent loop with tool calling, shared by both
 * access-method providers (provider-mcp.ts, provider-skill.ts).
 *
 * Design: plain fetch against https://openrouter.ai/api/v1/chat/completions — no SDK,
 * because the loop is ~100 lines and the eval must control every token-relevant byte
 * (tool schemas, tool results, system prompt) to keep the two methods comparable.
 * `usage: { include: true }` makes OpenRouter return its own cost accounting per call;
 * we sum that across loop iterations instead of maintaining a pricing table (the original
 * suite's summarize.ts had to hardcode prices — see its README caveat).
 */

import { assertBudget, recordSpend } from "./budget.js";

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type AgentUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  requests: number;
  toolCalls: number;
  /** Dispatches that threw (infra failures fed back to the model as error text). */
  toolErrors: number;
};

export type AgentResult = {
  answerText: string;
  usage: AgentUsage;
  /** Full message transcript for debugging / spot-checking runs. */
  transcript: unknown[];
  stopReason: "answer" | "max-iterations" | "error";
  errorDetail?: string;
};

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type AssistantMessage = {
  role: "assistant";
  content: string | null;
  tool_calls?: ToolCall[];
};

type CompletionUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
};

type CompletionResponse = {
  choices?: Array<{ message?: AssistantMessage; finish_reason?: string }>;
  usage?: CompletionUsage;
  error?: { message?: string; code?: number };
};

export type AgentLoopOptions = {
  model: string;
  systemPrompt: string;
  userMessage: string;
  tools: ToolDefinition[];
  dispatchTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<string>;
  maxTokens: number;
  maxIterations?: number;
  /** Extra top-level body params (e.g. { reasoning: { effort: "minimal" } }). */
  extraBody?: Record<string, unknown>;
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_TOOL_RESULT_CHARS = 60_000;

function apiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (key === undefined || key === "") {
    throw new Error(
      "OPENROUTER_API_KEY is not set — see packages/meteoswiss-forecast-evals/README.md",
    );
  }
  return key;
}

async function completeOnce(
  model: string,
  messages: unknown[],
  tools: ToolDefinition[],
  maxTokens: number,
  extraBody: Record<string, unknown>,
): Promise<CompletionResponse> {
  assertBudget();
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/eins78/meteoswiss-llm-tools",
      "X-Title": "meteoswiss mcp-vs-skills eval",
    },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0,
      max_tokens: maxTokens,
      usage: { include: true },
      ...extraBody,
    }),
  });
  // Read text first: a 502 with an HTML body must surface as "HTTP 502", not as a
  // JSON parse error that loses the status.
  const rawBody = await response.text();
  let body: CompletionResponse;
  try {
    body = JSON.parse(rawBody) as CompletionResponse;
  } catch {
    throw new Error(
      `OpenRouter returned non-JSON (HTTP ${response.status}): ${rawBody.slice(0, 300)}`,
    );
  }
  if (!response.ok || body.error !== undefined) {
    throw new Error(
      `OpenRouter error (HTTP ${response.status}): ${body.error?.message ?? rawBody.slice(0, 500)}`,
    );
  }
  const usage = body.usage;
  if (usage?.cost === undefined || usage.prompt_tokens === undefined) {
    // Fail the row loudly rather than fabricate a $0/0-token measurement: silent zeros
    // would both disable the budget guard and publish "free" rows in the results.
    throw new Error(
      `OpenRouter response for ${model} carries no usage accounting (usage.include not honored?) — refusing to record $0`,
    );
  }
  recordSpend({
    model,
    costUsd: usage.cost,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens ?? 0,
  });
  return body;
}

/** Run the tool-calling loop until the model answers or maxIterations is reached. */
export async function runAgentLoop(
  options: AgentLoopOptions,
): Promise<AgentResult> {
  const maxIterations = options.maxIterations ?? 8;
  const messages: unknown[] = [
    { role: "system", content: options.systemPrompt },
    { role: "user", content: options.userMessage },
  ];
  const usage: AgentUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    requests: 0,
    toolCalls: 0,
    toolErrors: 0,
  };

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let response: CompletionResponse;
    try {
      response = await completeOnce(
        options.model,
        messages,
        options.tools,
        options.maxTokens,
        options.extraBody ?? {},
      );
    } catch (error) {
      return {
        answerText: "",
        usage,
        transcript: messages,
        stopReason: "error",
        errorDetail: error instanceof Error ? error.message : String(error),
      };
    }
    usage.requests += 1;
    usage.promptTokens += response.usage?.prompt_tokens ?? 0;
    usage.completionTokens += response.usage?.completion_tokens ?? 0;
    usage.totalTokens += response.usage?.total_tokens ?? 0;
    usage.costUsd += response.usage?.cost ?? 0;

    const message = response.choices?.[0]?.message;
    if (message === undefined) {
      return {
        answerText: "",
        usage,
        transcript: messages,
        stopReason: "error",
        errorDetail: "OpenRouter response had no choices[0].message",
      };
    }
    messages.push(message);

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return {
        answerText: message.content ?? "",
        usage,
        transcript: messages,
        stopReason: "answer",
      };
    }

    for (const call of toolCalls) {
      usage.toolCalls += 1;
      let resultText: string;
      try {
        const args = JSON.parse(call.function.arguments || "{}") as Record<
          string,
          unknown
        >;
        resultText = await options.dispatchTool(call.function.name, args);
      } catch (error) {
        // A real agent sees tool errors too, so the loop continues — but count and log
        // them so an infra failure (dead MCP server, guard bug) can't silently read as
        // "the model answered wrong" in the published numbers.
        usage.toolErrors += 1;
        resultText = `tool error: ${error instanceof Error ? error.message : String(error)}`;
        console.error(
          `[mcp-vs-skills] tool dispatch failed (${call.function.name}): ${resultText.slice(0, 200)}`,
        );
      }
      if (resultText.length > MAX_TOOL_RESULT_CHARS) {
        resultText = `${resultText.slice(0, MAX_TOOL_RESULT_CHARS)}\n[tool result truncated at ${MAX_TOOL_RESULT_CHARS} chars]`;
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: resultText,
      });
    }
  }

  return {
    answerText: "",
    usage,
    transcript: messages,
    stopReason: "max-iterations",
  };
}
