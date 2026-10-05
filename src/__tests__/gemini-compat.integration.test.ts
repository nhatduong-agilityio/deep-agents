/**
 * Integration tests: prove Gemini accepts the tool list for both the main agent
 * and sub-agents spawned via the real `task` tool path.
 *
 * Test 1: main agent — proves geminiToolFilter works for the main agent.
 * Tests 2+: one per registered sub-agent — builds the real main agent with its
 * sub-agent list (same config as T-DA-04 Config B), instructs it to delegate
 * via the `task` tool, then verifies three assertions:
 *   A1: a `task` tool call appears in the returned messages
 *   A2: a child LLM span exists under the task span in LangSmith
 *       (proves sub-agent middleware stack ran + Gemini accepted it)
 *   A3: no HTTP 400 thrown anywhere in the run
 *
 * The sub-agent test exercises the exact bug DDR-011 documents: sub-agents spawned
 * via `task` do NOT inherit parent middleware (mergeMiddlewareStack appendNew:false),
 * so each spec must carry geminiToolFilter explicitly via withGeminiCompat.
 *
 * Run with: pnpm test:integration  (excluded from pnpm test — requires GEMINI_API_KEY)
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { AIMessage } from '@langchain/core/messages';
import { todoListMiddleware } from 'langchain';
import { createDeepAgent, FilesystemBackend } from 'deepagents';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { geminiToolFilter } from '../lib/gemini-tool-filter.js';
import { SUBAGENTS } from '../lib/subagents.js';
import { withBackoff } from '../lib/backoff.js';
import { langsmith } from '../index.js';

const MODEL = 'google-genai:gemini-3.5-flash-lite';

function tempWorkDir(suffix: string): string {
  const d = join(tmpdir(), `gemini-compat-integration-${suffix}`);
  mkdirSync(d, { recursive: true });
  return d;
}

describe('Gemini tool-list acceptance — integration', () => {
  let projectId: string;

  beforeAll(async () => {
    const project = await langsmith.readProject({
      projectName: process.env['LANGSMITH_PROJECT'] ?? 'default',
    });
    projectId = project.id;
    console.log(`LangSmith project: ${project.name} (${projectId})`);
  }, 30_000);

  it('main agent: Gemini accepts tool list after geminiToolFilter', async () => {
    const agent = createDeepAgent({
      model: MODEL,
      middleware: [geminiToolFilter, todoListMiddleware()],
      backend: () => new FilesystemBackend({ rootDir: tempWorkDir('main'), virtualMode: true }),
    });
    const result = await withBackoff(() =>
      agent.invoke({
        messages: [{ role: 'user', content: 'Reply with the word "ok" only. Do not use tools.' }],
      }),
    );
    expect(result.messages.length).toBeGreaterThan(0);
  }, 60_000);

  for (const spec of SUBAGENTS) {
    it(`${spec.name} sub-agent via task tool: task called, child LLM span exists, no 400`, async () => {
      const langsmithRunId = crypto.randomUUID();
      const workDir = tempWorkDir(`task-${spec.name}`);

      const agent = createDeepAgent({
        model: MODEL,
        middleware: [geminiToolFilter, todoListMiddleware()],
        backend: () => new FilesystemBackend({ rootDir: workDir, virtualMode: true }),
        subagents: SUBAGENTS,
      });

      const prompt =
        `You MUST use the task tool to delegate to your "${spec.name}" sub-agent. ` +
        `The sub-agent's task: reply with exactly the word "done". ` +
        `Do not answer the user directly — you MUST call the task tool first, ` +
        `then relay whatever the sub-agent returns.`;

      // HTTP 400 from Gemini would throw here — A3 passes if we reach the assertions
      const result = await withBackoff(() =>
        agent.invoke(
          { messages: [{ role: 'user', content: prompt }] },
          {
            runId: langsmithRunId,
            metadata: { test: 'gemini-compat-integration', subagent: spec.name },
          },
        ),
      );

      console.log(`  runId: ${langsmithRunId}`);

      // ── A1: task tool call appeared in messages ─────────────────────────
      const allToolCalls = result.messages
        .filter((m): m is AIMessage => m instanceof AIMessage)
        .flatMap((m) => m.tool_calls ?? []);
      const taskCalls = allToolCalls.filter((tc) => tc.name === 'task');
      console.log(
        `  [A1] tool calls: [${allToolCalls.map((t) => t.name).join(', ')}] — task calls: ${taskCalls.length}`,
      );
      expect(taskCalls.length, 'A1: no task tool call in messages').toBeGreaterThan(0);

      // ── A2: child LLM span under task span in LangSmith ─────────────────
      await langsmith.awaitPendingTraceBatches();

      type SpanRecord = {
        id?: string | null;
        run_type?: string | null;
        name?: string | null;
        parent_run_ids?: Array<string> | null;
        prompt_tokens?: number | null;
        completion_tokens?: number | null;
      };
      let traceRuns: SpanRecord[] = [];
      for (let attempt = 1; attempt <= 4; attempt++) {
        traceRuns = [];
        for await (const run of langsmith.runs.query({
          trace_id: langsmithRunId,
          project_ids: [projectId],
          selects: [
            'ID',
            'RUN_TYPE',
            'NAME',
            'PARENT_RUN_IDS',
            'PROMPT_TOKENS',
            'COMPLETION_TOKENS',
          ],
        })) {
          traceRuns.push(run as SpanRecord);
        }
        if (traceRuns.length > 0) break;
        if (attempt < 4) await new Promise((r) => setTimeout(r, 3_000));
      }

      // Find task tool spans and any LLM spans that are their descendants
      const taskSpans = traceRuns.filter((r) => r.name === 'task');
      const taskSpanIds = new Set(taskSpans.map((s) => s.id ?? '').filter(Boolean));
      const childLLMSpans = traceRuns.filter(
        (r) =>
          (r.run_type ?? '').toLowerCase() === 'llm' &&
          (r.parent_run_ids ?? []).some((pid) => taskSpanIds.has(pid)),
      );

      // Fallback evidence: total LLM spans should exceed main-agent AIMessage count
      const mainAgentCallCount = result.messages.filter((m) => m instanceof AIMessage).length;
      const totalLLMSpans = traceRuns.filter((r) => (r.run_type ?? '').toLowerCase() === 'llm');

      console.log(
        `  [A2] spans: ${traceRuns.length} total, task spans: ${taskSpans.length}, ` +
          `child LLM spans: ${childLLMSpans.length}, ` +
          `total LLM spans: ${totalLLMSpans.length}, main-agent AIMessages: ${mainAgentCallCount}`,
      );
      if (taskSpanIds.size > 0) {
        console.log(`  [A2] task span IDs: [${[...taskSpanIds].join(', ')}]`);
      }

      // Primary: child LLM span under task span (parent_run_ids chain)
      // Fallback: total LLM > main-agent calls (sub-agent contributed calls)
      const subagentMadeCall =
        childLLMSpans.length > 0 || totalLLMSpans.length > mainAgentCallCount;
      expect(subagentMadeCall, 'A2: no evidence of sub-agent LLM call in trace').toBe(true);

      // ── A3: no HTTP 400 (proved by reaching this line) ──────────────────
      console.log(`  [A3] no HTTP 400 — run completed`);
    }, 120_000);
  }
});
