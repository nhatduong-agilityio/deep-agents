import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ChatOpenAI } from '@langchain/openai';
import { langsmith } from '../../index.js';
import { withBackoff } from '../../lib/backoff.js';
import { checkSolution } from '../../../benchmark/subset/checker.js';
import { PROBLEMS } from '../../../benchmark/subset/problems.js';
import {
  COST_PER_1M_INPUT,
  COST_PER_1M_OUTPUT,
  INTER_CALL_DELAY_MS,
  MODEL_ID,
  RUNS_PER_STEP,
  type HarnessStepId,
  type ProblemRun,
  type StepRun,
  type StepSummary,
} from './harness-config.js';
import { solveProblem } from './solver.js';

const RESULTS_DIR = join(process.cwd(), 'results', 'harness');
const STEP_ORDER: HarnessStepId[] = ['baseline', 'think', 'context-pruning', 'checklist', 'rewoo'];

function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, INTER_CALL_DELAY_MS));
}

function computeCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * COST_PER_1M_INPUT + (outputTokens / 1_000_000) * COST_PER_1M_OUTPUT
  );
}

async function runStep(
  stepId: HarnessStepId,
  model: ChatOpenAI,
  runIndex: number,
): Promise<StepRun> {
  const problems: ProblemRun[] = [];
  const runStart = Date.now();

  for (let pi = 0; pi < PROBLEMS.length; pi++) {
    const problem = PROBLEMS[pi]!;
    process.stdout.write(
      `    [${stepId}] run ${runIndex + 1} problem ${pi + 1}/${PROBLEMS.length} (${problem.id})...`,
    );
    const start = Date.now();

    const solve = await withBackoff(() => solveProblem(model, problem, stepId), {
      retryStats: { retryCount: 0, totalWaitMs: 0 },
    });

    let checkResult = {
      passed: 0,
      total: problem.testCases.length,
      passRate: 0,
      errors: ['no code extracted'],
    };
    if (solve.code) {
      checkResult = checkSolution(solve.code, problem);
    }

    const elapsed = Date.now() - start;
    process.stdout.write(` ${checkResult.passed}/${checkResult.total} ${elapsed}ms\n`);

    problems.push({
      problemId: problem.id,
      passed: checkResult.passed,
      total: checkResult.total,
      inputTokens: solve.inputTokens,
      outputTokens: solve.outputTokens,
      modelCalls: solve.modelCalls,
      elapsedMs: elapsed,
      errors: checkResult.errors.slice(0, 3),
    });

    if (pi < PROBLEMS.length - 1) await pause();
  }

  const totalPassed = problems.reduce((s, p) => s + p.passed, 0);
  const totalTests = problems.reduce((s, p) => s + p.total, 0);
  const totalInputTokens = problems.reduce((s, p) => s + p.inputTokens, 0);
  const totalOutputTokens = problems.reduce((s, p) => s + p.outputTokens, 0);
  const totalModelCalls = problems.reduce((s, p) => s + p.modelCalls, 0);

  return {
    run: runIndex + 1,
    problems,
    passRate: totalPassed / totalTests,
    totalInputTokens,
    totalOutputTokens,
    totalModelCalls,
    costUsd: computeCost(totalInputTokens, totalOutputTokens),
    elapsedMs: Date.now() - runStart,
  };
}

async function main(): Promise<void> {
  process.stdout.write(`Harness Optimization Drills — T-DA-06\n`);
  process.stdout.write(
    `Model: ${MODEL_ID} | ${PROBLEMS.length} problems | ${RUNS_PER_STEP} runs/step\n\n`,
  );

  const model = new ChatOpenAI({
    model: MODEL_ID,
    temperature: 0.7,
    apiKey: process.env['OPENAI_API_KEY'],
  });

  const stepSummaries: StepSummary[] = [];

  for (const stepId of STEP_ORDER) {
    process.stdout.write(`=== Step: ${stepId} ===\n`);
    const runs: StepRun[] = [];

    for (let r = 0; r < RUNS_PER_STEP; r++) {
      process.stdout.write(`  Run ${r + 1}/${RUNS_PER_STEP}:\n`);
      const run = await runStep(stepId, model, r);
      runs.push(run);
      process.stdout.write(
        `  → passRate=${(run.passRate * 100).toFixed(1)}% cost=$${run.costUsd.toFixed(4)} modelCalls=${run.totalModelCalls}\n`,
      );
      if (r < RUNS_PER_STEP - 1) await pause();
    }

    const avgPassRate = runs.reduce((s, r) => s + r.passRate, 0) / runs.length;
    const avgCostUsd = runs.reduce((s, r) => s + r.costUsd, 0) / runs.length;
    const avgModelCallsPerProblem =
      runs.reduce((s, r) => s + r.totalModelCalls, 0) / runs.length / PROBLEMS.length;
    const avgInputTokensPerProblem =
      runs.reduce((s, r) => s + r.totalInputTokens, 0) / runs.length / PROBLEMS.length;

    stepSummaries.push({
      stepId,
      runs,
      avgPassRate,
      avgCostUsd,
      avgModelCallsPerProblem,
      avgInputTokensPerProblem,
    });

    process.stdout.write(
      `  SUMMARY: avgPassRate=${(avgPassRate * 100).toFixed(1)}% avgCost=$${avgCostUsd.toFixed(4)}\n\n`,
    );
  }

  await langsmith.awaitPendingTraceBatches();

  // Print pass rate + cost/task table
  process.stdout.write('=== PASS RATE + COST/TASK TABLE ===\n');
  process.stdout.write(
    `${'Step'.padEnd(20)} ${'Avg Pass%'.padStart(10)} ${'Avg Cost/Run'.padStart(14)} ${'Avg Calls/Prob'.padStart(16)}\n`,
  );
  process.stdout.write('-'.repeat(62) + '\n');
  for (const s of stepSummaries) {
    process.stdout.write(
      `${s.stepId.padEnd(20)} ${(s.avgPassRate * 100).toFixed(1).padStart(9)}% ${('$' + s.avgCostUsd.toFixed(4)).padStart(14)} ${s.avgModelCallsPerProblem.toFixed(2).padStart(16)}\n`,
    );
  }

  const output = {
    experiment: 'harness-optimization',
    model: MODEL_ID,
    deepagents_version: '1.14.1',
    date: new Date().toISOString().slice(0, 10),
    problems_count: PROBLEMS.length,
    runs_per_step: RUNS_PER_STEP,
    steps: stepSummaries,
  };

  const outPath = join(RESULTS_DIR, 'results.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  process.stdout.write(`\nResults saved to ${outPath}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    process.stderr.write(`Fatal: ${String(err)}\n`);
    process.exit(1);
  });
