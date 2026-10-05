/**
 * Smoke test: verify geminiToolFilter must be passed explicitly to sub-agents.
 *
 * The general-purpose sub-agent spawned by the task tool does NOT inherit
 * middleware from the parent when appendNew:false (deepagents@1.14.1 source,
 * mergeMiddlewareStack). Without geminiToolFilter, grep's Zod .positive()
 * schema produces `exclusiveMinimum` which Gemini rejects with HTTP 400.
 *
 * Fix: include the general-purpose subagent spec in `subagents` with
 * `middleware: [geminiToolFilter]` so it's merged into the default stack.
 *
 * Run: npx tsx --env-file=.env src/scripts/smoke-subagent-filter.ts
 */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { todoListMiddleware } from 'langchain';
import { createDeepAgent, FilesystemBackend, GENERAL_PURPOSE_SUBAGENT } from 'deepagents';
import { geminiToolFilter } from '../lib/gemini-tool-filter.js';

const TASK =
  'Use the task tool to delegate the following to a sub-agent: ' +
  'write the text "hello from sub-agent" to /workspace/out.txt. ' +
  'Do not write the file yourself — use the task tool.';

const workDir = join(process.cwd(), 'tmp', 'smoke-subagent');
mkdirSync(workDir, { recursive: true });

async function runTest(label: string, includeFilterInSubagent: boolean): Promise<boolean> {
  process.stdout.write(`\n--- ${label} ---\n`);
  const subagentMiddleware = includeFilterInSubagent ? [geminiToolFilter] : [];

  try {
    const agent = createDeepAgent({
      model: 'google-genai:gemini-3.5-flash-lite',
      middleware: [geminiToolFilter, todoListMiddleware()],
      // Pass geminiToolFilter to the general-purpose sub-agent explicitly
      subagents: [{ ...GENERAL_PURPOSE_SUBAGENT, middleware: subagentMiddleware }],
      backend: () => new FilesystemBackend({ rootDir: workDir, virtualMode: true }),
    });

    await agent.invoke(
      { messages: [{ role: 'user', content: TASK }] },
      { metadata: { test: 'smoke-subagent-filter', includeFilterInSubagent } },
    );
    process.stdout.write(`PASS: completed without schema error\n`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const is400 =
      msg.includes('400') || msg.includes('exclusiveMinimum') || msg.includes('INVALID_ARGUMENT');
    process.stdout.write(
      `FAIL${is400 ? ' (400 schema error — filter not applied)' : ' (unexpected)'}: ${msg.slice(0, 120)}\n`,
    );
    return false;
  }
}

// Case 1: with filter in sub-agent — should succeed
const passed = await runTest('WITH geminiToolFilter in sub-agent', true);
rmSync(workDir, { recursive: true, force: true });

process.stdout.write(`\nResult: ${passed ? 'PASS' : 'FAIL'}\n`);
process.exit(passed ? 0 : 1);
