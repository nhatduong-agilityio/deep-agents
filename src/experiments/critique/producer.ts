import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AIMessage } from '@langchain/core/messages';
import { createDeepAgent, FilesystemBackend } from 'deepagents';
import { langsmith } from '../../index.js';
import { withBackoff, type RetryStats } from '../../lib/backoff.js';
import { makeFilesystemMiddleware } from '../../lib/fs-middleware.js';
import type { ModelConfig } from '../artifact-agent/agent.js';
import { INITIAL_DRAFT } from './initial-draft.js';

export interface ProducerResult {
  round: number;
  draftVersion: number;
  langsmithRunId: string | null; // null for round 0 (no LLM call)
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
  retryCount: number;
  retryWaitMs: number;
}

// Round 0: write the fixed flawed draft to disk without an LLM call.
// Deterministic seed ensures critique precision measurement is against known flaws.
export function writeInitialDraft(workDir: string): void {
  mkdirSync(join(workDir, 'drafts'), { recursive: true });
  writeFileSync(join(workDir, 'drafts', 'draft-v1.md'), INITIAL_DRAFT, 'utf8');
}

const PRODUCER_SYSTEM_PROMPT =
  'You are a policy analyst and document author. ' +
  'Revise a draft document based on specific critic feedback.\n\n' +
  'Rules:\n' +
  '- Read the current draft and the feedback file specified in your task.\n' +
  '- Write the revised draft to the path specified in your task.\n' +
  '- Address every numbered feedback item.\n' +
  '- After writing the draft, write /notes/revision-{ROUND}.md listing which ' +
  'feedback item numbers you addressed and how, one per line: "Item N: <change made>".\n' +
  '- Do not omit any feedback item.';

export async function runProducer(
  workDir: string,
  round: number,
  draftVersion: number,
  modelConfig: ModelConfig,
): Promise<ProducerResult> {
  mkdirSync(join(workDir, 'notes'), { recursive: true });

  const backendFactory = (): FilesystemBackend =>
    new FilesystemBackend({ rootDir: workDir, virtualMode: true });

  // Producer has full read/write access — no permission restrictions.
  const producerFsMw = makeFilesystemMiddleware(backendFactory, []);

  const agent = createDeepAgent({
    model: modelConfig.model,
    middleware: [producerFsMw],
    backend: backendFactory,
    systemPrompt: PRODUCER_SYSTEM_PROMPT,
  });

  const task =
    `Revision task (round ${round}):\n` +
    `1. Read /drafts/draft-v${draftVersion - 1}.md — current draft.\n` +
    `2. Read /feedback/round-${round - 1}.md — critic feedback.\n` +
    `3. Write the revised draft to /drafts/draft-v${draftVersion}.md — ` +
    `address every numbered feedback item.\n` +
    `4. Write /notes/revision-${round}.md — for each feedback item number, ` +
    `write: "Item N: <description of the change you made>".`;

  const langsmithRunId = crypto.randomUUID();
  const runMetadata = {
    deepagents_version: '1.14.1',
    model_id: modelConfig.modelId,
    config: 'producer',
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
    round,
    draftVersion,
    langsmithRunId,
    inputTokens,
    outputTokens,
    elapsedMs,
    retryCount: retryStats.retryCount,
    retryWaitMs: Math.round(retryStats.totalWaitMs),
  };
}
