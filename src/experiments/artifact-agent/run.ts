import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkReport } from '../../scripts/check-report.js';
import { DEFAULT_MODEL_CONFIG, runArtifactRun, type RunResult } from './agent.js';

const RUNS = 3;
// 5 s is sufficient for OpenAI Tier 1 (500 RPM); update if switching back to Gemini free tier
const INTER_RUN_DELAY_MS = 5_000;
const RESULTS_DIR = join(process.cwd(), 'results', 'artifact-agent');

async function pause(): Promise<void> {
  process.stdout.write(`  [rate-limit] waiting ${INTER_RUN_DELAY_MS / 1000}s between runs...\n`);
  await new Promise((resolve) => setTimeout(resolve, INTER_RUN_DELAY_MS));
}

async function main(): Promise<void> {
  mkdirSync(RESULTS_DIR, { recursive: true });

  process.stdout.write(`Artifact Agent — T-DA-03\n`);
  process.stdout.write(`Model: ${DEFAULT_MODEL_CONFIG.modelId} | ${RUNS} runs\n\n`);

  const results: RunResult[] = [];

  for (let i = 1; i <= RUNS; i++) {
    if (i > 1) await pause();

    process.stdout.write(`  running run ${i}/${RUNS}...\n`);

    const result = await runArtifactRun(i, (workDir) => {
      process.stdout.write(`  checking report for run ${i}...\n`);
      return checkReport(workDir);
    });

    const status = result.checkerPassed ? '[✓]' : '[✗]';
    const lsStatus = result.langsmithVerified ? 'ls=✓' : 'ls=✗';
    const sysStatus = `consist=${result.mainAgentConsistency}`;
    const retryNote =
      result.retryCount > 0
        ? ` retries=${result.retryCount} retryWait=${result.retryWaitMs}ms work=${result.workMs}ms`
        : '';
    process.stdout.write(
      `  ${status} run ${String(i).padStart(2)} | findings=${result.findingCount} | ${lsStatus} ${sysStatus} | ` +
        `in=${result.inputTokens} peak=${result.peakInputTokens} out=${result.outputTokens} | ` +
        `sys=${result.systemInputTokens}in/${result.systemOutputTokens}out | ` +
        `calls=${result.modelCallCount} | ${result.elapsedMs}ms${retryNote}\n`,
    );
    process.stdout.write(`       runId: ${result.langsmithRunId}\n`);

    results.push(result);
  }

  const passedRuns = results.filter((r) => r.checkerPassed).length;
  const verifiedRuns = results.filter((r) => r.langsmithVerified).length;
  const avgTokens = Math.round(
    results.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0) / results.length,
  );
  const avgPeak = Math.round(results.reduce((s, r) => s + r.peakInputTokens, 0) / results.length);
  const avgCalls = Math.round(results.reduce((s, r) => s + r.modelCallCount, 0) / results.length);
  const totalCost = results.reduce((s, r) => s + r.estimatedCostUsd, 0);
  const avgSystemInput = Math.round(
    results.reduce((s, r) => s + r.systemInputTokens, 0) / results.length,
  );
  const avgSystemOutput = Math.round(
    results.reduce((s, r) => s + r.systemOutputTokens, 0) / results.length,
  );

  process.stdout.write(`\n=== SUMMARY ===\n`);
  process.stdout.write(`  checker pass rate:            ${passedRuns}/${RUNS}\n`);
  process.stdout.write(`  langsmith verified:           ${verifiedRuns}/${RUNS}\n`);
  process.stdout.write(`  avg total tokens/run:         ${avgTokens}\n`);
  process.stdout.write(`  avg peak input tokens/run:    ${avgPeak}\n`);
  process.stdout.write(`  avg model calls/run:          ${avgCalls}\n`);
  process.stdout.write(`  avg system input tokens/run:  ${avgSystemInput}\n`);
  process.stdout.write(`  avg system output tokens/run: ${avgSystemOutput}\n`);
  process.stdout.write(`  total estimated cost:         $${totalCost.toFixed(4)}\n`);

  const output = {
    experiment: 'artifact-agent',
    model: DEFAULT_MODEL_CONFIG.modelId,
    deepagents_version: '1.14.1',
    date: new Date().toISOString().slice(0, 10),
    runs: results,
    summary: {
      checker_pass_rate: `${passedRuns}/${RUNS}`,
      langsmith_verified: `${verifiedRuns}/${RUNS}`,
      avg_total_tokens: avgTokens,
      avg_peak_input_tokens: avgPeak,
      avg_model_calls: avgCalls,
      avg_system_input_tokens: avgSystemInput,
      avg_system_output_tokens: avgSystemOutput,
      total_cost_usd: parseFloat(totalCost.toFixed(6)),
    },
  };

  const outPath = join(RESULTS_DIR, 'results.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  process.stdout.write(`\nResults saved to ${outPath}\n`);
  process.stdout.write(`Check LangSmith for traces: https://smith.langchain.com\n`);

  // Throw AFTER saving so results.json always reflects what was measured
  const mismatchRuns = results.filter((r) => r.mainAgentConsistency === 'mismatch');
  if (mismatchRuns.length > 0) {
    for (const r of mismatchRuns) {
      process.stderr.write(
        `Consistency MISMATCH run ${r.run}: LangSmith span tokens differ from AIMessage.usage_metadata.\n` +
          `  Check for unexpected sub-agent calls or a counting divergence.\n`,
      );
    }
    throw new Error(`Consistency mismatch on ${mismatchRuns.length} run(s). See stderr above.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    process.stderr.write(`Fatal: ${String(err)}\n`);
    process.exit(1);
  });
