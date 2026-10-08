import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AIMessage } from '@langchain/core/messages';
import { createDeepAgent, FilesystemBackend } from 'deepagents';
import { langsmith } from '@deep-agents/core';
import { withBackoff, type RetryStats } from '@deep-agents/core';
import { makeFilesystemMiddleware } from '@deep-agents/core';
import type { ModelConfig } from '../artifact-agent/agent.js';
import { CRITIC_PERMISSIONS, CRITIC_SYSTEM_PROMPT, CRITIC_TOOLS } from './critic-spec.js';

export interface CriticResult {
  langsmithRunId: string;
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
  retryCount: number;
  retryWaitMs: number;
}

// BRC pattern: allow write only to /feedback/**; deny all other writes.
// allow rule comes first — rules are first-match-wins; the final deny closes the default-allow gap.
// Constants live in critic-spec.ts so the supervisor sub-agent uses identical rules.
function makeCriticAgent(workDir: string, modelConfig: ModelConfig) {
  const backendFactory = (): FilesystemBackend =>
    new FilesystemBackend({ rootDir: workDir, virtualMode: true });

  const criticFsMw = makeFilesystemMiddleware(backendFactory, CRITIC_PERMISSIONS, CRITIC_TOOLS);

  return {
    agent: createDeepAgent({
      model: modelConfig.model,
      middleware: [criticFsMw],
      backend: backendFactory,
      systemPrompt: CRITIC_SYSTEM_PROMPT,
    }),
    backendFactory,
  };
}

export async function runCritic(
  workDir: string,
  draftVersion: number,
  round: number,
  modelConfig: ModelConfig,
): Promise<CriticResult> {
  mkdirSync(join(workDir, 'feedback'), { recursive: true });

  const { agent } = makeCriticAgent(workDir, modelConfig);

  const task =
    `Critique the draft at /drafts/draft-v${draftVersion}.md.\n` +
    `Write your numbered critique to /feedback/round-${round}.md.\n` +
    `List every flaw you find. Be specific and actionable.`;

  const langsmithRunId = crypto.randomUUID();
  const runMetadata = {
    deepagents_version: '1.14.1',
    model_id: modelConfig.modelId,
    config: 'critic',
    task_id: 'T-DA-05',
    round: String(round),
  };
  const retryStats: RetryStats = { retryCount: 0, totalWaitMs: 0 };
  const start = Date.now();

  const result = await withBackoff(
    () =>
      agent.invoke(
        { messages: [{ role: 'user', content: task }] },
        { metadata: runMetadata, runId: langsmithRunId },
      ),
    { retryStats },
  );

  const elapsedMs = Date.now() - start;

  let inputTokens = 0;
  let outputTokens = 0;
  for (const m of result.messages) {
    if (!(m instanceof AIMessage)) continue;
    inputTokens += m.usage_metadata?.input_tokens ?? 0;
    outputTokens += m.usage_metadata?.output_tokens ?? 0;
  }

  await langsmith.awaitPendingTraceBatches();

  return {
    langsmithRunId,
    inputTokens,
    outputTokens,
    elapsedMs,
    retryCount: retryStats.retryCount,
    retryWaitMs: Math.round(retryStats.totalWaitMs),
  };
}

export { makeCriticAgent };
