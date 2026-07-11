/**
 * promptfoo custom provider — access method B: the meteoswiss-ogd skill.
 *
 * Mirrors how Claude Code actually runs the skill: the model sees the SKILL.md body
 * (frontmatter stripped — that's discovery metadata, not model context) and gets a single
 * `bash` tool, guarded by bash-tool.ts (allowlisted read-only commands, MeteoSwiss-only
 * URLs — see that file's header). Progressive disclosure is preserved and measured
 * honestly: REFERENCE.md costs tokens only if the model actually reads it, and the
 * bundled scripts are available exactly as the skill documents them.
 */

import { readFileSync } from "node:fs";
import * as path from "node:path";
import { runGuardedBash, SKILL_DIR } from "./bash-tool.js";
import { runAgentLoop, type ToolDefinition } from "./openrouter-agent.js";
import {
  commonSystemPrompt,
  parseModelConfig,
  toProviderResponse,
  type CallContext,
  type ModelConfig,
  type ProviderOptions,
  type ProviderResponse,
} from "./provider-common.js";

/** SKILL.md body with the YAML frontmatter block removed. */
export function skillBody(): string {
  const raw = readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8");
  const match = /^---\n[\s\S]*?\n---\n/.exec(raw);
  return match === null ? raw : raw.slice(match[0].length);
}

const BASH_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "bash",
    description:
      "Run a shell command (macOS, bash). Pipelines, $() substitution and VAR= assignments are supported. Network access is restricted to MeteoSwiss open-data hosts (data.geo.admin.ch, www.meteoschweiz.admin.ch); only read-only text tools (curl, awk, grep, jq, iconv, ...) and the skill's bundled scripts are allowed; no file redirects. Output is truncated at 10 KB.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to run" },
      },
      required: ["command"],
    },
  },
};

export default class SkillMethodProvider {
  private readonly options: ProviderOptions;
  private readonly modelConfig: ModelConfig;

  constructor(options: ProviderOptions) {
    this.options = options;
    this.modelConfig = parseModelConfig(options);
  }

  id(): string {
    return this.options.label ?? `skill-method:${this.modelConfig.model}`;
  }

  async callApi(
    prompt: string,
    context: CallContext,
  ): Promise<ProviderResponse> {
    const systemPrompt = [
      commonSystemPrompt(),
      "",
      "You have a single tool: `bash`. The environment variable CLAUDE_SKILL_DIR is set inside it, and the skill's bundled scripts are executable.",
      "The following skill document explains how to fetch MeteoSwiss data:",
      "",
      "---",
      skillBody().trim(),
      "---",
    ].join("\n");

    const result = await runAgentLoop({
      model: this.modelConfig.model,
      systemPrompt,
      userMessage: prompt,
      tools: [BASH_TOOL],
      maxTokens: this.modelConfig.maxTokens,
      extraBody: this.modelConfig.extraBody,
      dispatchTool: async (name, args) => {
        if (name !== "bash" || typeof args.command !== "string") {
          return `tool error: unknown tool or missing command (got ${name})`;
        }
        const bashResult = await runGuardedBash(args.command);
        const status =
          bashResult.exitCode === 0
            ? ""
            : `\n[exit code ${bashResult.exitCode}]`;
        return `${bashResult.output}${status}`;
      },
    });
    return toProviderResponse(result, "skill", this.modelConfig.model, context);
  }
}
