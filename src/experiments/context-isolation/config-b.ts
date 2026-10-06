// Config B: Supervisor-Worker pattern for T-DA-04 Context Isolation Proof.
// Main agent issues 2 task calls (one per corpus group), receives ≤150-word summaries from
// research sub-agents, then synthesises findings/summary/sources without reading /corpus/ itself.

import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import {
  createDeepAgent,
  FilesystemBackend,
  GENERAL_PURPOSE_SUBAGENT,
  type SubAgent,
} from 'deepagents';
import { langsmith } from '../../index.js';
import { withBackoff, type RetryStats } from '../../lib/backoff.js';
import { makeFilesystemMiddleware } from '../../lib/fs-middleware.js';
import { RESEARCH_SUBAGENT } from '../../lib/subagents.js';
import {
  collectSystemTokens,
  computeCompletenessCheck,
  computeMainAgentConsistency,
  CORPUS_DIR,
  type ModelConfig,
  type RunResult,
} from '../artifact-agent/agent.js';
import { checkReport } from '../../scripts/check-report.js';

export const CONFIG_B_WORKSPACE = join(process.cwd(), 'tmp', 'context-isolation', 'b');

// Supervisor task: delegate corpus retrieval to research workers, synthesise from summaries.
// The main agent's /corpus/** read permission is denied — it MUST use task tool results only.
// Prompt split into phases so the model treats synthesis as mandatory tool calls,
// not a text response. "Do not produce text" forces write_file calls.
export const CONFIG_B_SUPERVISOR_TASK =
  'You are a research supervisor. Complete ALL four phases below using tool calls only.\n\n' +
  'PHASE 1 — Plan (call write_todos with these 7 items):\n' +
  '  research-eu, research-us, write-finding-1, write-finding-2, write-finding-3, ' +
  'write-summary, write-sources\n\n' +
  'PHASE 2 — EU AI Act research (call task tool with agent="research"):\n' +
  '  "Read EU AI Act files in /corpus/: eu-ai-act-article-5.txt, eu-ai-act-article-9.txt, ' +
  'eu-ai-act-article-13.txt, eu-ai-act-annex-iii.txt. Write notes to /notes/eu-ai-act.md. ' +
  'Return ≤150 words. For every key point include: Source: <exact-filename>."\n\n' +
  'PHASE 3 — US EO research (call task tool with agent="research"):\n' +
  '  "Read US EO files in /corpus/: us-eo-14110-section-4.txt, us-eo-14110-section-9.txt. ' +
  'Write notes to /notes/us-eo.md. Return ≤150 words. For every key point include: ' +
  'Source: <exact-filename>."\n\n' +
  'PHASE 4 — Synthesise. After both task results return, call write_file in order:\n' +
  '  write_file /report/findings/finding-1.md — one EU AI Act principle. ' +
  'MUST contain line: Source: <exact-corpus-filename>\n' +
  '  write_file /report/findings/finding-2.md — second principle (EU or US). ' +
  'MUST contain line: Source: <exact-corpus-filename>\n' +
  '  write_file /report/findings/finding-3.md — third principle (EU or US). ' +
  'MUST contain line: Source: <exact-corpus-filename>\n' +
  '  write_file /report/summary.md — 2–3 paragraph synthesis\n' +
  '  write_file /report/sources.md — bullet list: "- <filename>: <one-sentence description>"\n\n' +
  'RULES:\n' +
  '- You CANNOT read /corpus/ files — use task results only.\n' +
  '- After phase 2 and 3 results arrive, IMMEDIATELY call write_file for each of the 5 paths.\n' +
  '- Do NOT produce any text response in place of write_file calls.\n' +
  '- Task is not complete until all 5 files exist on disk.';

// Extract the virtual path from each write_file tool call issued by the main agent.
// Worker write_file calls (notes) are not in main agent messages — those are checked
// by scanning workDir/notes/ or via the writesOnDisk guard separately.
function extractMainAgentWritePaths(messages: unknown[]): string[] {
  const paths: string[] = [];
  for (const m of messages) {
    if (!(m instanceof AIMessage)) continue;
    const tc = m.tool_calls as Array<{ name: string; args?: Record<string, unknown> }> | undefined;
    for (const call of tc ?? []) {
      if (call.name === 'write_file') {
        const p = call.args?.['path'] as string | undefined;
        if (p) paths.push(p);
      }
    }
  }
  return paths;
}

// Verify that every virtual path attempted by write_file exists on disk under workDir.
// Exported for unit testing. virtualPaths use leading slash (e.g. '/report/summary.md').
export function checkWritesOnDisk(
  workDir: string,
  virtualPaths: string[],
): { writesOnDisk: boolean; missingOnDisk: string[] } {
  const missingOnDisk = virtualPaths.filter(
    (p) => !existsSync(join(workDir, p.replace(/^\//, ''))),
  );
  return { writesOnDisk: missingOnDisk.length === 0, missingOnDisk };
}

function extractWorkerReturnSizes(messages: unknown[]): {
  workerReturnTokens: number[];
  workerReturnWordCounts: number[];
} {
  const taskCallIds = new Set<string>();
  for (const m of messages) {
    if (!(m instanceof AIMessage)) continue;
    const tc = m.tool_calls as Array<{ name: string; id?: string }> | undefined;
    for (const call of tc ?? []) {
      if (call.name === 'task' && call.id) taskCallIds.add(call.id);
    }
  }
  const workerReturnTokens: number[] = [];
  const workerReturnWordCounts: number[] = [];
  for (const m of messages) {
    if (!(m instanceof ToolMessage)) continue;
    if (!taskCallIds.has(m.tool_call_id)) continue;
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    workerReturnTokens.push(Math.ceil(content.length / 4));
    workerReturnWordCounts.push(content.split(/\s+/).filter(Boolean).length);
  }
  return { workerReturnTokens, workerReturnWordCounts };
}

export async function runConfigBRun(
  runIndex: number,
  modelConfig: ModelConfig,
): Promise<RunResult> {
  const workDir = join(CONFIG_B_WORKSPACE, `run-${runIndex}`);
  mkdirSync(join(workDir, 'corpus'), { recursive: true });
  mkdirSync(join(workDir, 'notes'), { recursive: true });
  // Pre-create report dirs so write_file never fails on missing parent
  mkdirSync(join(workDir, 'report', 'findings'), { recursive: true });

  for (const f of readdirSync(CORPUS_DIR)) {
    cpSync(join(CORPUS_DIR, f), join(workDir, 'corpus', f));
  }

  // RC1/RC2 fix: one shared builder supplies the run's FilesystemBackend to every middleware.
  // Without backend:, createFilesystemMiddleware defaults to StateBackend (in-memory, empty
  // per-thread) — workers cannot read /corpus/ (RC1) and main agent writes go to memory (RC2).
  const backendFactory = (): FilesystemBackend =>
    new FilesystemBackend({ rootDir: workDir, virtualMode: true });

  // Main agent: deny /corpus/** reads — must delegate to research workers.
  const mainFsMw = makeFilesystemMiddleware(backendFactory, [
    { operations: ['read'], paths: ['/corpus/**'], mode: 'deny' },
  ]);

  // Research worker: allow writes only to /notes/; deny all other write paths.
  const workerFsMw = makeFilesystemMiddleware(backendFactory, [
    { operations: ['write'], paths: ['/notes/**'], mode: 'allow' },
    { operations: ['write'], paths: ['/**'], mode: 'deny' },
  ]);

  // Inject backend-aware filesystem middleware into the research sub-agent for this run.
  const researchSubagent: SubAgent = {
    ...RESEARCH_SUBAGENT,
    middleware: [...(RESEARCH_SUBAGENT.middleware ?? []), workerFsMw],
  };

  const runMetadata = { deepagents_version: '1.14.1', model_id: modelConfig.modelId, config: 'B' };
  const agent = createDeepAgent({
    model: modelConfig.model,
    middleware: [mainFsMw],
    backend: backendFactory,
    subagents: [GENERAL_PURPOSE_SUBAGENT, researchSubagent],
  });

  const langsmithRunId = crypto.randomUUID();
  const retryStats: RetryStats = { retryCount: 0, totalWaitMs: 0 };
  const start = Date.now();
  const startedAt = new Date(start).toISOString();
  const result = await withBackoff(
    () =>
      agent.invoke(
        { messages: [{ role: 'user', content: CONFIG_B_SUPERVISOR_TASK }] },
        { metadata: runMetadata, runId: langsmithRunId },
      ),
    { retryStats },
  );
  const elapsedMs = Date.now() - start;

  // Extract main-agent-only metrics from AIMessage.usage_metadata — needed before polling
  // so inputTokensPerCall.length provides the expected main-agent call count.
  let inputTokens = 0;
  let outputTokens = 0;
  const inputTokensPerCall: number[] = [];
  const toolsBeforeCall: string[][] = [];
  let pendingTools: string[] = [];
  for (const m of result.messages) {
    if (!(m instanceof AIMessage)) continue;
    toolsBeforeCall.push(pendingTools);
    const usage = m.usage_metadata;
    const callInput = usage?.input_tokens ?? 0;
    inputTokensPerCall.push(callInput);
    inputTokens += callInput;
    outputTokens += usage?.output_tokens ?? 0;
    const tc = m.tool_calls as Array<{ name: string }> | undefined;
    pendingTools = tc?.map((c) => c.name) ?? [];
  }
  const peakInputTokens = inputTokensPerCall.length > 0 ? Math.max(...inputTokensPerCall) : 0;
  const { workerReturnTokens, workerReturnWordCounts } = extractWorkerReturnSizes(result.messages);

  // Verify all main-agent write_file targets exist on disk (post-RC1/RC2 fix sanity check).
  const mainWritePaths = extractMainAgentWritePaths(result.messages);
  const { writesOnDisk, missingOnDisk } = checkWritesOnDisk(workDir, mainWritePaths);

  await langsmith.awaitPendingTraceBatches();

  const {
    systemInputTokens,
    systemOutputTokens,
    systemSpanTokens,
    mainAgentSpans,
    subAgentSpans,
    measurementIncomplete,
    measurementIncompleteReason,
  } = await collectSystemTokens(langsmithRunId, inputTokensPerCall.length);

  process.stdout.write(`    checking report for Config B run ${runIndex}...\n`);
  const { passed: checkerPassed, findingCount } = checkReport(workDir);

  const mainAgentConsistency = computeMainAgentConsistency(mainAgentSpans, inputTokensPerCall);
  const completenessCheck: 'pass' | 'fail' = measurementIncomplete
    ? 'fail'
    : computeCompletenessCheck(systemSpanTokens, systemInputTokens, mainAgentSpans, subAgentSpans);

  return {
    run: runIndex,
    workDir,
    langsmithRunId,
    langsmithVerified: !measurementIncomplete, // true only when polling confirmed all spans indexed
    checkerPassed,
    findingCount,
    inputTokens,
    outputTokens,
    inputTokensPerCall,
    toolsBeforeCall,
    peakInputTokens,
    modelCallCount: inputTokensPerCall.length,
    systemInputTokens,
    systemOutputTokens,
    systemSpanTokens,
    mainAgentSpans,
    subAgentSpans,
    mainAgentPeakInputTokens: peakInputTokens,
    mainAgentConsistency,
    completenessCheck,
    measurementIncomplete,
    measurementIncompleteReason,
    startedAt,
    workerReturnTokens,
    workerReturnWordCounts,
    writesOnDisk,
    missingOnDisk,
    retryCount: retryStats.retryCount,
    retryWaitMs: Math.round(retryStats.totalWaitMs),
    elapsedMs,
    workMs: Math.max(0, elapsedMs - Math.round(retryStats.totalWaitMs)),
    estimatedCostUsd:
      (inputTokens / 1_000_000) * modelConfig.costPer1MInput +
      (outputTokens / 1_000_000) * modelConfig.costPer1MOutput,
  };
}
