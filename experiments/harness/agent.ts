import { AIMessage } from '@langchain/core/messages';
import { createDeepAgent, FilesystemBackend } from 'deepagents';
import { withBackoff, type RetryStats } from '@deep-agents/core';
import type { Problem } from '../../benchmark/subset/problems.js';
import {
  COST_PER_1M_INPUT,
  COST_PER_1M_OUTPUT,
  MAX_TOOL_CALLS,
  MODEL_ID,
  type HarnessV2StepId,
} from './config.js';
import {
  extractFinalCode,
  makeContextPruningMiddleware,
  makeLoopDetectionMiddleware,
  makePreCompletionMiddleware,
} from './middleware.js';
import { executeIsolated, makeRunTestsTool } from './run-tests-tool.js';

const BASE_SYSTEM = `You are a JavaScript coding expert solving algorithmic problems.
You have access to a run_tests tool that executes your code against public test cases.

Rules:
- Always write a function body only — no function declaration, no function keyword, no parameter list.
- The harness wraps it: function {functionName}({params}) { <your code here> }
- Handle all edge cases.
- When you are confident your solution is correct, give a final response that includes the function body inside a \`\`\`javascript fence.`;

const SELF_VERIFICATION_SYSTEM = `${BASE_SYSTEM}

MANDATORY VERIFICATION STEP:
Before giving your final answer, you MUST call run_tests at least once to verify your solution.
If run_tests shows any failures, fix the code and run_tests again until all public tests pass.
Only then give your final answer.`;

function buildSystemPrompt(stepId: HarnessV2StepId): string {
  return stepId === 'self-verification' ? SELF_VERIFICATION_SYSTEM : BASE_SYSTEM;
}

function buildUserPrompt(problem: Problem): string {
  return (
    `Problem: ${problem.description}\n\n` +
    `Function signature: function ${problem.functionName}(${problem.paramNames.join(', ')})\n\n` +
    `Use the run_tests tool to verify your solution, then provide the final function body ` +
    `in a \`\`\`javascript fence.`
  );
}

export interface AgentSolveResult {
  code: string | null;
  publicPassed: number;
  publicTotal: number;
  hiddenPassed: number;
  hiddenTotal: number;
  inputTokens: number;
  outputTokens: number;
  modelCalls: number;
  toolCallCount: number;
  elapsedMs: number;
  loopDetected: boolean;
  errors: string[];
  retryCount: number;
  retryWaitMs: number;
}

function extractMetrics(messages: unknown[]): {
  inputTokens: number;
  outputTokens: number;
  modelCalls: number;
  toolCallCount: number;
} {
  let inputTokens = 0;
  let outputTokens = 0;
  let modelCalls = 0;
  let toolCallCount = 0;

  for (const m of messages) {
    if (!(m instanceof AIMessage)) continue;
    modelCalls++;
    inputTokens += m.usage_metadata?.input_tokens ?? 0;
    outputTokens += m.usage_metadata?.output_tokens ?? 0;
    toolCallCount += m.tool_calls?.length ?? 0;
  }

  return { inputTokens, outputTokens, modelCalls, toolCallCount };
}

export async function solveWithAgent(
  problem: Problem,
  stepId: HarnessV2StepId,
): Promise<AgentSolveResult> {
  const runTestsTool = makeRunTestsTool(problem);
  const systemPrompt = buildSystemPrompt(stepId);

  // Build middleware stack per step
  const { mw: loopMw, isLoopDetected } = makeLoopDetectionMiddleware();
  const middlewareStack = (() => {
    switch (stepId) {
      case 'baseline':
      case 'self-verification':
        return [];
      case 'pre-completion':
        return [makePreCompletionMiddleware()];
      case 'loop-detection':
        return [loopMw];
      case 'context-pruning':
        return [makeContextPruningMiddleware()];
    }
  })();

  const agent = createDeepAgent({
    model: `openai:${MODEL_ID}`,
    tools: [runTestsTool],
    systemPrompt,
    middleware: middlewareStack,
    // Stateless virtual backend — no filesystem tools needed for this benchmark
    backend: () =>
      new FilesystemBackend({
        rootDir: '/tmp',
        virtualMode: true,
      }),
  });

  const retryStats: RetryStats = { retryCount: 0, totalWaitMs: 0 };
  const start = Date.now();

  let result: { messages: unknown[] };
  const errors: string[] = [];

  try {
    result = await withBackoff(
      () =>
        agent.invoke(
          {
            messages: [
              {
                role: 'user',
                content: buildUserPrompt(problem),
              },
            ],
          },
          {
            recursionLimit: MAX_TOOL_CALLS + 4, // allow a few finish steps beyond tool budget
          },
        ),
      { retryStats },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`Agent error: ${msg}`);
    return {
      code: null,
      publicPassed: 0,
      publicTotal: problem.testCases.length,
      hiddenPassed: 0,
      hiddenTotal: problem.testCases.length,
      inputTokens: 0,
      outputTokens: 0,
      modelCalls: 0,
      toolCallCount: 0,
      elapsedMs: Date.now() - start,
      loopDetected: isLoopDetected(),
      errors,
      retryCount: retryStats.retryCount,
      retryWaitMs: Math.round(retryStats.totalWaitMs),
    };
  }

  const elapsedMs = Date.now() - start;
  const { inputTokens, outputTokens, modelCalls, toolCallCount } = extractMetrics(result.messages);

  // Extract final code from the agent's response
  const code = extractFinalCode(result.messages);

  // Score against public test cases (first PUBLIC_TEST_COUNT)
  const { PUBLIC_TEST_COUNT } = await import('./config.js');
  const publicCases = problem.testCases.slice(0, PUBLIC_TEST_COUNT);
  const hiddenCases = problem.testCases.slice(PUBLIC_TEST_COUNT);

  let publicPassed = 0;
  let hiddenPassed = 0;

  if (code) {
    const publicResult = executeIsolated(code, problem.paramNames, publicCases);
    publicPassed = publicResult.passed;
    if (publicResult.errors.length > 0 && errors.length === 0) {
      errors.push(...publicResult.errors.slice(0, 2));
    }

    if (hiddenCases.length > 0) {
      const hiddenResult = executeIsolated(code, problem.paramNames, hiddenCases);
      hiddenPassed = hiddenResult.passed;
      if (hiddenResult.errors.length > 0 && errors.length < 3) {
        errors.push(...hiddenResult.errors.slice(0, 1));
      }
    }
  }

  return {
    code,
    publicPassed,
    publicTotal: publicCases.length,
    hiddenPassed,
    hiddenTotal: hiddenCases.length,
    inputTokens,
    outputTokens,
    modelCalls,
    toolCallCount,
    elapsedMs,
    loopDetected: isLoopDetected(),
    errors,
    retryCount: retryStats.retryCount,
    retryWaitMs: Math.round(retryStats.totalWaitMs),
  };
}

export function estimateCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * COST_PER_1M_INPUT + (outputTokens / 1_000_000) * COST_PER_1M_OUTPUT
  );
}
