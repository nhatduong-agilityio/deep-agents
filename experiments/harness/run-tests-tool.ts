import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { Problem, TestCase } from '../../benchmark/subset/problems.js';
import { PUBLIC_TEST_COUNT, RUN_TESTS_TIMEOUT_MS } from './config.js';

export interface RunTestsResult {
  passed: number;
  total: number;
  errors: string[];
}

const RUNNER_PATH = join(process.cwd(), 'benchmark', 'runner.mjs');

// Node ≥22 ships the Permission Model. Use it to restrict the runner subprocess to
// read-only access on runner.mjs itself — everything else (including the project .env)
// is denied at the OS level. On older Node, env:{} + timeout + empty-cwd are the
// only mitigations; the comment "isolated" would be inaccurate there, but we still
// label the function by intent rather than capability.
const NODE_MAJOR = parseInt(process.versions.node.split('.')[0]!, 10);
// --permission graduated to stable in Node 24; --experimental-permission was Node 22-23.
const PERMISSION_FLAG =
  NODE_MAJOR >= 24 ? '--permission' : NODE_MAJOR >= 22 ? '--experimental-permission' : '';
const PERMISSION_FLAGS = PERMISSION_FLAG
  ? `${PERMISSION_FLAG} --allow-fs-read="${RUNNER_PATH}"`
  : '';

// Protections provided:
//   env:{}         — process.env is empty; API keys not visible to model code
//   cwd: tmpDir    — relative-path reads (e.g. readFileSync('.env')) hit an empty dir
//   timeout        — infinite loops killed after RUN_TESTS_TIMEOUT_MS ms
//   permission flag — (Node ≥22) absolute-path reads outside RUNNER_PATH denied by OS
// This is NOT a full sandbox (no memory limit, no network restriction, no seccomp).
export function executeIsolated(
  code: string,
  paramNames: string[],
  testCases: TestCase[],
): RunTestsResult {
  const tmpDir = mkdtempSync(join(tmpdir(), 'harness-v2-'));
  const input = JSON.stringify({ code, paramNames, testCases });
  try {
    const cmd = `"${process.execPath}" ${PERMISSION_FLAGS} "${RUNNER_PATH}"`;
    const stdout = execSync(cmd, {
      cwd: tmpDir,
      input,
      env: {},
      timeout: RUN_TESTS_TIMEOUT_MS,
      encoding: 'utf8',
    });
    return JSON.parse(stdout) as RunTestsResult;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isTimeout =
      msg.includes('ETIMEDOUT') || msg.includes('spawnSync') || msg.includes('SIGTERM');
    return {
      passed: 0,
      total: testCases.length,
      errors: [isTimeout ? 'Timeout: execution killed after 5000ms' : `Runner error: ${msg}`],
    };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function makeRunTestsTool(problem: Problem) {
  const publicCases = problem.testCases.slice(0, PUBLIC_TEST_COUNT);

  return tool(
    async ({ code }: { code: string }): Promise<string> => {
      const result = executeIsolated(code, problem.paramNames, publicCases);
      const summary =
        result.passed === result.total
          ? `All ${result.total} public tests PASSED.`
          : `${result.passed}/${result.total} passed. Failures: ${result.errors.join(' | ')}`;
      return summary;
    },
    {
      name: 'run_tests',
      description: `Run your JavaScript function body against ${publicCases.length} public test cases for ${problem.functionName}. Provide only the function body — no "function" keyword, no declaration. Returns pass/fail and error details.`,
      schema: z.object({
        code: z
          .string()
          .describe('Function body only — the code that goes inside the function braces'),
      }),
    },
  );
}
