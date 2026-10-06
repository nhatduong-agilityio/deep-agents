import { mkdirSync, writeFileSync } from 'node:fs';
import { runBaselineRun } from './baseline.js';
import { runTreatmentRun } from './treatment.js';
import type { RunResult } from './baseline.js';

const RUNS_PER_CONDITION = 10;
const RESULTS_DIR = 'results/planning-first';
// Free-tier limit: 15 RPM. Each run ~7-9 model calls → wait 65s between runs to clear the window
const INTER_RUN_DELAY_MS = 65_000;

function avg(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;
}

function writeTodosFirstRate(results: RunResult[]): string {
  const count = results.filter((r) => r.firstTool === 'write_todos').length;
  return `${count}/${results.length}`;
}

// PTR overhead: average extra tokens in runs where write_todos was called first vs. not
function ptrOverhead(results: RunResult[]): { withPlan: number; withoutPlan: number } {
  const with_ = results.filter((r) => r.firstTool === 'write_todos');
  const without = results.filter((r) => r.firstTool !== 'write_todos');
  return {
    withPlan: Math.round(avg(with_.map((r) => r.inputTokens + r.outputTokens))),
    withoutPlan: Math.round(avg(without.map((r) => r.inputTokens + r.outputTokens))),
  };
}

function printRow(r: RunResult): void {
  const flag = r.firstTool === 'write_todos' ? '✓' : ' ';
  process.stdout.write(
    `  [${flag}] run ${String(r.run).padStart(2)} | first=${String(r.firstTool ?? 'none').padEnd(12)} | ` +
      `in=${String(r.inputTokens).padStart(6)} out=${String(r.outputTokens).padStart(5)} | ` +
      `calls=${r.modelCallCount} | ${r.elapsedMs}ms\n`,
  );
}

process.stdout.write('T-DA-02 — Planning-First experiment\n');
process.stdout.write(
  `Model: gpt-5.4-mini-2026-03-17 | ${RUNS_PER_CONDITION} runs per condition\n\n`,
);

async function pause(): Promise<void> {
  process.stdout.write(
    `  [rate-limit] waiting ${INTER_RUN_DELAY_MS / 1000}s to clear 15 RPM window...\n`,
  );
  await new Promise((resolve) => setTimeout(resolve, INTER_RUN_DELAY_MS));
}

// Baseline: no planning instruction
process.stdout.write('=== BASELINE (no planning instruction) ===\n');
const baselineResults: RunResult[] = [];
for (let i = 1; i <= RUNS_PER_CONDITION; i++) {
  if (i > 1) await pause();
  process.stdout.write(`  running baseline ${i}/${RUNS_PER_CONDITION}...\n`);
  const r = await runBaselineRun(i);
  baselineResults.push(r);
  printRow(r);
}

// Treatment: explicit write_todos-first instruction
process.stdout.write('\n=== TREATMENT (write_todos-first instruction) ===\n');
const treatmentResults: RunResult[] = [];
for (let i = 1; i <= RUNS_PER_CONDITION; i++) {
  await pause(); // pause before every treatment run — previous condition's last run still in window
  process.stdout.write(`  running treatment ${i}/${RUNS_PER_CONDITION}...\n`);
  const r = await runTreatmentRun(i);
  treatmentResults.push(r);
  printRow(r);
}

// Summary
const baselineRate = writeTodosFirstRate(baselineResults);
const treatmentRate = writeTodosFirstRate(treatmentResults);
const baselineOverhead = ptrOverhead(baselineResults);
const treatmentOverhead = ptrOverhead(treatmentResults);

process.stdout.write('\n=== SUMMARY ===\n');
process.stdout.write(
  `  write_todos first-call rate — baseline: ${baselineRate}  treatment: ${treatmentRate}\n`,
);
process.stdout.write(`  avg total tokens (with plan):    ${treatmentOverhead.withPlan}\n`);
process.stdout.write(`  avg total tokens (without plan): ${baselineOverhead.withoutPlan}\n`);
process.stdout.write(
  `  PTR token overhead: ${treatmentOverhead.withPlan - baselineOverhead.withoutPlan > 0 ? '+' : ''}` +
    `${treatmentOverhead.withPlan - baselineOverhead.withoutPlan} tokens vs no-plan runs\n`,
);

// Persist
mkdirSync(RESULTS_DIR, { recursive: true });
const output = {
  meta: {
    date: new Date().toISOString(),
    model: 'gpt-5.4-mini-2026-03-17',
    deepagents_version: '1.14.1',
    runs_per_condition: RUNS_PER_CONDITION,
  },
  baseline: baselineResults,
  treatment: treatmentResults,
  summary: {
    baseline_write_todos_first_call_rate: baselineRate,
    treatment_write_todos_first_call_rate: treatmentRate,
    ptr_overhead: {
      avg_tokens_with_plan: treatmentOverhead.withPlan,
      avg_tokens_without_plan: baselineOverhead.withoutPlan,
      delta: treatmentOverhead.withPlan - baselineOverhead.withoutPlan,
    },
  },
};

writeFileSync(`${RESULTS_DIR}/results.json`, JSON.stringify(output, null, 2));
process.stdout.write(`\nResults saved to ${RESULTS_DIR}/results.json\n`);
process.stdout.write('Check LangSmith for traces: https://smith.langchain.com\n');
