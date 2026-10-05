import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AIMessage } from '@langchain/core/messages';
import { todoListMiddleware } from 'langchain';
import { createDeepAgent, FilesystemBackend } from 'deepagents';
import { withBackoff } from '../../lib/backoff.js';
import { geminiToolFilter } from '../../lib/gemini-tool-filter.js';

export interface RunResult {
  run: number;
  workDir: string;
  checkerPassed: boolean;
  findingCount: number;
  inputTokens: number;
  outputTokens: number;
  modelCallCount: number;
  elapsedMs: number;
  estimatedCostUsd: number;
}

const COST_PER_1M_INPUT = 0.075;
const COST_PER_1M_OUTPUT = 0.3;

const RUN_METADATA = { deepagents_version: '1.14.1', model_id: 'gemini-3.5-flash-lite' };

export const CORPUS_DIR = join(process.cwd(), 'corpus');
export const WORKSPACE_ROOT = join(process.cwd(), 'tmp', 'artifact-agent');

export const AGENT_TASK =
  'You are an AI policy analyst. Analyse the regulation documents in /corpus/ and produce a ' +
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
  '6. Write /report/summary.md — a 2–3 paragraph overview of the main themes across all ' +
  'findings.\n' +
  '7. Write /report/sources.md — a list of every corpus file you read, one per line, format:\n' +
  '   - <filename>: <one-sentence description>\n\n' +
  'Do not stop until all 5 files are written.';

function extractMetrics(messages: unknown[]): {
  inputTokens: number;
  outputTokens: number;
  modelCallCount: number;
} {
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
  }

  return { inputTokens, outputTokens, modelCallCount };
}

function computeCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * COST_PER_1M_INPUT + (outputTokens / 1_000_000) * COST_PER_1M_OUTPUT
  );
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

  const start = Date.now();
  const result = await withBackoff(() =>
    agent.invoke({ messages: [{ role: 'user', content: AGENT_TASK }] }, { metadata: RUN_METADATA }),
  );
  const elapsedMs = Date.now() - start;

  // workDir is preserved (not deleted) so the checker and future tasks can verify the files
  const { passed: checkerPassed, findingCount } = checkerFn(workDir);
  const { inputTokens, outputTokens, modelCallCount } = extractMetrics(result.messages);

  return {
    run: runIndex,
    workDir,
    checkerPassed,
    findingCount,
    inputTokens,
    outputTokens,
    modelCallCount,
    elapsedMs,
    estimatedCostUsd: computeCost(inputTokens, outputTokens),
  };
}
