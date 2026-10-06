// T-DA-04 Context Isolation Proof — interleaved A/B measurement.
// Supports incremental runs: if results.json already exists, resumes from the next pair.
// Set CONTEXT_ISO_RUNS=N (default 3) to limit total pairs in one invocation.
//
// Diagnostic: before the first B run, dumps the main-agent tool list to verify
// no duplicate tool names from createFilesystemMiddleware stacking.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDeepAgent, FilesystemBackend } from 'deepagents';
import { makeFilesystemMiddleware } from '../../lib/fs-middleware.js';
import { SUBAGENTS } from '../../lib/subagents.js';
import { DEFAULT_MODEL_CONFIG, type ModelConfig, type RunResult } from '../artifact-agent/agent.js';
import { runConfigARun } from './config-a.js';
import { runConfigBRun } from './config-b.js';

// OpenAI Tier 1: 500 RPM / 200K TPM — short delays are safe.
// Config B uses ~12 RPM (main + 2 workers × ~4 calls each).
const AFTER_A_DELAY_MS = 5_000; // 5 s
const AFTER_B_DELAY_MS = 10_000; // 10 s

// Single source-of-truth model config passed to both runConfigARun and runConfigBRun.
// gpt-5.4-mini-2026-03-17 is the pinned snapshot (alias gpt-5.4-mini resolves to this).
// NOTE: costPer1MInput/Output are unverified for this model — update from OpenAI billing.
export const MEASUREMENT_MODEL: ModelConfig = DEFAULT_MODEL_CONFIG;

const RESULTS_DIR = join(process.cwd(), 'results', 'context-isolation');
const RESULTS_PATH = join(RESULTS_DIR, process.env['CONTEXT_ISO_FILE'] ?? 'results.json');
const TOTAL_PAIRS = parseInt(process.env['CONTEXT_ISO_RUNS'] ?? '3', 10);

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

async function pause(ms: number, label: string): Promise<void> {
  process.stdout.write(`  [rate-limit] waiting ${ms / 1000}s (${label})...\n`);
  await new Promise((r) => setTimeout(r, ms));
}

// Tool-list diagnostic: verify no duplicate tool names after createFilesystemMiddleware stacking.
async function verifyNoDuplicateTools(model: string): Promise<void> {
  const tmpDir = join(process.cwd(), 'tmp', 'context-isolation', 'diag');
  mkdirSync(tmpDir, { recursive: true });

  let toolNames: string[] = [];
  const captureMw = {
    name: 'toolCapture',
    wrapModelCall: async (req: Record<string, unknown>) => {
      const tools = req['tools'] as Array<{ name?: string }> | undefined;
      toolNames = (tools ?? []).map((t) => t.name ?? '<unnamed>');
      throw new Error('diag-abort');
    },
  };

  const diagBackend = (): FilesystemBackend =>
    new FilesystemBackend({ rootDir: tmpDir, virtualMode: true });
  const diagAgent = createDeepAgent({
    model,
    middleware: [
      makeFilesystemMiddleware(diagBackend, [
        { operations: ['read'], paths: ['/corpus/**'], mode: 'deny' },
      ]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      captureMw as any,
    ],
    backend: diagBackend,
    subagents: SUBAGENTS,
  });

  try {
    await diagAgent.invoke({ messages: [{ role: 'user', content: 'ping' }] });
  } catch {
    // expected abort from captureMw
  }

  const counts = new Map<string, number>();
  for (const n of toolNames) counts.set(n, (counts.get(n) ?? 0) + 1);
  const dupes = [...counts.entries()].filter(([, c]) => c > 1);

  if (dupes.length > 0) {
    process.stderr.write(
      `[WARN] Duplicate tool names: ${dupes.map(([n, c]) => `${n}×${c}`).join(', ')}\n`,
    );
  } else {
    process.stdout.write(`[diag] No duplicate tool names (${toolNames.length} tools). Stack OK.\n`);
  }
  process.stdout.write(`[diag] Tool list: [${toolNames.join(', ')}]\n`);
}

function printRunLine(label: string, r: RunResult): void {
  const checker = r.checkerPassed ? '[✓]' : '[✗]';
  const compCheck = r.completenessCheck === 'pass' ? 'cmp=✓' : 'cmp=FAIL';
  const consistNote =
    r.mainAgentConsistency === 'pass'
      ? 'consist=✓'
      : r.mainAgentConsistency === 'incomplete'
        ? 'consist=inc'
        : 'consist=MISMATCH';
  const incNote = r.measurementIncomplete ? ' [INCOMPLETE]' : '';
  const workerInfo =
    r.workerReturnTokens && r.workerReturnTokens.length > 0
      ? ` workers=[${r.workerReturnTokens.join(',')}]tok` +
        (r.workerReturnWordCounts?.some((w) => w > 150)
          ? ` ⚠ >150 words`
          : ` words=[${r.workerReturnWordCounts?.join(',')}]`)
      : '';
  process.stdout.write(
    `  ${checker} ${label} run ${String(r.run).padStart(2)} | ` +
      `mainPeak=${r.mainAgentPeakInputTokens} sys=${r.systemInputTokens} | ` +
      `${consistNote} ${compCheck}${incNote} | ` +
      `calls=${r.modelCallCount} work=${r.workMs}ms retry=${r.retryWaitMs}ms${workerInfo}\n`,
  );
  process.stdout.write(`       runId: ${r.langsmithRunId}\n`);
}

function savePartial(aResults: RunResult[], bResults: RunResult[]): void {
  const out = {
    experiment: 'context-isolation',
    model: MEASUREMENT_MODEL.modelId,
    deepagents_version: '1.14.1',
    date: new Date().toISOString().slice(0, 10),
    configA: aResults,
    configB: bResults,
  };
  writeFileSync(RESULTS_PATH, JSON.stringify(out, null, 2));
}

async function main(): Promise<void> {
  mkdirSync(RESULTS_DIR, { recursive: true });

  // Load partial results if resuming
  let aResults: RunResult[] = [];
  let bResults: RunResult[] = [];
  let startPair = 1;
  if (existsSync(RESULTS_PATH)) {
    const partial = JSON.parse(readFileSync(RESULTS_PATH, 'utf-8')) as {
      configA?: RunResult[];
      configB?: RunResult[];
    };
    aResults = partial.configA ?? [];
    bResults = partial.configB ?? [];
    const donePairs = Math.min(aResults.length, bResults.length);
    // Trim to donePairs to discard any orphaned partial-pair results from a mid-pair crash.
    // Without this, re-running pair N would push a duplicate A-run onto the loaded array.
    aResults = aResults.slice(0, donePairs);
    bResults = bResults.slice(0, donePairs);
    if (donePairs > 0) {
      startPair = donePairs + 1;
      process.stdout.write(
        `Resuming from pair ${startPair} (${donePairs} pair(s) loaded from ${RESULTS_PATH})\n\n`,
      );
    }
  }

  process.stdout.write(`Context Isolation Proof — T-DA-04\n`);
  process.stdout.write(
    `Model: ${MEASUREMENT_MODEL.modelId} | pairs ${startPair}–${TOTAL_PAIRS} of ${TOTAL_PAIRS}\n\n`,
  );

  // Diagnostic on first pair of each session
  if (startPair === 1) {
    await verifyNoDuplicateTools(MEASUREMENT_MODEL.model);
    process.stdout.write('\n');
  }

  for (let i = startPair; i <= TOTAL_PAIRS; i++) {
    // ── Config A ─────────────────────────────────────────────────────────────
    process.stdout.write(`  running Config A run ${i}/${TOTAL_PAIRS}...\n`);
    const a = await runConfigARun(i, MEASUREMENT_MODEL);
    aResults.push(a);
    printRunLine('A', a);
    savePartial(aResults, bResults);

    await pause(AFTER_A_DELAY_MS, 'post-A');

    // ── Config B ─────────────────────────────────────────────────────────────
    process.stdout.write(`  running Config B run ${i}/${TOTAL_PAIRS}...\n`);
    const b = await runConfigBRun(i, MEASUREMENT_MODEL);
    bResults.push(b);
    printRunLine('B', b);
    savePartial(aResults, bResults);

    if (i < TOTAL_PAIRS) await pause(AFTER_B_DELAY_MS, 'post-B');
  }

  // Only print gates and system checks when all pairs are collected
  if (aResults.length < TOTAL_PAIRS || bResults.length < TOTAL_PAIRS) {
    process.stdout.write(
      `\nPartial run complete (${aResults.length} A, ${bResults.length} B). ` +
        `Run again to continue (results saved to ${RESULTS_PATH}).\n`,
    );
    return;
  }

  // ── Gate computation (exclude incomplete runs) ────────────────────────────
  const gateWarnings: string[] = [];

  const completeA = aResults.filter((r) => !r.measurementIncomplete);
  const completeB = bResults.filter((r) => !r.measurementIncomplete);
  const incompleteCount = aResults.length + bResults.length - completeA.length - completeB.length;
  if (incompleteCount > 0) {
    const msg = `${incompleteCount} run(s) excluded from gate (measurementIncomplete)`;
    process.stderr.write(`  [warn] ${msg}\n`);
    gateWarnings.push(msg);
  }

  const aPeaks = completeA.map((r) => r.mainAgentPeakInputTokens);
  const bPeaks = completeB.map((r) => r.mainAgentPeakInputTokens);
  const canComputeGate = aPeaks.length > 0 && bPeaks.length > 0;
  if (canComputeGate && completeA.length !== completeB.length) {
    const msg = `asymmetric samples: ${completeA.length} A complete vs ${completeB.length} B complete — median comparison may be unreliable`;
    process.stderr.write(`  [warn] ${msg}\n`);
    gateWarnings.push(msg);
  }
  const medianA = canComputeGate ? median(aPeaks) : 0;
  const medianB = canComputeGate ? median(bPeaks) : 0;
  const ratioMedian = canComputeGate ? medianB / medianA : NaN;
  const ratioMeans = canComputeGate ? mean(bPeaks) / mean(aPeaks) : NaN;
  const gatePass = canComputeGate && ratioMedian <= 0.5;

  // ── Summary ───────────────────────────────────────────────────────────────
  process.stdout.write(`\n=== COMPARISON TABLE ===\n`);
  process.stdout.write(
    `${'Run'.padEnd(6)}${'Config'.padEnd(8)}${'mainPeak'.padStart(9)}${'systemIn'.padStart(10)}` +
      `${'work(ms)'.padStart(10)}${'retry(ms)'.padStart(10)}${'checker'.padStart(9)}` +
      `${'consist'.padStart(10)}${'cmpChk'.padStart(8)}\n`,
  );
  process.stdout.write(`${'-'.repeat(80)}\n`);
  for (const r of aResults) {
    const incFlag = r.measurementIncomplete ? '*inc' : '';
    process.stdout.write(
      `${String(r.run).padEnd(6)}${'A'.padEnd(8)}` +
        `${String(r.mainAgentPeakInputTokens).padStart(9)}` +
        `${String(r.systemInputTokens).padStart(10)}` +
        `${String(r.workMs).padStart(10)}${String(r.retryWaitMs).padStart(10)}` +
        `${(r.checkerPassed ? 'pass' : 'FAIL').padStart(9)}` +
        `${(r.mainAgentConsistency + incFlag).padStart(10)}${r.completenessCheck.padStart(8)}\n`,
    );
  }
  for (const r of bResults) {
    const workerInfo =
      r.workerReturnTokens && r.workerReturnTokens.length > 0
        ? `  workers: tokens=[${r.workerReturnTokens.join(',')}] words=[${r.workerReturnWordCounts?.join(',')}]${r.workerReturnWordCounts?.some((w) => w > 150) ? ' ⚠>150' : ''}`
        : '';
    const incFlag = r.measurementIncomplete ? '*inc' : '';
    process.stdout.write(
      `${String(r.run).padEnd(6)}${'B'.padEnd(8)}` +
        `${String(r.mainAgentPeakInputTokens).padStart(9)}` +
        `${String(r.systemInputTokens).padStart(10)}` +
        `${String(r.workMs).padStart(10)}${String(r.retryWaitMs).padStart(10)}` +
        `${(r.checkerPassed ? 'pass' : 'FAIL').padStart(9)}` +
        `${(r.mainAgentConsistency + incFlag).padStart(10)}${r.completenessCheck.padStart(8)}${workerInfo}\n`,
    );
  }

  process.stdout.write(`\n=== GATE RESULT ===\n`);
  if (!canComputeGate) {
    process.stdout.write(
      `  Cannot compute gate: no complete runs (${incompleteCount} incomplete)\n`,
    );
  } else {
    process.stdout.write(
      `  A mainAgentPeak per run (complete): [${aPeaks.join(', ')}]  median=${medianA}\n`,
    );
    process.stdout.write(
      `  B mainAgentPeak per run (complete): [${bPeaks.join(', ')}]  median=${medianB}\n`,
    );
    process.stdout.write(`  ratio (median B / median A): ${ratioMedian.toFixed(4)}\n`);
    process.stdout.write(`  ratio (mean B / mean A):     ${ratioMeans.toFixed(4)}\n`);
    process.stdout.write(
      `  gate (≤0.50): ${gatePass ? 'PASS ✓' : 'FAIL ✗ (isolation not achieved)'}\n`,
    );
    if (incompleteCount > 0) {
      process.stdout.write(
        `  note: ${incompleteCount} run(s) excluded (measurementIncomplete — LangSmith lag timeout)\n`,
      );
    }
  }

  const aCheckPassed = aResults.every((r) => r.completenessCheck === 'pass');
  const bCheckPassed = bResults.every((r) => r.completenessCheck === 'pass');
  process.stdout.write(`\n=== SYSTEM CHECKS ===\n`);
  process.stdout.write(
    `  Config A consistency: ${aResults.map((r) => r.mainAgentConsistency).join(', ')}\n`,
  );
  process.stdout.write(
    `  Config A completenessCheck: ${aResults.map((r) => r.completenessCheck).join(', ')} — ${aCheckPassed ? 'all pass' : 'SOME FAIL'}\n`,
  );
  process.stdout.write(
    `  Config B consistency: ${bResults.map((r) => r.mainAgentConsistency).join(', ')}\n`,
  );
  process.stdout.write(
    `  Config B completenessCheck: ${bResults.map((r) => r.completenessCheck).join(', ')} — ${bCheckPassed ? 'all pass' : 'SOME FAIL'}\n`,
  );

  const aCheckerPassed = aResults.every((r) => r.checkerPassed);
  const bCheckerPassed = bResults.every((r) => r.checkerPassed);
  process.stdout.write(`\n=== QUALITY (checker) ===\n`);
  process.stdout.write(
    `  Config A checker: ${aResults.filter((r) => r.checkerPassed).length}/${aResults.length} pass${aCheckerPassed ? '' : ' ← QUALITY GATE FAIL'}\n`,
  );
  process.stdout.write(
    `  Config B checker: ${bResults.filter((r) => r.checkerPassed).length}/${bResults.length} pass${bCheckerPassed ? '' : ' ← QUALITY GATE FAIL'}\n`,
  );

  // Save final results with gate
  const finalOutput = {
    experiment: 'context-isolation',
    model: MEASUREMENT_MODEL.modelId,
    deepagents_version: '1.14.1',
    date: new Date().toISOString().slice(0, 10),
    gate: canComputeGate
      ? {
          medianA,
          medianB,
          ratioMedian,
          ratioMeans,
          passed: gatePass,
          incompleteExcluded: incompleteCount,
        }
      : { passed: false, reason: 'all runs incomplete' },
    warnings: gateWarnings,
    configA: aResults,
    configB: bResults,
  };
  writeFileSync(RESULTS_PATH, JSON.stringify(finalOutput, null, 2));
  process.stdout.write(`\nResults saved to ${RESULTS_PATH}\n`);

  // Throw AFTER saving
  const mismatchA = aResults.filter((r) => r.mainAgentConsistency === 'mismatch');
  if (mismatchA.length > 0) {
    for (const r of mismatchA) {
      process.stderr.write(
        `CONFIG-A consistency MISMATCH run ${r.run}: ` +
          `LangSmith span tokens differ from message tokens\n`,
      );
    }
    throw new Error(`Config A consistency mismatch on ${mismatchA.length} run(s).`);
  }

  if (!canComputeGate) {
    throw new Error('Isolation gate could not be computed: all runs are measurement-incomplete.');
  }

  if (!gatePass) {
    throw new Error(`Isolation gate FAIL: median ratio ${ratioMedian.toFixed(4)} > 0.50.`);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
