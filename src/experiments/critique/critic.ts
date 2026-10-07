import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AIMessage } from '@langchain/core/messages';
import { createDeepAgent, createFilesystemMiddleware, FilesystemBackend } from 'deepagents';
import { langsmith } from '../../index.js';
import { withBackoff, type RetryStats } from '../../lib/backoff.js';
import type { ModelConfig } from '../artifact-agent/agent.js';

export interface CriticResult {
  langsmithRunId: string;
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
  retryCount: number;
  retryWaitMs: number;
}

const CRITIC_SYSTEM_PROMPT =
  'You are a rigorous document critic. Your job is to identify genuine flaws in a draft ' +
  'document and write structured, numbered feedback.\n\n' +
  'Rules:\n' +
  '- Read the draft from the path specified in your task.\n' +
  '- Write a numbered list of flaws to the feedback path specified in your task.\n' +
  '- Each item must state: (1) what the specific problem is, (2) where in the document, ' +
  '(3) how to fix it.\n' +
  '- You CANNOT write outside /feedback/ — any such attempt will be denied.\n' +
  '- Do not produce text responses; use only tool calls.';

// BRC pattern: allow write only to /feedback/**; deny all other writes.
// allow rule comes first — rules are first-match-wins; the final deny closes the default-allow gap.
function makeCriticAgent(workDir: string, modelConfig: ModelConfig) {
  const backendFactory = (): FilesystemBackend =>
    new FilesystemBackend({ rootDir: workDir, virtualMode: true });

  const criticFsMw = createFilesystemMiddleware({
    backend: backendFactory,
    // Explicit allowlist: exclude execute and grep (BRC — minimise blast radius).
    tools: ['read_file', 'ls', 'glob', 'write_file'],
    permissions: [
      { operations: ['write'], paths: ['/feedback/**'], mode: 'allow' },
      { operations: ['write'], paths: ['/**'], mode: 'deny' },
    ],
  });

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
