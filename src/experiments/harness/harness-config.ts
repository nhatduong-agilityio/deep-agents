import type { ChatOpenAI } from '@langchain/openai';

export type HarnessStepId = 'baseline' | 'think' | 'context-pruning' | 'checklist' | 'rewoo';

export interface HarnessConfig {
  stepId: HarnessStepId;
  model: ChatOpenAI;
  modelId: string;
  costPer1MInput: number;
  costPer1MOutput: number;
  runsPerStep: number;
  interCallDelayMs: number;
}

export interface ProblemRun {
  problemId: string;
  passed: number;
  total: number;
  inputTokens: number;
  outputTokens: number;
  modelCalls: number;
  elapsedMs: number;
  errors: string[];
}

export interface StepRun {
  run: number;
  problems: ProblemRun[];
  passRate: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalModelCalls: number;
  costUsd: number;
  elapsedMs: number;
}

export interface StepSummary {
  stepId: HarnessStepId;
  runs: StepRun[];
  avgPassRate: number;
  avgCostUsd: number;
  avgModelCallsPerProblem: number;
  avgInputTokensPerProblem: number;
}

export const MODEL_ID = 'gpt-5.4-mini-2026-03-17';
export const COST_PER_1M_INPUT = 0.75;
export const COST_PER_1M_OUTPUT = 4.5;
export const RUNS_PER_STEP = 3;
export const INTER_CALL_DELAY_MS = 3000;

// Context pruning: keep tool interactions from the last N model turns
export const CONTEXT_PRUNE_KEEP_LAST_N = 3;
