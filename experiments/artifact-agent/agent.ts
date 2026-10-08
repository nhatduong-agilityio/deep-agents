import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AIMessage } from '@langchain/core/messages';
import { createDeepAgent, FilesystemBackend } from 'deepagents';
import { langsmith } from '@deep-agents/core';
import { withBackoff, type RetryStats } from '@deep-agents/core';

export interface SpanTokens {
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
  // per-call input tokens + tools that preceded each call
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
  // max of inputTokensPerCall (from messages) — source of truth for T-DA-04 ratio gate
  mainAgentPeakInputTokens: number;
  // per-call LangSmith vs messages comparison: 'pass'=all match, 'incomplete'=span count mismatch/empty, 'mismatch'=values differ
  mainAgentConsistency: 'pass' | 'incomplete' | 'mismatch';
  // All LLM spans assigned to exactly one group; token sums match system total
  completenessCheck: 'pass' | 'fail';
  // true when LangSmith indexing timed out and system token data is unreliable
  measurementIncomplete: boolean;
  measurementIncompleteReason?: string;
  // Optional: populated by Config B runs (task tool result sizes from sub-agents)
  workerReturnTokens?: number[];
  workerReturnWordCounts?: number[];
  // Optional: populated by Config B runs (disk write verification post-run)
  writesOnDisk?: boolean;
  missingOnDisk?: string[];
  // ISO timestamp of agent invoke start — for cross-run ordering and incident correlation
  startedAt: string;
  // 429 rate-limit telemetry
  retryCount: number;
  retryWaitMs: number;
  // wall-clock time breakdown: elapsedMs = workMs + retryWaitMs
  elapsedMs: number;
  workMs: number;
  estimatedCostUsd: number;
}

export interface ModelConfig {
  model: string; // deepagents model string, e.g. 'openai:gpt-5.4-mini-2026-03-17'
  modelId: string; // trace metadata model_id
  costPer1MInput: number;
  costPer1MOutput: number;
}

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  model: 'openai:gpt-5.4-mini-2026-03-17',
  modelId: 'gpt-5.4-mini-2026-03-17',
  // Verified 2026-10-06: developers.openai.com/api/docs/pricing — $0.75/$4.50 per 1M tokens
  costPer1MInput: 0.75,
  costPer1MOutput: 4.5,
};

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

function computeCost(inputTokens: number, outputTokens: number, cfg: ModelConfig): number {
  return (
    (inputTokens / 1_000_000) * cfg.costPer1MInput +
    (outputTokens / 1_000_000) * cfg.costPer1MOutput
  );
}

// Every LLM span must be in exactly one group; token sums must match the system total.
export function computeCompletenessCheck(
  systemSpanTokens: SpanTokens[],
  systemInputTokens: number,
  mainAgentSpans: SpanTokens[],
  subAgentSpans: Record<string, SpanTokens[]>,
): 'pass' | 'fail' {
  const allSubSpans = Object.values(subAgentSpans).flat();
  const totalGrouped = mainAgentSpans.length + allSubSpans.length;
  const groupedTokenSum =
    mainAgentSpans.reduce((s, sp) => s + sp.promptTokens, 0) +
    allSubSpans.reduce((s, sp) => s + sp.promptTokens, 0);
  return totalGrouped === systemSpanTokens.length && groupedTokenSum === systemInputTokens
    ? 'pass'
    : 'fail';
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

  return { sortedSpans, mainAgentSpans, subAgentSpans };
}

// Compares per-call promptTokens from LangSmith mainAgentSpans against inputTokensPerCall
// from messages. 'incomplete' = zero spans or fewer than expected (indexing lag).
// 'mismatch' = more spans than calls (wrong classification) or value differs on matching calls.
export function computeMainAgentConsistency(
  mainAgentSpans: SpanTokens[],
  inputTokensPerCall: number[],
): 'pass' | 'incomplete' | 'mismatch' {
  if (mainAgentSpans.length === 0) return 'incomplete';
  if (mainAgentSpans.length < inputTokensPerCall.length) return 'incomplete'; // indexing lag
  if (mainAgentSpans.length > inputTokensPerCall.length) return 'mismatch'; // classification error
  for (let i = 0; i < mainAgentSpans.length; i++) {
    if (mainAgentSpans[i]!.promptTokens !== inputTokensPerCall[i]!) return 'mismatch';
  }
  return 'pass';
}

// Poll LangSmith until main-agent span count matches expectedMainAgentCallCount AND
// total span count is stable across two consecutive polls (guards against indexing lag).
// Times out after maxWaitMs and returns measurementIncomplete:true so the gate excludes
// the run rather than recording a wrong value.
export async function collectSystemTokens(
  runId: string,
  expectedMainAgentCallCount: number,
  maxWaitMs = 90_000,
): Promise<{
  systemInputTokens: number;
  systemOutputTokens: number;
  systemSpanTokens: SpanTokens[];
  mainAgentSpans: SpanTokens[];
  subAgentSpans: Record<string, SpanTokens[]>;
  measurementIncomplete: boolean;
  measurementIncompleteReason?: string;
}> {
  const projectId = await resolveProjectId();
  const pollIntervalMs = 5_000;
  const deadline = Date.now() + maxWaitMs;
  let prevTotalSpanCount = -1; // -1 forces a second stable poll before returning
  let firstErrorLogged = false;

  while (Date.now() < deadline) {
    try {
      // Find task tool span IDs — empty for Config A; populated for Config B.
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

      const { sortedSpans, mainAgentSpans, subAgentSpans } = groupSpansByAgent(
        rawSpans,
        taskSpanIds,
      );

      // Return when main-agent count matches AND total hasn't grown since last poll.
      if (
        mainAgentSpans.length === expectedMainAgentCallCount &&
        sortedSpans.length === prevTotalSpanCount
      ) {
        const systemInputTokens = sortedSpans.reduce((sum, s) => sum + s.promptTokens, 0);
        const systemOutputTokens = sortedSpans.reduce((sum, s) => sum + s.completionTokens, 0);
        return {
          systemInputTokens,
          systemOutputTokens,
          systemSpanTokens: sortedSpans,
          mainAgentSpans,
          subAgentSpans,
          measurementIncomplete: false,
        };
      }

      prevTotalSpanCount = sortedSpans.length;
    } catch (err: unknown) {
      // 401/403/404 will not resolve with retries — surface immediately
      const status =
        (err as { status?: number }).status ??
        (err as { statusCode?: number }).statusCode ??
        (err as { response?: { status?: number } }).response?.status;
      if (status === 401 || status === 403 || status === 404) {
        process.stderr.write(`  [langsmith] non-retryable error ${status}: ${String(err)}\n`);
        return {
          systemInputTokens: 0,
          systemOutputTokens: 0,
          systemSpanTokens: [],
          mainAgentSpans: [],
          subAgentSpans: {},
          measurementIncomplete: true,
          measurementIncompleteReason: `LangSmith non-retryable error ${status}`,
        };
      }
      if (!firstErrorLogged) {
        process.stderr.write(`  [langsmith] poll error (will retry): ${String(err)}\n`);
        firstErrorLogged = true;
      }
    }

    if (Date.now() + pollIntervalMs < deadline) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
  }

  // Timeout — run will be excluded from gate
  process.stderr.write(
    `  [langsmith] timeout after ${maxWaitMs}ms: expected ${expectedMainAgentCallCount} main-agent spans (run ${runId})\n`,
  );
  return {
    systemInputTokens: 0,
    systemOutputTokens: 0,
    systemSpanTokens: [],
    mainAgentSpans: [],
    subAgentSpans: {},
    measurementIncomplete: true,
    measurementIncompleteReason: `LangSmith indexing timeout (${maxWaitMs}ms): expected ${expectedMainAgentCallCount} main-agent spans`,
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

// workspaceRoot defaults to WORKSPACE_ROOT (tmp/artifact-agent) for T-DA-03 backward compat.
// T-DA-04 Config A passes tmp/context-isolation/a to keep evidence directories separate.
// modelConfig defaults to DEFAULT_MODEL_CONFIG; callers should pass an explicit shared constant
// so Config A and Config B are provably using the same model, metadata, and price table.
export async function runArtifactRun(
  runIndex: number,
  checkerFn: (workDir: string) => { passed: boolean; findingCount: number },
  workspaceRoot = WORKSPACE_ROOT,
  modelConfig: ModelConfig = DEFAULT_MODEL_CONFIG,
): Promise<RunResult> {
  const workDir = join(workspaceRoot, `run-${runIndex}`);
  mkdirSync(join(workDir, 'corpus'), { recursive: true });

  // Populate corpus inside workDir so virtualMode can serve it at /corpus/
  for (const f of readdirSync(CORPUS_DIR)) {
    cpSync(join(CORPUS_DIR, f), join(workDir, 'corpus', f));
  }

  const runMetadata = { deepagents_version: '1.14.1', model_id: modelConfig.modelId };
  const agent = createDeepAgent({
    model: modelConfig.model,
    // virtualMode scopes all agent paths under workDir — prevents writes outside project
    backend: () => new FilesystemBackend({ rootDir: workDir, virtualMode: true }),
  });

  // runId passed in config becomes the LangSmith root trace ID
  const langsmithRunId = crypto.randomUUID();
  const retryStats: RetryStats = { retryCount: 0, totalWaitMs: 0 };
  const start = Date.now();
  const startedAt = new Date(start).toISOString();
  const result = await withBackoff(
    () =>
      agent.invoke(
        { messages: [{ role: 'user', content: AGENT_TASK }] },
        { metadata: runMetadata, runId: langsmithRunId },
      ),
    { retryStats },
  );
  const elapsedMs = Date.now() - start;

  // workDir is preserved (not deleted) so the checker and future tasks can verify the files
  const { passed: checkerPassed, findingCount } = checkerFn(workDir);
  const { inputTokens, outputTokens, inputTokensPerCall, toolsBeforeCall, modelCallCount } =
    extractMetrics(result.messages);
  // Item 1: peak from messages, not LangSmith — immune to indexing lag
  const peakInputTokens = inputTokensPerCall.length > 0 ? Math.max(...inputTokensPerCall) : 0;

  // Verify trace; collectSystemTokens polls until spans stable (flush already done here)
  const langsmithVerified = await verifyLangSmithRun(langsmithRunId);
  const {
    systemInputTokens,
    systemOutputTokens,
    systemSpanTokens,
    mainAgentSpans,
    subAgentSpans,
    measurementIncomplete,
    measurementIncompleteReason,
  } = await collectSystemTokens(langsmithRunId, modelCallCount);

  const mainAgentConsistency = computeMainAgentConsistency(mainAgentSpans, inputTokensPerCall);
  // Short-circuit: empty LangSmith data from a timeout trivially satisfies computeCompletenessCheck
  // (0===0), which would be a false pass. Force 'fail' whenever the measurement is incomplete.
  const completenessCheck: 'pass' | 'fail' = measurementIncomplete
    ? 'fail'
    : computeCompletenessCheck(systemSpanTokens, systemInputTokens, mainAgentSpans, subAgentSpans);

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
    mainAgentPeakInputTokens: peakInputTokens,
    mainAgentConsistency,
    completenessCheck,
    measurementIncomplete,
    measurementIncompleteReason,
    startedAt,
    retryCount: retryStats.retryCount,
    retryWaitMs: Math.round(retryStats.totalWaitMs),
    elapsedMs,
    workMs: Math.max(0, elapsedMs - Math.round(retryStats.totalWaitMs)),
    estimatedCostUsd: computeCost(inputTokens, outputTokens, modelConfig),
  };
}
