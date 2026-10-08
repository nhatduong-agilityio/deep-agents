import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROBLEMS } from '../../benchmark/subset/problems.js';
import { estimateCost, solveWithAgent } from './agent.js';
import {
  INTER_CALL_DELAY_MS,
  RUNS_PER_STEP,
  STEP_ORDER,
  type HarnessV2StepId,
  type ProblemRunV2,
  type StepRunV2,
  type StepSummaryV2,
} from './config.js';

const RESULTS_DIR = join(process.cwd(), 'results', 'harness-v2');
const RESULTS_PATH = join(RESULTS_DIR, 'results.json');

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

async function pause(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

function computePassRate(
  problems: ProblemRunV2[],
  field: 'publicPassed' | 'hiddenPassed',
  total: 'publicTotal' | 'hiddenTotal',
): number {
  const passed = problems.reduce((s, p) => s + p[field], 0);
  const totalCases = problems.reduce((s, p) => s + p[total], 0);
  return totalCases > 0 ? passed / totalCases : 0;
}

async function runStep(stepId: HarnessV2StepId, runNumber: number): Promise<StepRunV2> {
  const problems: ProblemRunV2[] = [];

  for (let i = 0; i < PROBLEMS.length; i++) {
    const problem = PROBLEMS[i]!;
    process.stdout.write(
      `  [${stepId}] run ${runNumber} problem ${i + 1}/${PROBLEMS.length} (${problem.id})...\n`,
    );

    const result = await solveWithAgent(problem, stepId);

    problems.push({
      problemId: problem.id,
      publicPassed: result.publicPassed,
      publicTotal: result.publicTotal,
      hiddenPassed: result.hiddenPassed,
      hiddenTotal: result.hiddenTotal,
      modelCalls: result.modelCalls,
      toolCallCount: result.toolCallCount,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      elapsedMs: result.elapsedMs,
      loopDetected: result.loopDetected,
      errors: result.errors,
    });

    if (i < PROBLEMS.length - 1) {
      await pause(INTER_CALL_DELAY_MS);
    }
  }

  const totalInputTokens = problems.reduce((s, p) => s + p.inputTokens, 0);
  const totalOutputTokens = problems.reduce((s, p) => s + p.outputTokens, 0);
  const totalModelCalls = problems.reduce((s, p) => s + p.modelCalls, 0);
  const totalToolCalls = problems.reduce((s, p) => s + p.toolCallCount, 0);
  const elapsedMs = problems.reduce((s, p) => s + p.elapsedMs, 0);

  return {
    run: runNumber,
    problems,
    publicPassRate: computePassRate(problems, 'publicPassed', 'publicTotal'),
    hiddenPassRate: computePassRate(problems, 'hiddenPassed', 'hiddenTotal'),
    totalInputTokens,
    totalOutputTokens,
    totalModelCalls,
    totalToolCalls,
    costUsd: estimateCost(totalInputTokens, totalOutputTokens),
    elapsedMs,
  };
}

function summarizeStep(stepId: HarnessV2StepId, runs: StepRunV2[]): StepSummaryV2 {
  const n = PROBLEMS.length;
  return {
    stepId,
    runs,
    avgPublicPassRate: mean(runs.map((r) => r.publicPassRate)),
    avgHiddenPassRate: mean(runs.map((r) => r.hiddenPassRate)),
    avgCostUsd: mean(runs.map((r) => r.costUsd)),
    avgModelCallsPerProblem: mean(runs.map((r) => r.totalModelCalls / n)),
    avgToolCallsPerProblem: mean(runs.map((r) => r.totalToolCalls / n)),
    avgInputTokensPerProblem: mean(runs.map((r) => r.totalInputTokens / n)),
  };
}

function saveResults(summaries: StepSummaryV2[]): void {
  const output = {
    experiment: 'harness-v2',
    model: `openai:gpt-5.4-mini-2026-03-17`,
    deepagents_version: '1.14.1',
    date: new Date().toISOString().slice(0, 10),
    problems_count: PROBLEMS.length,
    runs_per_step: RUNS_PER_STEP,
    summaries,
  };
  writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 2));
}

async function main(): Promise<void> {
  mkdirSync(RESULTS_DIR, { recursive: true });

  // Load partial results to support resuming
  const partial: { summaries?: StepSummaryV2[] } = existsSync(RESULTS_PATH)
    ? (JSON.parse(readFileSync(RESULTS_PATH, 'utf-8')) as { summaries?: StepSummaryV2[] })
    : {};
  const doneStepIds = new Set((partial.summaries ?? []).map((s) => s.stepId));
  const summaries: StepSummaryV2[] = partial.summaries ?? [];

  process.stdout.write(`Harness V2 — T-DA-06 v2\n`);
  process.stdout.write(
    `Model: gpt-5.4-mini-2026-03-17 | ${PROBLEMS.length} problems × ${RUNS_PER_STEP} runs × 5 steps\n\n`,
  );

  for (const stepId of STEP_ORDER) {
    if (doneStepIds.has(stepId)) {
      process.stdout.write(`[skip] ${stepId} already complete\n`);
      continue;
    }

    process.stdout.write(`\n=== Step: ${stepId} ===\n`);
    const runs: StepRunV2[] = [];

    for (let run = 1; run <= RUNS_PER_STEP; run++) {
      process.stdout.write(`\n-- Run ${run}/${RUNS_PER_STEP} --\n`);
      const stepRun = await runStep(stepId, run);
      runs.push(stepRun);

      const pub = (stepRun.publicPassRate * 100).toFixed(1);
      const hid = (stepRun.hiddenPassRate * 100).toFixed(1);
      process.stdout.write(
        `  Run ${run} done: pub=${pub}% hid=${hid}% cost=$${stepRun.costUsd.toFixed(4)} calls=${stepRun.totalModelCalls} tools=${stepRun.totalToolCalls}\n`,
      );

      if (run < RUNS_PER_STEP) {
        await pause(INTER_CALL_DELAY_MS * 2);
      }
    }

    const summary = summarizeStep(stepId, runs);
    summaries.push(summary);
    saveResults(summaries);

    process.stdout.write(
      `=== ${stepId} summary: pub=${(summary.avgPublicPassRate * 100).toFixed(1)}% hid=${(summary.avgHiddenPassRate * 100).toFixed(1)}% cost=$${summary.avgCostUsd.toFixed(4)}/run avg_calls=${summary.avgModelCallsPerProblem.toFixed(2)} avg_tools=${summary.avgToolCallsPerProblem.toFixed(2)} ===\n`,
    );
  }

  process.stdout.write('\n=== FINAL SUMMARY ===\n');
  process.stdout.write(
    `${'Step'.padEnd(20)}${'PubPass%'.padStart(10)}${'HidPass%'.padStart(10)}${'Cost/run'.padStart(10)}${'Calls/prob'.padStart(12)}${'Tools/prob'.padStart(12)}\n`,
  );
  process.stdout.write(`${'-'.repeat(74)}\n`);
  for (const s of summaries) {
    process.stdout.write(
      `${s.stepId.padEnd(20)}` +
        `${(s.avgPublicPassRate * 100).toFixed(1).padStart(10)}` +
        `${(s.avgHiddenPassRate * 100).toFixed(1).padStart(10)}` +
        `$${s.avgCostUsd.toFixed(4).padStart(9)}` +
        `${s.avgModelCallsPerProblem.toFixed(2).padStart(12)}` +
        `${s.avgToolCallsPerProblem.toFixed(2).padStart(12)}\n`,
    );
  }

  process.stdout.write(`\nResults saved to ${RESULTS_PATH}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    process.stderr.write(`Fatal: ${String(err)}\n`);
    process.exit(1);
  });
