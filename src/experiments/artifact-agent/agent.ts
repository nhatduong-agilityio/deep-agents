import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AIMessage } from '@langchain/core/messages';
import { todoListMiddleware } from 'langchain';
import { createDeepAgent, FilesystemBackend } from 'deepagents';
import { langsmith } from '../../index.js';
import { withBackoff, type RetryStats } from '../../lib/backoff.js';
import { geminiToolFilter } from '../../lib/gemini-tool-filter.js';

interface SpanTokens {
  spanId: string;
  promptTokens: number;
  completionTokens: number;
  startTime: string; // RFC3339; chronological ordering for T-DA-04 span analysis
}

// Spans as fetched from LangSmith before grouping — includes parentRunIds for sub-agent detection.
export interface RawSpan {
  spanId: string;
  promptTokens: number;
  completionTokens: number;
  startTime: string;
  parentRunIds: string[];
}

export interface RunResult {
  run: number;
  workDir: string;
  langsmithRunId: string;
  langsmithVerified: boolean;
  checkerPassed: boolean;
  findingCount: number;
  // main-agent tokens only (from result.messages AIMessage.usage_metadata)
  inputTokens: number;
  outputTokens: number;
  // per-call input tokens + tools that preceded each call; used by T-DA-04 peak measurement
  inputTokensPerCall: number[];
  toolsBeforeCall: string[][];
  peakInputTokens: number;
  modelCallCount: number;
  // system-wide tokens across ALL LLM spans in trace (includes sub-agents in Config B)
  systemInputTokens: number;
  systemOutputTokens: number;
  systemSpanTokens: SpanTokens[];
  // per-agent span grouping: main-agent LLM spans vs sub-agent spans keyed by task span ID
  mainAgentSpans: SpanTokens[];
  subAgentSpans: Record<string, SpanTokens[]>;
  // max promptTokens across mainAgentSpans only — the Config A baseline for T-DA-04 ratio
  mainAgentPeakInputTokens: number;
  // 'fail' when systemInputTokens !== inputTokens (unexpected sub-agent or counting divergence)
  systemCheck: 'pass' | 'fail';
  // 429 rate-limit telemetry for this run
  retryCount: number;
  retryWaitMs: number;
  // wall-clock time breakdown: elapsedMs = workMs + retryWaitMs
  elapsedMs: number;
  workMs: number;
  estimatedCostUsd: number;
}

const COST_PER_1M_INPUT = 0.075;
const COST_PER_1M_OUTPUT = 0.3;

const RUN_METADATA = { deepagents_version: '1.14.1', model_id: 'gemini-3.5-flash-lite' };

export const CORPUS_DIR = join(process.cwd(), 'corpus');
export const WORKSPACE_ROOT = join(process.cwd(), 'tmp', 'artifact-agent');

export const AGENT_TASK =
  'You are an AI policy analyst. Analyze the regulation documents in /corpus/ and produce a ' +
  'structured report.\n\n' +
  'Steps (complete ALL before stopping):\n' +
  '1. List files in /corpus/ to see what is available.\n' +
  '2. Read each corpus file.\n' +
  '3. Write /report/findings/finding-1.md — one key principle or requirement from the ' +
  'regulations. The file MUST contain a line in the exact format:\n' +
  '   Source: <corpus-filename>\n' +
  '   where <corpus-filename> is the exact filename (e.g. eu-ai-act-article-5.txt).\n' +
  '4. Write /report/findings/finding-2.md — a second distinct principle, same Source: format.\n' +
  '5. Write /report/findings/finding-3.md — a third distinct principle, same Source: format.\n' +
  '6. Write /report/summary.md — a 2-3 paragraph overview of the main themes across all ' +
  'findings.\n' +
  '7. Write /report/sources.md — a list of every corpus file you read, one per line, format:\n' +
  '   - <filename>: <one-sentence description>\n\n' +
  'Do not stop until all 5 files are written.';

function extractMetrics(messages: unknown[]): {
  inputTokens: number;
  outputTokens: number;
  inputTokensPerCall: number[];
  toolsBeforeCall: string[][];
  modelCallCount: number;
} {
  let inputTokens = 0;
  let outputTokens = 0;
  const inputTokensPerCall: number[] = [];
  const toolsBeforeCall: string[][] = [];

  // tool names from the previous AIMessage's tool_calls (awaiting results before this call)
  let pendingTools: string[] = [];

  for (const m of messages) {
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

  return {
    inputTokens,
    outputTokens,
    inputTokensPerCall,
    toolsBeforeCall,
    modelCallCount: inputTokensPerCall.length,
  };
}

function computeCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * COST_PER_1M_INPUT + (outputTokens / 1_000_000) * COST_PER_1M_OUTPUT
  );
}

// Project UUID is needed by runs.retrieve() and runs.query() — resolved once and cached.
// readProject() is stable (not deprecated); runs.retrieve/query are the non-deprecated APIs.
let _projectId: string | undefined;
async function resolveProjectId(): Promise<string> {
  if (_projectId) return _projectId;
  const name = process.env['LANGSMITH_PROJECT'] ?? 'default';
  const project = await langsmith.readProject({ projectName: name });
  _projectId = project.id;
  return _projectId;
}

// Pure grouping function — sorts rawSpans chronologically by startTime and partitions into
// main-agent spans (not descendants of any task span) vs sub-agent spans (descendants of a
// task tool span, keyed by that task span's ID). Exported for unit testing.
export function groupSpansByAgent(
  rawSpans: RawSpan[],
  taskSpanIds: Set<string>,
): {
  sortedSpans: SpanTokens[];
  mainAgentSpans: SpanTokens[];
  subAgentSpans: Record<string, SpanTokens[]>;
  mainAgentPeakInputTokens: number;
} {
  const sorted = [...rawSpans].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const sortedSpans: SpanTokens[] = [];
  const mainAgentSpans: SpanTokens[] = [];
  const subAgentSpans: Record<string, SpanTokens[]> = {};

  for (const s of sorted) {
    const span: SpanTokens = {
      spanId: s.spanId,
      promptTokens: s.promptTokens,
      completionTokens: s.completionTokens,
      startTime: s.startTime,
    };
    sortedSpans.push(span);
    const taskParent = s.parentRunIds.find((id) => taskSpanIds.has(id));
    if (taskParent !== undefined) {
      (subAgentSpans[taskParent] ??= []).push(span);
    } else {
      mainAgentSpans.push(span);
    }
  }

  return {
    sortedSpans,
    mainAgentSpans,
    subAgentSpans,
    mainAgentPeakInputTokens:
      mainAgentSpans.length > 0 ? Math.max(...mainAgentSpans.map((s) => s.promptTokens)) : 0,
  };
}

// Sum tokens across every LLM span in the trace tree (includes sub-agent calls).
// Spans are sorted chronologically and grouped by agent for T-DA-04 context isolation ratio.
// Reuses the same retry pattern as verifyLangSmithRun; flush is already done there.
async function collectSystemTokens(
  runId: string,
  maxAttempts = 4,
  retryDelayMs = 3000,
): Promise<{
  systemInputTokens: number;
  systemOutputTokens: number;
  systemSpanTokens: SpanTokens[];
  mainAgentSpans: SpanTokens[];
  subAgentSpans: Record<string, SpanTokens[]>;
  mainAgentPeakInputTokens: number;
}> {
  const projectId = await resolveProjectId();
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Find task tool span IDs — empty for Config A (no sub-agents); populated for Config B.
      const taskSpanIds = new Set<string>();
      for await (const run of langsmith.runs.query({
        trace_id: runId,
        run_type: 'TOOL',
        project_ids: [projectId],
        selects: ['ID', 'NAME'],
      })) {
        if (run.name === 'task' && run.id) taskSpanIds.add(run.id);
      }

      const rawSpans: RawSpan[] = [];
      for await (const run of langsmith.runs.query({
        trace_id: runId,
        run_type: 'LLM',
        project_ids: [projectId],
        selects: ['ID', 'PROMPT_TOKENS', 'COMPLETION_TOKENS', 'START_TIME', 'PARENT_RUN_IDS'],
      })) {
        rawSpans.push({
          spanId: run.id ?? '',
          promptTokens: run.prompt_tokens ?? 0,
          completionTokens: run.completion_tokens ?? 0,
          startTime: run.start_time ?? new Date(0).toISOString(),
          parentRunIds: run.parent_run_ids ?? [],
        });
      }

      if (rawSpans.length === 0) continue; // server indexing lag, retry

      const { sortedSpans, mainAgentSpans, subAgentSpans, mainAgentPeakInputTokens } =
        groupSpansByAgent(rawSpans, taskSpanIds);

      const systemInputTokens = sortedSpans.reduce((sum, s) => sum + s.promptTokens, 0);
      const systemOutputTokens = sortedSpans.reduce((sum, s) => sum + s.completionTokens, 0);

      return {
        systemInputTokens,
        systemOutputTokens,
        systemSpanTokens: sortedSpans,
        mainAgentSpans,
        subAgentSpans,
        mainAgentPeakInputTokens,
      };
    } catch {
      // network error, retry
    }
    if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, retryDelayMs));
  }
  process.stderr.write(
    `  [langsmith] no LLM spans found for ${runId} after ${maxAttempts} attempts\n`,
  );
  return {
    systemInputTokens: 0,
    systemOutputTokens: 0,
    systemSpanTokens: [],
    mainAgentSpans: [],
    subAgentSpans: {},
    mainAgentPeakInputTokens: 0,
  };
}

// Flush pending LangSmith traces then verify the run exists with expected metadata.
// Retries up to maxAttempts because the server may lag behind the flush.
async function verifyLangSmithRun(
  runId: string,
  maxAttempts = 4,
  retryDelayMs = 3000,
): Promise<boolean> {
  await langsmith.awaitPendingTraceBatches();
  const projectId = await resolveProjectId();
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const run = await langsmith.runs.retrieve(runId, {
        project_id: projectId,
        selects: ['METADATA'],
      });
      // new API exposes metadata at run.metadata (top-level); extra.metadata is also populated
      const meta = (run.metadata as Record<string, unknown>) ?? {};
      if (meta['deepagents_version'] && meta['model_id']) return true;
      process.stderr.write(
        `  [langsmith] run ${runId} found but metadata incomplete: ${JSON.stringify(meta)}\n`,
      );
      return false;
    } catch {
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, retryDelayMs));
    }
  }
  process.stderr.write(`  [langsmith] run ${runId} not found after ${maxAttempts} attempts\n`);
  return false;
}

export async function runArtifactRun(
  runIndex: number,
  checkerFn: (workDir: string) => { passed: boolean; findingCount: number },
): Promise<RunResult> {
  const workDir = join(WORKSPACE_ROOT, `run-${runIndex}`);
  mkdirSync(join(workDir, 'corpus'), { recursive: true });

  // Populate corpus inside workDir so virtualMode can serve it at /corpus/
  for (const f of readdirSync(CORPUS_DIR)) {
    cpSync(join(CORPUS_DIR, f), join(workDir, 'corpus', f));
  }

  const agent = createDeepAgent({
    model: 'google-genai:gemini-3.5-flash-lite',
    middleware: [geminiToolFilter, todoListMiddleware()],
    // virtualMode scopes all agent paths under workDir — prevents writes outside project
    backend: () => new FilesystemBackend({ rootDir: workDir, virtualMode: true }),
  });

  // runId passed in config becomes the LangSmith root trace ID
  const langsmithRunId = crypto.randomUUID();
  const retryStats: RetryStats = { retryCount: 0, totalWaitMs: 0 };
  const start = Date.now();
  const result = await withBackoff(
    () =>
      agent.invoke(
        { messages: [{ role: 'user', content: AGENT_TASK }] },
        { metadata: RUN_METADATA, runId: langsmithRunId },
      ),
    { retryStats },
  );
  const elapsedMs = Date.now() - start;

  // Verify trace; collectSystemTokens reuses the retry pattern (flush already done here)
  const langsmithVerified = await verifyLangSmithRun(langsmithRunId);
  const {
    systemInputTokens,
    systemOutputTokens,
    systemSpanTokens,
    mainAgentSpans,
    subAgentSpans,
    mainAgentPeakInputTokens,
  } = await collectSystemTokens(langsmithRunId);

  // workDir is preserved (not deleted) so the checker and future tasks can verify the files
  const { passed: checkerPassed, findingCount } = checkerFn(workDir);
  const { inputTokens, outputTokens, inputTokensPerCall, toolsBeforeCall, modelCallCount } =
    extractMetrics(result.messages);
  const peakInputTokens = inputTokensPerCall.length > 0 ? Math.max(...inputTokensPerCall) : 0;

  // Config A assertion: no sub-agents → system tokens must equal main-agent tokens exactly.
  // Mismatch indicates unexpected sub-agent calls or a counting divergence between
  // AIMessage.usage_metadata and LangSmith prompt_tokens.
  // Result is saved regardless so run.ts can decide whether to abort the run set.
  const systemCheck: 'pass' | 'fail' = systemInputTokens === inputTokens ? 'pass' : 'fail';

  return {
    run: runIndex,
    workDir,
    langsmithRunId,
    langsmithVerified,
    checkerPassed,
    findingCount,
    inputTokens,
    outputTokens,
    inputTokensPerCall,
    toolsBeforeCall,
    peakInputTokens,
    modelCallCount,
    systemInputTokens,
    systemOutputTokens,
    systemSpanTokens,
    mainAgentSpans,
    subAgentSpans,
    mainAgentPeakInputTokens,
    systemCheck,
    retryCount: retryStats.retryCount,
    retryWaitMs: Math.round(retryStats.totalWaitMs),
    elapsedMs,
    workMs: Math.max(0, elapsedMs - Math.round(retryStats.totalWaitMs)),
    estimatedCostUsd: computeCost(inputTokens, outputTokens),
  };
}
