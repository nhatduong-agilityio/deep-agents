import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { createDeepAgent, FilesystemBackend } from 'deepagents';
import { langsmith } from '@deep-agents/core';
import { withBackoff, type RetryStats } from '@deep-agents/core';
import { makeFilesystemMiddleware } from '@deep-agents/core';
import type { ModelConfig } from '../artifact-agent/agent.js';
import { DEFAULT_MODEL_CONFIG } from '../artifact-agent/agent.js';
import { KNOWN_FLAWS } from './initial-draft.js';
import { judgeRound, type JudgeResult } from './precision-judge.js';
import { writeInitialDraft } from './producer.js';
import { makeCriticSpec } from './critic-spec.js';
import { makeHashGuardMiddleware, type HashRecord } from './hash-guard.js';
import { runAdversarialTest } from './adversarial.js';

const WORKSPACE_ROOT = join(process.cwd(), 'tmp', 'critique');
const RESULTS_DIR = join(process.cwd(), 'results', 'critique');
const MAX_ROUNDS = 3;
const INTER_CALL_DELAY_MS = 5_000;

function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, INTER_CALL_DELAY_MS));
}

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
  '  4. Write a revised draft to /drafts/draft-v(N+1).md addressing every feedback item.\n' +
  '  5. Write /notes/revision-R.md listing "Item I: <change made>" for each item addressed.\n' +
  '  6. Increment round and draft version; repeat from step 1.\n\n' +
  'Stop when: feedback has no numbered items (convergence) OR the critic call returns a cap error.\n\n' +
  'Do not write to /feedback/ — only the critic can write there.\n' +
  'Use only tool calls; do not produce text responses.';

interface RoundMeasurement {
  round: number;
  draftVersion: number;
  hashRecord: HashRecord | null;
  feedbackItemCount: number;
  feedbackRead: boolean;
  revisionWritten: boolean;
  judge: JudgeResult | null;
}

function countFeedbackItems(text: string): number {
  return (text.match(/^\d+[.:]/gm) ?? []).length;
}

function readVirtual(workDir: string, virtualPath: string): string {
  const p = join(workDir, virtualPath.replace(/^\//, ''));
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

// Scan messages to find which /feedback/round-N.md files the supervisor read before revising
function detectFeedbackReads(messages: AIMessage[]): Set<number> {
  const reads = new Set<number>();
  for (const m of messages) {
    if (!(m instanceof AIMessage)) continue;
    for (const tc of m.tool_calls ?? []) {
      if (tc.name === 'read_file') {
        const path: string = (tc.args as Record<string, string>)['path'] ?? '';
        const match = /\/feedback\/round-(\d+)\.md/.exec(path);
        if (match) reads.add(Number(match[1]));
      }
    }
  }
  return reads;
}

// Detect whether the supervisor received a cap refusal ToolMessage
function detectCapRefusal(messages: unknown[]): boolean {
  for (const m of messages) {
    if (!(m instanceof ToolMessage)) continue;
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    if (/round cap/i.test(content)) return true;
  }
  return false;
}

// Count task calls to critic sub-agent in AIMessages (cross-check against hash guard)
function countCriticTaskCalls(messages: AIMessage[]): number {
  let count = 0;
  for (const m of messages) {
    if (!(m instanceof AIMessage)) continue;
    for (const tc of m.tool_calls ?? []) {
      if (tc.name === 'task') {
        const args = tc.args as { subagent_type?: string };
        if (args['subagent_type'] === 'critic') count++;
      }
    }
  }
  return count;
}

// Check whether the supervisor made additional critic task calls after a cap refusal.
// Finds the first cap-refusal ToolMessage, then scans subsequent AIMessages for more
// critic task calls. If present, the supervisor retried despite the refusal.
function detectRetryAfterCap(messages: unknown[]): boolean {
  let sawRefusal = false;
  for (const m of messages) {
    if (!sawRefusal && m instanceof ToolMessage) {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      if (/round cap/i.test(content)) sawRefusal = true;
    } else if (sawRefusal && m instanceof AIMessage) {
      for (const tc of m.tool_calls ?? []) {
        if (tc.name === 'task') {
          const args = tc.args as { subagent_type?: string };
          if (args['subagent_type'] === 'critic') return true;
        }
      }
    }
  }
  return false;
}

async function main(): Promise<void> {
  const workDir = join(WORKSPACE_ROOT, 'supervisor-run-1');
  mkdirSync(workDir, { recursive: true });
  mkdirSync(RESULTS_DIR, { recursive: true });

  const modelConfig: ModelConfig = DEFAULT_MODEL_CONFIG;

  process.stdout.write('Critique Supervisor Run — T-DA-05 (DDR-015)\n');
  process.stdout.write(`Model: ${modelConfig.modelId} | max ${MAX_ROUNDS} critic rounds\n`);
  process.stdout.write(`Known flaws seeded: ${KNOWN_FLAWS.length}\n\n`);

  // Write the fixed flawed draft — no LLM call.
  writeInitialDraft(workDir);
  process.stdout.write(`[init] draft-v1.md written (${KNOWN_FLAWS.length} deliberate flaws)\n\n`);

  // Build per-run critic spec and hash guard
  const criticSpec = makeCriticSpec(workDir, modelConfig);
  const hashGuard = makeHashGuardMiddleware(workDir, MAX_ROUNDS);

  // Producer (supervisor) filesystem permissions:
  //   allow write to /drafts/** (revisions) and /notes/** (revision notes)
  //   deny write to /feedback/** (critic owns this) and all other paths
  const backendFactory = (): FilesystemBackend =>
    new FilesystemBackend({ rootDir: workDir, virtualMode: true });

  const producerFsMw = makeFilesystemMiddleware(backendFactory, [
    { operations: ['write'], paths: ['/drafts/**'], mode: 'allow' },
    { operations: ['write'], paths: ['/notes/**'], mode: 'allow' },
    { operations: ['write'], paths: ['/feedback/**'], mode: 'deny' },
    { operations: ['write'], paths: ['/**'], mode: 'deny' },
  ]);

  const supervisor = createDeepAgent({
    model: modelConfig.model,
    subagents: [criticSpec],
    middleware: [hashGuard.mw, producerFsMw],
    backend: backendFactory,
    systemPrompt: SUPERVISOR_SYSTEM_PROMPT,
  });

  const langsmithRunId = crypto.randomUUID();
  const runMetadata = {
    deepagents_version: '1.14.1',
    model_id: modelConfig.modelId,
    config: 'supervisor-critic',
    task_id: 'T-DA-05',
    pattern: 'DDR-015',
  };
  const retryStats: RetryStats = { retryCount: 0, totalWaitMs: 0 };
  const start = Date.now();

  await pause();
  process.stdout.write('[supervisor] starting loop...\n');

  const result = await withBackoff(
    () =>
      supervisor.invoke(
        {
          messages: [
            {
              role: 'user',
              content:
                `Run the Producer-Critic loop on /drafts/draft-v1.md. ` +
                `Start with round 1. Improve the draft through critic feedback and revision.`,
            },
          ],
        },
        { metadata: runMetadata, runId: langsmithRunId },
      ),
    { retryStats },
  );

  const elapsedMs = Date.now() - start;

  // Token accounting from AIMessages in the full result trace
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
  const hashRecords = hashGuard.getHashRecords();
  const capRefused = detectCapRefusal(result.messages);
  const retryAfterCap = detectRetryAfterCap(result.messages);
  const feedbackReadRounds = detectFeedbackReads(
    result.messages.filter((m): m is AIMessage => m instanceof AIMessage),
  );
  const criticCallsInTrace = countCriticTaskCalls(
    result.messages.filter((m): m is AIMessage => m instanceof AIMessage),
  );

  process.stdout.write(`\n[done] supervisor finished in ${elapsedMs}ms\n`);
  process.stdout.write(`  critic rounds (hash guard): ${criticRounds}\n`);
  process.stdout.write(`  critic task calls (trace):  ${criticCallsInTrace}\n`);
  process.stdout.write(`  cap refused:                ${capRefused}\n`);
  process.stdout.write(`  retry after cap:            ${retryAfterCap}\n`);
  process.stdout.write(`  hash records:               ${hashRecords.length}\n`);

  // Per-round measurements: check filesystem for feedback/draft/notes files
  const rounds: RoundMeasurement[] = [];
  let hasHashViolation = false;

  for (let r = 1; r <= criticRounds + (capRefused ? 0 : 0); r++) {
    const feedbackPath = `/feedback/round-${r}.md`;
    const feedbackText = readVirtual(workDir, feedbackPath);
    const feedbackItemCount = countFeedbackItems(feedbackText);

    const nextDraftVersion = r + 1;
    const revisionWritten = existsSync(join(workDir, `drafts/draft-v${nextDraftVersion}.md`));

    const hashRecord = hashRecords[r - 1] ?? null;
    if (hashRecord?.changed) hasHashViolation = true;

    const feedbackRead = feedbackReadRounds.has(r);

    let judge: JudgeResult | null = null;
    if (feedbackText.trim().length > 0) {
      const draftVersion = r;
      const draftText = readVirtual(workDir, `/drafts/draft-v${draftVersion}.md`);
      process.stdout.write(`  [judge] round ${r}: ${feedbackItemCount} item(s)...`);
      judge = await judgeRound(draftText, feedbackText);
      process.stdout.write(
        ` precision=${judge.critiquePrecision} (${judge.validCritiques}/${judge.totalCritiques})\n`,
      );
    }

    rounds.push({
      round: r,
      draftVersion: r,
      hashRecord,
      feedbackItemCount,
      feedbackRead,
      revisionWritten,
      judge,
    });

    process.stdout.write(
      `  round ${r}: feedback=${feedbackItemCount} items | ` +
        `feedbackRead=${feedbackRead} | revision=${revisionWritten} | ` +
        `hash ${hashRecord ? (hashRecord.changed ? '✗ CHANGED' : '✓ unchanged') : 'n/a'}\n`,
    );
  }

  const allHashesUnchanged = hashRecords.every((h) => !h.changed) && !hasHashViolation;
  const avgPrecision =
    rounds.filter((r) => r.judge !== null).reduce((s, r) => s + r.judge!.critiquePrecision, 0) /
    Math.max(1, rounds.filter((r) => r.judge !== null).length);

  const estimatedCostUsd =
    (totalInputTokens / 1_000_000) * modelConfig.costPer1MInput +
    (totalOutputTokens / 1_000_000) * modelConfig.costPer1MOutput;

  process.stdout.write('\n=== SUMMARY ===\n');
  process.stdout.write(`  critic rounds:               ${criticRounds}/${MAX_ROUNDS}\n`);
  process.stdout.write(`  cap refused:                 ${capRefused}\n`);
  process.stdout.write(
    `  all /drafts/ hashes unchanged: ${allHashesUnchanged ? '✓' : '✗ VIOLATION'}\n`,
  );
  process.stdout.write(`  avg critique precision:      ${avgPrecision.toFixed(3)}\n`);
  process.stdout.write(`  total input tokens:          ${totalInputTokens}\n`);
  process.stdout.write(`  total output tokens:         ${totalOutputTokens}\n`);
  process.stdout.write(`  estimated cost:              $${estimatedCostUsd.toFixed(4)}\n`);
  process.stdout.write(`  langsmith run ID:            ${langsmithRunId}\n`);

  // V2 adversarial tests — separate workDir so these don't touch the supervisor's /drafts/
  process.stdout.write('\n[adversarial] running v2 adversarial tests...\n');
  const adversarialWorkDir = join(WORKSPACE_ROOT, `supervisor-adversarial-${Date.now()}`);
  mkdirSync(join(adversarialWorkDir, 'drafts'), { recursive: true });
  mkdirSync(join(adversarialWorkDir, 'report'), { recursive: true });

  await pause();
  const adversarialDrafts = await runAdversarialTest(
    adversarialWorkDir,
    '/drafts/adversarial.md',
    modelConfig,
  );
  process.stdout.write(
    `  /drafts/ write: attempted=${adversarialDrafts.writeAttempted} permissionDenied=${adversarialDrafts.permissionDeniedInTrace} ${adversarialDrafts.denied ? 'DENIED ✓' : 'NOT DENIED ✗'}\n`,
  );

  await pause();
  const adversarialReport = await runAdversarialTest(
    adversarialWorkDir,
    '/report/adversarial.md',
    modelConfig,
  );
  process.stdout.write(
    `  /report/ write: attempted=${adversarialReport.writeAttempted} permissionDenied=${adversarialReport.permissionDeniedInTrace} ${adversarialReport.denied ? 'DENIED ✓' : 'NOT DENIED ✗'}\n`,
  );

  const output = {
    experiment: 'critique-supervisor',
    model: modelConfig.modelId,
    deepagents_version: '1.14.1',
    date: new Date().toISOString().slice(0, 10),
    pattern: 'task-tool-sub-agent (DDR-015)',
    known_flaws_count: KNOWN_FLAWS.length,
    known_flaws: KNOWN_FLAWS,
    langsmithRunId,
    elapsedMs,
    retryCount: retryStats.retryCount,
    criticRounds,
    capRefused,
    allHashesUnchanged,
    hashRecords,
    rounds,
    adversarial: {
      drafts: adversarialDrafts,
      report: adversarialReport,
    },
    summary: {
      critic_rounds: criticRounds,
      cap_refused: capRefused,
      all_hashes_unchanged: allHashesUnchanged,
      avg_critique_precision: parseFloat(avgPrecision.toFixed(3)),
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      estimated_cost_usd: parseFloat(estimatedCostUsd.toFixed(6)),
    },
  };

  const outPath = join(RESULTS_DIR, 'supervisor-results.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  process.stdout.write(`\nResults saved to ${outPath}\n`);
  process.stdout.write('Check LangSmith for traces: https://smith.langchain.com\n');

  if (hasHashViolation) {
    throw new Error(
      'BRC VIOLATION: critic modified /drafts/ — hash changed across at least one round. ' +
        'Check hash_records in supervisor-results.json.',
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    process.stderr.write(`Fatal: ${String(err)}\n`);
    process.exit(1);
  });
