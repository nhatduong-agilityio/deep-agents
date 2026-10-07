export type HarnessV2StepId =
  'baseline' | 'self-verification' | 'pre-completion' | 'loop-detection' | 'context-pruning';

export const STEP_ORDER: HarnessV2StepId[] = [
  'baseline',
  'self-verification',
  'pre-completion',
  'loop-detection',
  'context-pruning',
];

export const MODEL_ID = 'gpt-5.4-mini-2026-03-17';
export const COST_PER_1M_INPUT = 0.75;
export const COST_PER_1M_OUTPUT = 4.5;
export const RUNS_PER_STEP = 3;
// Public test cases shown to the agent via run_tests; hidden cases scored after
export const PUBLIC_TEST_COUNT = 3;
export const MAX_TOOL_CALLS = 8;
export const CONTEXT_PRUNE_KEEP_LAST_N = 3;
export const INTER_CALL_DELAY_MS = 3000;
export const RUN_TESTS_TIMEOUT_MS = 5000;

export interface ProblemRunV2 {
  problemId: string;
  publicPassed: number;
  publicTotal: number;
  hiddenPassed: number;
  hiddenTotal: number;
  modelCalls: number;
  toolCallCount: number;
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
  loopDetected: boolean;
  errors: string[];
}

export interface StepRunV2 {
  run: number;
  problems: ProblemRunV2[];
  publicPassRate: number;
  hiddenPassRate: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalModelCalls: number;
  totalToolCalls: number;
  costUsd: number;
  elapsedMs: number;
}

export interface StepSummaryV2 {
  stepId: HarnessV2StepId;
  runs: StepRunV2[];
  avgPublicPassRate: number;
  avgHiddenPassRate: number;
  avgCostUsd: number;
  avgModelCallsPerProblem: number;
  avgToolCallsPerProblem: number;
  avgInputTokensPerProblem: number;
}
