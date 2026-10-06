import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { AIMessage } from '@langchain/core/messages';
import { createDeepAgent, FilesystemBackend } from 'deepagents';
import { withBackoff } from '../../lib/backoff.js';

export interface RunResult {
  run: number;
  condition: 'baseline' | 'treatment';
  firstTool: string | null;
  inputTokens: number;
  outputTokens: number;
  modelCallCount: number;
  elapsedMs: number;
  estimatedCostUsd: number;
}

// Two-step task: enough structure to benefit from planning, few enough calls to stay under 15 RPM
export const AGENT_TASK =
  'You are an AI policy analyst. Complete both steps:\n' +
  '1. Create /workspace/findings.md listing exactly 3 key principles of responsible AI development, ' +
  'one sentence each.\n' +
  '2. Create /workspace/summary.md: a single paragraph summarising the findings from findings.md.\n' +
  'Do not stop until both files are written.';

// GPT-5.4-mini pricing (USD per 1M tokens) — verified 2026-10-06: developers.openai.com/api/docs/pricing
const COST_PER_1M_INPUT = 0.75;
const COST_PER_1M_OUTPUT = 4.5;

export function extractMetrics(messages: unknown[]): {
  firstTool: string | null;
  inputTokens: number;
  outputTokens: number;
  modelCallCount: number;
} {
  let firstTool: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let modelCallCount = 0;

  for (const m of messages) {
    if (!(m instanceof AIMessage)) continue;
    modelCallCount++;
    const usage = m.usage_metadata;
    if (usage) {
      inputTokens += usage.input_tokens ?? 0;
      outputTokens += usage.output_tokens ?? 0;
    }
    if (firstTool === null && m.tool_calls && m.tool_calls.length > 0) {
      firstTool = m.tool_calls[0].name;
    }
  }

  return { firstTool, inputTokens, outputTokens, modelCallCount };
}

export function computeCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * COST_PER_1M_INPUT + (outputTokens / 1_000_000) * COST_PER_1M_OUTPUT
  );
}

const RUN_METADATA = { deepagents_version: '1.14.1', model_id: 'gpt-5.4-mini-2026-03-17' };

// Project-relative workspace so agent output is visible; cleaned up after each run
export const WORKSPACE_ROOT = join(process.cwd(), 'tmp', 'planning-first');

export async function runBaselineRun(runIndex: number): Promise<RunResult> {
  const workDir = join(WORKSPACE_ROOT, `baseline-${runIndex}`);
  mkdirSync(workDir, { recursive: true });

  const agent = createDeepAgent({
    model: 'openai:gpt-5.4-mini-2026-03-17',
    // virtualMode scopes all agent paths under workDir — prevents writes outside project
    backend: () => new FilesystemBackend({ rootDir: workDir, virtualMode: true }),
  });

  const start = Date.now();
  const result = await withBackoff(() =>
    agent.invoke({ messages: [{ role: 'user', content: AGENT_TASK }] }, { metadata: RUN_METADATA }),
  );
  const elapsedMs = Date.now() - start;

  rmSync(workDir, { recursive: true, force: true });

  const { firstTool, inputTokens, outputTokens, modelCallCount } = extractMetrics(result.messages);

  return {
    run: runIndex,
    condition: 'baseline',
    firstTool,
    inputTokens,
    outputTokens,
    modelCallCount,
    elapsedMs,
    estimatedCostUsd: computeCost(inputTokens, outputTokens),
  };
}
