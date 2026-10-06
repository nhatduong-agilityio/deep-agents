import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createDeepAgent, FilesystemBackend } from 'deepagents';
import { withBackoff } from '../../lib/backoff.js';
import { AGENT_TASK, WORKSPACE_ROOT, computeCost, extractMetrics } from './baseline.js';
import type { RunResult } from './baseline.js';

// PTR pattern: instruct explicitly; cap at ≤10 items to bound token overhead
const PLANNING_SYSTEM_PROMPT =
  'Before calling any other tool, you MUST call write_todos with a numbered list of ≤10 items ' +
  'that covers every step of your plan. Do not read files, write files, or take any other action ' +
  'until write_todos has been called. Once your todos are written, execute them in order.';

const RUN_METADATA = { deepagents_version: '1.14.1', model_id: 'gpt-5.4-mini-2026-03-17' };

export async function runTreatmentRun(runIndex: number): Promise<RunResult> {
  const workDir = join(WORKSPACE_ROOT, `treatment-${runIndex}`);
  mkdirSync(workDir, { recursive: true });

  const agent = createDeepAgent({
    model: 'openai:gpt-5.4-mini-2026-03-17',
    // virtualMode scopes all agent paths under workDir — prevents writes outside project
    backend: () => new FilesystemBackend({ rootDir: workDir, virtualMode: true }),
    systemPrompt: PLANNING_SYSTEM_PROMPT,
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
    condition: 'treatment',
    firstTool,
    inputTokens,
    outputTokens,
    modelCallCount,
    elapsedMs,
    estimatedCostUsd: computeCost(inputTokens, outputTokens),
  };
}
