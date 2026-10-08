import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { createDeepAgent, FilesystemBackend } from 'deepagents';
import { langsmith } from '../../index.js';
import { withBackoff, type RetryStats } from '../../lib/backoff.js';
import { makeFilesystemMiddleware } from '../../lib/fs-middleware.js';
import type { ModelConfig } from '../artifact-agent/agent.js';
import { DEFAULT_MODEL_CONFIG } from '../artifact-agent/agent.js';
import { KNOWN_FLAWS } from '../critique/initial-draft.js';
import { judgeRound, type JudgeResult } from '../critique/precision-judge.js';
import { writeInitialDraft } from '../critique/producer.js';
import { makeCriticSpec } from '../critique/critic-spec.js';
import { makeHashGuardMiddleware } from '../critique/hash-guard.js';
import { makeRevisionGateMiddleware, type GateRecord } from '../critique/feedback-coverage.js';
import { countNumberedItems } from '../critique/feedback-coverage.js';
import { scoreDraft, type ScorerResult } from './scorer.js';

const WORKSPACE_ROOT = join(process.cwd(), 'tmp', 'trace-analysis');
const RESULTS_DIR = join(process.cwd(), 'results', 'trace-analysis');
const MAX_ROUNDS = 3;
const INTER_CALL_DELAY_MS = 5_000;

function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, INTER_CALL_DELAY_MS));
}

// Supervisor prompt — identical to T-DA-05 supervisor-run.ts
const SUPERVISOR_SYSTEM_PROMPT =
  'You are a document quality supervisor running a Producer-Critic revision loop.\n\n' +
  'The initial draft is at /drafts/draft-v1.md.\n\n' +
  'For each round (starting at round 1, up to round 3):\n' +
  '  1. Invoke the critic via the task tool:\n' +
  '       task({ subagent_type: "critic", description: "Critique /drafts/draft-vN.md. ' +
  'Write a numbered list of flaws to /feedback/round-R.md. ' +
  'Each item: (1) the problem, (2) location, (3) how to fix it." })\n' +
  '     (substitute N = current draft version, R = current round number)\n' +
  '  2. Read /feedback/round-R.md.\n' +
  '  3. If the feedback file is empty or has no numbered items, stop.\n' +
  '  4. Write /notes/revision-R.md listing "Item I: <change made>" for each item addressed.\n' +
  '  5. Write the revised draft to /drafts/draft-v(N+1).md addressing every feedback item.\n' +
  '  6. Increment round and draft version; repeat from step 1.\n\n' +
  'Stop when: feedback has no numbered items (convergence) OR the critic call returns a cap error.\n\n' +
  'Do not write to /feedback/ — only the critic can write there.\n' +
  'Use only tool calls; do not produce text responses.';

interface RoundStats {
  round: number;
  feedbackItems: number;
  revisionItems: number;
  scorerResult: ScorerResult;
  gateBlocked: boolean;
  judge: JudgeResult | null;
  supervisorInputTokens: number;
  supervisorOutputTokens: number;
}

function readVirtual(workDir: string, virtualPath: string): string {
  const p = join(workDir, virtualPath.replace(/^\//, ''));
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

function detectCapRefusal(messages: unknown[]): boolean {
  for (const m of messages) {
    if (!(m instanceof ToolMessage)) continue;
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    if (/round cap/i.test(content)) return true;
  }
  return false;
}

interface RunResult {
  langsmithRunId: string;
  criticRounds: number;
  capRefused: boolean;
  gateBlockCount: number;
  gateRecords: readonly GateRecord[];
  finalScorerResult: ScorerResult;
  rounds: RoundStats[];
  totalInputTokens: number;
  totalOutputTokens: number;
  elapsedMs: number;
  retryCount: number;
  costUsd: number;
}

async function runSupervisor(
  workDir: string,
  withGate: boolean,
  modelConfig: ModelConfig,
): Promise<RunResult> {
  mkdirSync(workDir, { recursive: true });
  writeInitialDraft(workDir);

  const criticSpec = makeCriticSpec(workDir, modelConfig);
  const hashGuard = makeHashGuardMiddleware(workDir, MAX_ROUNDS);
  const revisionGate = makeRevisionGateMiddleware(workDir);

  const backendFactory = (): FilesystemBackend =>
    new FilesystemBackend({ rootDir: workDir, virtualMode: true });

  const producerFsMw = makeFilesystemMiddleware(backendFactory, [
    { operations: ['write'], paths: ['/drafts/**'], mode: 'allow' },
    { operations: ['write'], paths: ['/notes/**'], mode: 'allow' },
    { operations: ['write'], paths: ['/feedback/**'], mode: 'deny' },
    { operations: ['write'], paths: ['/**'], mode: 'deny' },
  ]);

  const middleware = withGate
    ? [hashGuard.mw, revisionGate.mw, producerFsMw]
    : [hashGuard.mw, producerFsMw];

  const supervisor = createDeepAgent({
    model: modelConfig.model,
    subagents: [criticSpec],
    middleware,
    backend: backendFactory,
    systemPrompt: SUPERVISOR_SYSTEM_PROMPT,
  });

  const langsmithRunId = crypto.randomUUID();
  const runMetadata = {
    deepagents_version: '1.14.1',
    model_id: modelConfig.modelId,
    config: withGate ? 'trace-analysis-fix' : 'trace-analysis-baseline',
    task_id: 'T-DA-07',
    with_revision_gate: String(withGate),
  };
  const retryStats: RetryStats = { retryCount: 0, totalWaitMs: 0 };
  const start = Date.now();

  const result = await withBackoff(
    () =>
      supervisor.invoke(
        {
          messages: [
            {
              role: 'user',
              content: `Run the Producer-Critic loop on /drafts/draft-v1.md. Start with round 1. Improve the draft through critic feedback and revision.`,
            },
          ],
        },
        { metadata: runMetadata, runId: langsmithRunId },
      ),
    { retryStats },
  );

  const elapsedMs = Date.now() - start;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (const m of result.messages) {
    if (m instanceof AIMessage) {
      totalInputTokens += m.usage_metadata?.input_tokens ?? 0;
      totalOutputTokens += m.usage_metadata?.output_tokens ?? 0;
    }
  }

  await langsmith.awaitPendingTraceBatches();

  const criticRounds = hashGuard.getRoundCount();
  const capRefused = detectCapRefusal(result.messages);
  const gateRecords = revisionGate.getGateRecords();
  const gateBlockCount = revisionGate.getBlockCount();

  // Per-round stats
  const rounds: RoundStats[] = [];
  for (let r = 1; r <= criticRounds; r++) {
    const feedbackText = readVirtual(workDir, `/feedback/round-${r}.md`);
    const notesText = readVirtual(workDir, `/notes/revision-${r}.md`);
    const nextDraft = readVirtual(workDir, `/drafts/draft-v${r + 1}.md`);

    // Per-span supervisor token counts: AIMessages ordered; round r occupies
    // calls after the r-th task ToolMessage
    const aiMsgs = (result.messages as unknown[]).filter(
      (m): m is AIMessage => m instanceof AIMessage,
    );
    const callsForRound = aiMsgs.slice(r * 2 - 2, r * 2);
    const spanInput = callsForRound.reduce((s, m) => s + (m.usage_metadata?.input_tokens ?? 0), 0);
    const spanOutput = callsForRound.reduce(
      (s, m) => s + (m.usage_metadata?.output_tokens ?? 0),
      0,
    );

    let judge: JudgeResult | null = null;
    if (feedbackText.trim().length > 0) {
      const draftText = readVirtual(workDir, `/drafts/draft-v${r}.md`);
      judge = await judgeRound(draftText, feedbackText);
    }

    rounds.push({
      round: r,
      feedbackItems: countNumberedItems(feedbackText),
      revisionItems: countNumberedItems(notesText),
      scorerResult: scoreDraft(nextDraft),
      gateBlocked: gateRecords.some((g) => g.round === r && g.blocked),
      judge,
      supervisorInputTokens: spanInput,
      supervisorOutputTokens: spanOutput,
    });
  }

  const finalDraftVersion = criticRounds + 1;
  const finalDraftText = readVirtual(workDir, `/drafts/draft-v${finalDraftVersion}.md`);
  const finalScorerResult = scoreDraft(finalDraftText);

  const costUsd =
    (totalInputTokens / 1_000_000) * modelConfig.costPer1MInput +
    (totalOutputTokens / 1_000_000) * modelConfig.costPer1MOutput;

  return {
    langsmithRunId,
    criticRounds,
    capRefused,
    gateBlockCount,
    gateRecords: [...gateRecords],
    finalScorerResult,
    rounds,
    totalInputTokens,
    totalOutputTokens,
    elapsedMs,
    retryCount: retryStats.retryCount,
    costUsd,
  };
}

async function main(): Promise<void> {
  mkdirSync(RESULTS_DIR, { recursive: true });

  const modelConfig: ModelConfig = DEFAULT_MODEL_CONFIG;

  process.stdout.write('T-DA-07 — "Loses the Plot" Trace Analysis\n');
  process.stdout.write(`Model: ${modelConfig.modelId} | max ${MAX_ROUNDS} critic rounds\n`);
  process.stdout.write(`Known flaws seeded: ${KNOWN_FLAWS.length}\n`);
  process.stdout.write(`Baseline (T-DA-05): 1/${KNOWN_FLAWS.length} flaws fixed\n\n`);

  await pause();
  process.stdout.write('=== Run 1: Fix (RevisionGateMiddleware enabled) ===\n');
  const fixWorkDir = join(WORKSPACE_ROOT, `fix-${Date.now()}`);
  const fixResult = await runSupervisor(fixWorkDir, true, modelConfig);

  const finalScore = fixResult.finalScorerResult;
  const finalFlawsFixed = finalScore.status === 'scored' ? finalScore.flawsFixed : 0;
  const finalStatus = finalScore.status;
  process.stdout.write(
    `\n[fix] done — status=${finalStatus} flawsFixed=${finalFlawsFixed}/${KNOWN_FLAWS.length}\n`,
  );
  process.stdout.write(`  gate blocks: ${fixResult.gateBlockCount}\n`);
  process.stdout.write(`  critic rounds: ${fixResult.criticRounds}\n`);
  process.stdout.write(`  langsmith run: ${fixResult.langsmithRunId}\n`);
  for (const r of fixResult.rounds) {
    const rFixed = r.scorerResult.status === 'scored' ? r.scorerResult.flawsFixed : 'no-draft';
    process.stdout.write(
      `  round ${r.round}: feedback=${r.feedbackItems} revision=${r.revisionItems} ` +
        `gateBlocked=${r.gateBlocked} flawsFixed=${rFixed} ` +
        `precision=${r.judge ? r.judge.critiquePrecision.toFixed(3) : 'n/a'} ` +
        `tokens=${r.supervisorInputTokens}+${r.supervisorOutputTokens}\n`,
    );
  }

  const output = {
    experiment: 'trace-analysis',
    model: modelConfig.modelId,
    deepagents_version: '1.14.1',
    date: new Date().toISOString().slice(0, 10),
    task_id: 'T-DA-07',
    baseline: {
      source: 'T-DA-05 supervisor-results.json',
      langsmithRunId: '9a320206-8ffe-4cea-80cf-a8c13729dfe0',
      flawsFixed: 4,
      flawsFixedNote:
        'corrected from 1 — original scorer had false-positive F5 on empty draft; F2/F3 too strict',
      knownFlawsCount: KNOWN_FLAWS.length,
      criticRounds: 3,
      feedbackItemsPerRound: [10, 12, 17],
    },
    fix: {
      middleware: 'RevisionGateMiddleware',
      file: 'src/experiments/critique/feedback-coverage.ts',
      langsmithRunId: fixResult.langsmithRunId,
      scorerResult: finalScore,
      flawsFixed: finalStatus === 'scored' ? finalFlawsFixed : null,
      scorerStatus: finalStatus,
      knownFlawsCount: KNOWN_FLAWS.length,
      gateBlockCount: fixResult.gateBlockCount,
      gateRecords: fixResult.gateRecords,
      criticRounds: fixResult.criticRounds,
      capRefused: fixResult.capRefused,
      rounds: fixResult.rounds,
      totalInputTokens: fixResult.totalInputTokens,
      totalOutputTokens: fixResult.totalOutputTokens,
      costUsd: parseFloat(fixResult.costUsd.toFixed(6)),
      elapsedMs: fixResult.elapsedMs,
      retryCount: fixResult.retryCount,
    },
    gate: {
      metric: 'flaws_fixed_in_committed_draft',
      baseline_value: 4,
      pass_threshold: 4,
      // Gate uses revised baseline: ≥4/5 (not ≥3/5 as in original pre-registration)
      result: finalStatus === 'scored' && finalFlawsFixed >= 4 ? 'PASS' : 'FAIL',
      note: finalStatus === 'no-draft' ? 'process failure — no committed draft' : undefined,
    },
  };

  const outPath = join(RESULTS_DIR, 'results.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  process.stdout.write(`\nResults saved to ${outPath}\n`);
  process.stdout.write(`LangSmith run: ${fixResult.langsmithRunId}\n`);

  const gateResult = finalStatus === 'scored' && finalFlawsFixed >= 4 ? 'PASS' : 'FAIL';
  const gateNote = finalStatus === 'no-draft' ? ' (no-draft process failure)' : '';
  process.stdout.write(
    `\nGate: ${gateResult} — ${finalStatus === 'scored' ? finalFlawsFixed : 'no-draft'}/${KNOWN_FLAWS.length} flaws fixed (threshold: ≥4)${gateNote}\n`,
  );

  process.exit(0);
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
